#!/bin/bash
set -e

# 1. Check Dependencies First (so background logs don't interrupt the prompt)

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

# 2. Start Backend
echo -e "\nStarting SprintLogic Backend (FastAPI)..."
cd apps/api
.venv/bin/uvicorn main:app --reload --port 8000 &
BACKEND_PID=$!
cd ../..

trap "echo 'Shutting down SprintLogic Backend (PID: $BACKEND_PID)...'; kill $BACKEND_PID" EXIT

# 3. Start Frontend
cd apps/web
if command -v cargo &> /dev/null
then
    echo "Starting SprintLogic Frontend (Tauri Desktop)..."
    npx @tauri-apps/cli dev
else
    echo "Starting SprintLogic Frontend (Web Fallback)..."
    npm run dev
fi
