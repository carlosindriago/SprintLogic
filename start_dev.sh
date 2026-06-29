#!/bin/bash
set -e

echo "Starting SprintLogic Backend (FastAPI)..."
cd apps/api
.venv/bin/uvicorn main:app --reload --port 8000 &
BACKEND_PID=$!
cd ../..

# Capturamos la señal de salida para limpiar los procesos en segundo plano
trap "echo 'Shutting down SprintLogic Backend (PID: $BACKEND_PID)...'; kill $BACKEND_PID" EXIT

cd apps/web

# Check Dependencies
if ! command -v cargo &> /dev/null
then
    echo -e "\n[!] Rust/Cargo no está instalado (Requerido para la App de Escritorio Tauri)."
    read -p "¿Deseas instalar Rust automáticamente ahora? (y/n): " install_rust
    if [[ "$install_rust" =~ ^[Yy]$ ]]
    then
        echo "Instalando Rust..."
        curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
        # Intentar cargar las variables de entorno de Rust
        source "$HOME/.cargo/env" || true
        echo "Rust instalado exitosamente."
        
        # Opcional: Instalar dependencias de sistema para Linux (Ubuntu/Debian)
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
        echo "[WARNING] Iniciando SprintLogic en modo Web (Fallback)..."
        npm run dev
        # Matamos el backend si cerramos el modo web
        exit 0
    fi
fi

# Volvemos a comprobar si Cargo existe tras la instalación
if command -v cargo &> /dev/null
then
    echo "Starting SprintLogic Frontend (Tauri Desktop)..."
    npx @tauri-apps/cli dev
else
    echo "[ERROR] No se pudo encontrar Cargo. Por favor reinicia tu terminal."
fi
