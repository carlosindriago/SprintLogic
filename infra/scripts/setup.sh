#!/bin/bash
set -e

echo "🚀 Iniciando setup del entorno local para SprintLogic..."

echo "📦 Instalando dependencias de la API (Python)..."
cd apps/api
python3 -m venv .venv
source .venv/bin/activate
pip install --upgrade pip
pip install -e ".[dev]"
cd ../..

echo "📦 Instalando dependencias Web (Next.js)..."
cd apps/web
npm install
cd ../..

echo "🗄️ Inicializando base de datos SQLite local..."
cd apps/api
source .venv/bin/activate
alembic upgrade head
cd ../..

echo "✅ Setup completado exitosamente."
echo "Para iniciar la API: cd apps/api && uvicorn main:app --reload"
echo "Para iniciar la Web: cd apps/web && npm run dev"
