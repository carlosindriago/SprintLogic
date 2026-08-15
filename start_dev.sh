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

echo -e "\nChecking for stray or orphaned SprintLogic processes..."
pkill -f "target/debug/app" 2>/dev/null || true
pkill -f "apps/web/.next/dev/build/postcss.js" 2>/dev/null || true

if fuser 8000/tcp >/dev/null 2>&1; then
    echo "[!] Port 8000 is occupied. Cleaning it up..."
    fuser -k -9 8000/tcp >/dev/null 2>&1 || true
    sleep 1
fi

if fuser 3420/tcp >/dev/null 2>&1; then
    echo "[!] Port 3420 is occupied. Cleaning it up..."
    fuser -k -9 3420/tcp >/dev/null 2>&1 || true
    sleep 1
fi

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
    echo -e "\nStarting SprintLogic Backend (FastAPI)..."
    cd apps/api
    .venv/bin/uvicorn app.main:app --reload --port 8000 &
    BACKEND_PID=$!
    CHILD_PIDS+=("$BACKEND_PID")
    cd ../..
    echo "[start_dev] Backend PID: ${BACKEND_PID}"

    echo "[start_dev] Waiting for backend to start listening on port 8000..."
    while ! bash -c 'true < /dev/tcp/127.0.0.1/8000' 2>/dev/null; do
        sleep 1
    done
    echo "[start_dev] Backend is up and listening on port 8000!"

    echo -e "\nStarting SprintLogic Frontend (Web Mode)..."
    cd apps/web
    npm run dev &
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
