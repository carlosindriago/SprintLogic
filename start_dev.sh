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
if ! command -v cargo &> /dev/null
then
    echo "[WARNING] Rust/Cargo no está instalado. Iniciando SprintLogic en modo Web (Fallback)..."
    echo "Para compilar la aplicación de escritorio, instala Rust: https://tauri.app/v1/guides/getting-started/prerequisites"
    npm run dev
else
    echo "Starting SprintLogic Frontend (Tauri Desktop)..."
    npx @tauri-apps/cli dev
fi
