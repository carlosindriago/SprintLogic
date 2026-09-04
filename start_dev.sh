#!/bin/bash
# SprintLogic dev launcher.
#
# Lifecycle guarantees:
#   * Every child process (Uvicorn, the Uvicorn --reload watcher, npm,
#     Next.js dev server, Tauri/Cargo, etc.) is started inside a single
#     process group rooted at this script.
#   * A multi-signal trap (INT/TERM/EXIT) sends SIGTERM to the entire
#     process group, then escalates to SIGKILL if anything refuses to
#     die. This guarantees that Ctrl+C (SIGINT) — the most common
#     termination path — does not leave orphaned uvicorn/node/cargo
#     processes behind.
#
# Why `-- -$$` (negative PID):
#   In bash, a negative argument to `kill` is interpreted as a process
#   group ID. `$$` is this script's PID, so `-- -$$` targets the group
#   of the script itself, which is inherited by every child process
#   started after `set -m`.

set -e
set -m

CHILD_PIDS=()

cleanup() {
    # Ignore signals to prevent this script from killing itself
    # when it sends signals to its own process group.
    trap '' INT TERM EXIT

    local signal_name="${1:-EXIT}"
    echo
    echo "[start_dev] Caught ${signal_name}. Shutting down process group..."
    # SIGTERM first for a graceful exit, then SIGKILL after a short grace
    # period for any stubborn child.
    if [[ ${#CHILD_PIDS[@]} -gt 0 ]]; then
        kill "${CHILD_PIDS[@]}" 2>/dev/null || true
    fi
    # Kill the whole process group; catches grandchildren that are not
    # direct children of this shell (e.g. cargo spawning rustc).
    kill -- -"$$" 2>/dev/null || true
    # Wait briefly for graceful shutdown.
    sleep 1
    # Force-kill anything still alive.
    echo "[start_dev] Sending SIGKILL to process group to ensure complete shutdown."
    kill -9 -- -"$$" 2>/dev/null || true
    # The script will be killed by the above command.
}

# Register the trap BEFORE starting any background process. EXIT covers
# normal termination, INT covers Ctrl+C, TERM covers kill/killall.
trap 'cleanup INT' INT
trap 'cleanup TERM' TERM
trap 'cleanup EXIT' EXIT

# 1. Toolchain checks --------------------------------------------------------

# Ensure Rust environment is loaded if it was already installed but not in PATH
if [ -f "$HOME/.cargo/env" ]; then
    source "$HOME/.cargo/env"
fi

if ! command -v cargo &> /dev/null
then
    echo -e "\n[!] Rust/Cargo no está instalado (Requerido para la App de Escritorio Tauri)."
    read -p "¿Deseas instalar Rust automáticamente ahora? (y/n): " install_rust
    if [[ "$install_rust" =~ ^[Yy]$ ]]
    then
        echo "Instalando Rust..."
        curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
        source "$HOME/.cargo/env" || true
        echo "Rust instalado exitosamente."

        if command -v apt-get &> /dev/null
        then
            echo -e "\n[!] Tauri requiere algunas dependencias del sistema en Linux (Webkit2GTK, build-essential, etc)."
            read -p "¿Deseas instalarlas ahora vía apt-get? (Requiere sudo) (y/n): " install_apt
            if [[ "$install_apt" =~ ^[Yy]$ ]]
            then
                sudo apt-get update
                sudo apt-get install -y libwebkit2gtk-4.1-dev build-essential curl wget file libssl-dev libgtk-3-dev libayatana-appindicator3-dev librsvg2-dev
            fi
        fi
    else
        echo "[WARNING] Rust no instalado. Solo se iniciará en modo Web (Fallback)..."
    fi
fi

# 2. Cleanup stray and orphaned processes -----------------------------------
#
# SprintLogic runs *alongside* whatever project the developer is actively
# working on. It must never claim or evict a port (or kill a process) that
# might belong to that other project — only reap a process that is
# unambiguously a leftover SprintLogic instance from a previous run.

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# reap_stray_port PORT
# Kills whatever is listening on PORT only if it is provably a SprintLogic
# process from this exact checkout — otherwise it refuses and exits, so
# the developer can decide. Never silently evicts a foreign process.
#
# Identity is checked via the process's *working directory*
# (/proc/PID/cwd), not its command line: our own processes are launched
# with relative-path binaries (e.g. ".venv/bin/uvicorn" from within
# apps/api), so argv never contains this repo's absolute path — cwd is the
# only reliable signal here.
reap_stray_port() {
    local port="$1"
    local pids
    pids=$(fuser "${port}/tcp" 2>/dev/null) || return 0

    local pid pid_cwd
    for pid in $pids; do
        pid_cwd=$(readlink -f "/proc/${pid}/cwd" 2>/dev/null || true)
        if [[ -n "$pid_cwd" && "$pid_cwd" == "$REPO_ROOT"* ]]; then
            echo "[start_dev] Reaping stray SprintLogic process on port ${port} (pid ${pid}, cwd ${pid_cwd})."
            kill -9 "$pid" 2>/dev/null || true
        else
            echo "[!] Port ${port} is already in use by another process (pid ${pid}), and it does" >&2
            echo "    not belong to this SprintLogic checkout. Refusing to kill it automatically —" >&2
            echo "    it may be a project you're actively working on." >&2
            echo "    Free the port yourself (or stop that process) and re-run this script." >&2
            exit 1
        fi
    done
}

echo -e "\nChecking for stray or orphaned SprintLogic processes..."
pkill -f "${REPO_ROOT}/apps/web/src-tauri/target/debug/app" 2>/dev/null || true
pkill -f "${REPO_ROOT}/apps/web/.next/dev/build/postcss.js" 2>/dev/null || true

# Tauri's devUrl is fixed at build/config time (tauri.conf.json), so the
# frontend dev port can't be made dynamic here — but we still refuse to
# evict a foreign process on it (see reap_stray_port above).
reap_stray_port 3420

# The backend has no such constraint outside Tauri (Tauri itself spawns its
# own sidecar on a random OS-assigned port, see app/main.py). In --web
# fallback mode, probe for the first free port instead of assuming 8000 is
# free; BACKEND_PORT is exported so the web-mode branch below (and the
# frontend, via NEXT_PUBLIC_API_URL) can pick it up.
BACKEND_PORT=8000
while fuser "${BACKEND_PORT}/tcp" >/dev/null 2>&1; do
    BACKEND_PORT=$((BACKEND_PORT + 1))
done
if [[ "$BACKEND_PORT" != 8000 ]]; then
    echo "[start_dev] Port 8000 is in use by another process; using ${BACKEND_PORT} for the backend instead."
fi
export BACKEND_PORT

# 3. Start Application -------------------------------------------------------

if command -v cargo &> /dev/null && [[ "$1" != "--web" ]]; then
    echo -e "\nStarting SprintLogic Desktop (Tauri manages backend sidecar)..."
    cd apps/web
    npx @tauri-apps/cli dev &
    FRONTEND_PID=$!
    CHILD_PIDS+=("$FRONTEND_PID")
    cd ../..
    echo "[start_dev] Desktop Tauri PID: ${FRONTEND_PID}"
else
    echo -e "\nStarting SprintLogic Backend (FastAPI) on port ${BACKEND_PORT}..."
    cd apps/api
    .venv/bin/uvicorn app.main:app --reload --port "$BACKEND_PORT" &
    BACKEND_PID=$!
    CHILD_PIDS+=("$BACKEND_PID")
    cd ../..
    echo "[start_dev] Backend PID: ${BACKEND_PID}"

    echo "[start_dev] Waiting for backend to start listening on port ${BACKEND_PORT}..."
    while ! bash -c "true < /dev/tcp/127.0.0.1/${BACKEND_PORT}" 2>/dev/null; do
        sleep 1
    done
    echo "[start_dev] Backend is up and listening on port ${BACKEND_PORT}!"

    echo -e "\nStarting SprintLogic Frontend (Web Mode)..."
    cd apps/web
    NEXT_PUBLIC_API_URL="http://127.0.0.1:${BACKEND_PORT}/api/v1" npm run dev &
    FRONTEND_PID=$!
    CHILD_PIDS+=("$FRONTEND_PID")
    cd ../..
    echo "[start_dev] Frontend PID: ${FRONTEND_PID}"
fi

# 4. Wait for children -------------------------------------------------------
echo
echo "[start_dev] Processes running. Press Ctrl+C to stop everything cleanly."
wait -n "${CHILD_PIDS[@]}" 2>/dev/null || true

echo "[start_dev] Process exited. Cleaning up the rest."
