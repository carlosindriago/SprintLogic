# Arquitectura Técnica — SprintLogic Desktop

## 1. Stack Recomendado

La plataforma evoluciona de un SaaS web a una **Arquitectura de Escritorio**:
- **Wrapper de Escritorio**: [Tauri](https://tauri.app/) (ideal para empaquetar aplicaciones web con bajo consumo de recursos en Linux/Windows/Mac).
- **Frontend Web**: Next.js + React + TypeScript + TailwindCSS.
- **Backend / Core Lógico**: FastAPI (Python) corriendo como un sidecar local ejecutable que proporciona la API de sistema a la vista de Tauri, o lógica Rust directa de Tauri si se decide eliminar Python. En esta iteración, se mantiene **FastAPI/Python local** para aprovechar la compatibilidad con frameworks de IA y LangChain.

## 2. Persistencia y Almacenamiento

- **Motor**: SQLite.
- **Fuente de verdad**: Un único archivo `.db` alojado en el sistema de archivos local del usuario (ej. `~/.config/sprintlogic/data.db`).
- **Migraciones**: Alembic (gestionando el esquema local de SQLite).

Se abandona el uso de PostgreSQL y Redis. Toda la persistencia es estrictamente embebida y local.

## 3. Seguridad y Privacidad

- **Zero Cloud Data**: Los datos nunca salen de la máquina del desarrollador. No existen tenants, no existe SaaS, no hay base de datos compartida.
- **API Keys**: La integración con IA (Jarvis usando Gemini) requiere una API key que se guarda cifrada de forma segura **solo a nivel local**.
- **Control local**: Los repositorios Git a gestionar se escanean directamente del sistema de archivos local, eliminando la necesidad de dar accesos OAuth a plataformas como GitHub o GitLab.

## 4. Motor de IA (Jarvis) y SDD Pipeline

El backend expone rutas locales para interactuar con la IA de forma estructurada:
- Generación asíncrona de archivos `proposal.md`, `specs/`, `design.md`, `tasks.md`.
- Generación y exportación de archivos JSON estáticos con la estructura del proyecto en el disco local para respaldo o uso offline.

## 5. Integración Git

El backend utilizará comandos de sistema o librerías nativas (`GitPython` o invocaciones de shell asíncronas) para rastrear el `cwd` (Current Working Directory) de los proyectos, observar ramas, hacer diffs y lanzar commits.
