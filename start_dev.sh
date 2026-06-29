#!/bin/bash
set -e

echo "Starting SprintLogic Backend (FastAPI)..."
cd apps/api
# Usamos app.main:app ya que la app FastAPI suele estar instanciada ahí.
.venv/bin/uvicorn app.main:app --reload --port 8000 &
BACKEND_PID=$!
cd ../..

# Capturamos la señal de salida para limpiar los procesos en segundo plano
trap "echo 'Shutting down SprintLogic Backend (PID: $BACKEND_PID)...'; kill $BACKEND_PID" EXIT

echo "Starting SprintLogic Frontend (Tauri)..."
cd apps/web
npx tauri dev
