#!/bin/bash
set -e

echo "[1/4] Activando entorno virtual..."
source .venv/bin/activate

echo "[2/4] Verificando dependencias críticas (ONNX, sqlite-vec)..."
# Asegurarse de que PyInstaller esté instalado
if ! command -v pyinstaller &> /dev/null; then
    echo "Instalando PyInstaller..."
    pip install pyinstaller
fi

# El target triple que Tauri espera para Linux 64-bit
TARGET_TRIPLE="x86_64-unknown-linux-gnu"
OUTPUT_BINARY="sprintlogic-backend-${TARGET_TRIPLE}"
TAURI_BIN_DIR="../web/src-tauri/bin"

echo "[3/4] Compilando con PyInstaller..."

# Notas de empaquetado:
# 1. --hidden-import: Forza a empacar las dependencias asíncronas dinámicas de Uvicorn/FastAPI.
# 2. --add-binary: Asegura que la biblioteca C de sqlite-vec se incluya.
# 3. --add-data: (Agrega aquí rutas a modelos ONNX u otros estáticos si aplican)

pyinstaller --noconfirm --onefile --console \
    --name "sprintlogic-backend" \
    --hidden-import "uvicorn.logging" \
    --hidden-import "uvicorn.loops" \
    --hidden-import "uvicorn.loops.auto" \
    --hidden-import "uvicorn.protocols" \
    --hidden-import "uvicorn.protocols.http" \
    --hidden-import "uvicorn.protocols.http.auto" \
    --hidden-import "uvicorn.protocols.websockets" \
    --hidden-import "uvicorn.protocols.websockets.auto" \
    --hidden-import "uvicorn.lifespan.on" \
    --hidden-import "uvicorn.lifespan.off" \
    --hidden-import "aiosqlite" \
    --hidden-import "sqlalchemy.ext.asyncio" \
    --collect-data "litellm" \
    --copy-metadata "litellm" \
    --add-binary ".venv/lib/python3.14/site-packages/sqlite_vec/vec0.so:sqlite_vec" \
    app/main.py

echo "[4/4] Copiando binario al directorio de Tauri Sidecars..."
mkdir -p "$TAURI_BIN_DIR"
cp "dist/sprintlogic-backend" "$TAURI_BIN_DIR/$OUTPUT_BINARY"
chmod +x "$TAURI_BIN_DIR/$OUTPUT_BINARY"

echo "¡Forja Completada! Binario sidecar disponible en: $TAURI_BIN_DIR/$OUTPUT_BINARY"
