#!/bin/bash
set -e

echo "Starting SprintLogic Backend (FastAPI)..."
cd apps/api
.venv/bin/uvicorn main:app --reload --port 8000 &
BACKEND_PID=$!
cd ../..

# Capturamos la señal de salida para limpiar los procesos en segundo plano
trap "echo 'Shutting down SprintLogic Backend (PID: $BACKEND_PID)...'; kill $BACKEND_PID" EXIT

echo "Starting SprintLogic Frontend (Tauri)..."
cd apps/web
npx @tauri-apps/cli dev
