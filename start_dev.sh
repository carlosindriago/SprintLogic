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
    # Remove traps FIRST to prevent infinite recursion when kill -$$
    # delivers a signal back to this script.
    trap - INT TERM EXIT

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
    kill -9 -- -"$$" 2>/dev/null || true
    # Reap direct children to avoid zombies.
    for pid in "${CHILD_PIDS[@]}"; do
        wait "$pid" 2>/dev/null || true
    done
    echo "[start_dev] Cleanup complete."
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

# 2. Port cleanup -----------------------------------------------------------

echo -e "\nChecking if port 8000 is free..."
if lsof -Pi :8000 -sTCP:LISTEN -t >/dev/null ; then
    echo "[!] Port 8000 is occupied. Cleaning it up..."
    # Only kill the listener on the exact port; do NOT kill -9 the
    # entire process group here because the previous launcher should
    # have already cleaned up.
    kill -9 $(lsof -t -i:8000) 2>/dev/null || true
    sleep 1
fi

# 3. Start Backend -----------------------------------------------------------

echo -e "\nStarting SprintLogic Backend (FastAPI)..."
cd apps/api
.venv/bin/uvicorn app.main:app --reload --port 8000 &
BACKEND_PID=$!
CHILD_PIDS+=("$BACKEND_PID")
cd ../..
echo "[start_dev] Backend PID: ${BACKEND_PID}"

# 4. Start Frontend (in background so this script can own the lifecycle) ---

cd apps/web
if command -v cargo &> /dev/null
then
    echo "Starting SprintLogic Frontend (Tauri Desktop)..."
    npx @tauri-apps/cli dev &
    FRONTEND_PID=$!
else
    echo "Starting SprintLogic Frontend (Web Fallback)..."
    npm run dev &
    FRONTEND_PID=$!
fi
CHILD_PIDS+=("$FRONTEND_PID")
cd ../..
echo "[start_dev] Frontend PID: ${FRONTEND_PID}"

# 5. Wait for both children. `wait` with multiple PIDs exits as soon as
#    one of them terminates; we want to keep the script alive until the
#    user kills it or one of the children dies.
echo
echo "[start_dev] Both processes running. Press Ctrl+C to stop everything."
echo "             Backend  (uvicorn):  PID ${BACKEND_PID}"
echo "             Frontend (${FRONTEND_CMD:-web}): PID ${FRONTEND_PID}"

# Block until either child exits (e.g. a crash) or the user hits Ctrl+C.
wait -n "${CHILD_PIDS[@]}" 2>/dev/null || true

# If we reach here naturally (one of the children died), the EXIT trap
# takes care of killing the rest.
echo "[start_dev] A child process exited. Cleaning up the rest."
