# Roadmap de Desarrollo — SprintLogic Desktop

## Fase 1 — Entorno de Escritorio Local y Base de Datos SQLite
- Configurar Tauri wrapper para el frontend (Next.js).
- Configurar sidecar / API local en FastAPI (Python).
- Sustituir la base de datos de PostgreSQL a SQLite.
- Eliminar la lógica de autenticación y multi-tenancy.
- Diseño inicial del shell de la aplicación (Sidebar, Layout base).

## Fase 2 — Planificador de Proyectos asistido por Jarvis (IA)
- Configurar input para API Key de Gemini y guardado seguro local.
- Creación de interfaz de chat/asistente para Jarvis.
- Pipeline SDD: De descripción abstracta a `proposal.md`, `specs/`, `design.md`, `tasks.md`.
- Exportación estructurada a formato JSON y guardado en disco del plan.
- Volcado automático del JSON al Kanban (Backlog local).
- **Fase 2.4**: Codebase Memory Graph (Conexión SDD -> AST Nodos).
- **Fase 2.5**: Engram Persistent Memory (Tabla de decisiones y resúmenes).
- **Fase 2.6**: Context7 Dependency RAG (Parseo de dependencias y sqlite-vec).

## Fase 3 — Control de Git local y Commits Atómicos
- Integrar lectura de repositorios Git locales desde el sistema de archivos.
- Vinculación del repositorio con el proyecto en SQLite.
- Interfaz gráfica para ramas, diffs y pre-visualización de commits.
- Jarvis Assistant: sugerencia automática de nombres de rama y mensajes de commits atómicos basados en la tarea del board activa.

## Fase 4 — Codebase Memory Graph (Visualización 2D & AST)
- Análisis del código fuente mediante `tree-sitter` (Python) para extraer el AST.
- Guardado del mapa estructural en SQLite.
- Renderizado 2D de alta performance en el frontend (Next.js) utilizando `react-force-graph-2d`.
- Vinculación SDD-AST: Jarvis relacionará las tareas del `TaskBreakdown` directamente con los nodos AST (`affectedNodes`) que el desarrollador debe tocar.

## Fase 5 — Focus Timer Integrado
- Implementación del timer de foco (Pomodoro) por tarea.
- Vinculación del tiempo de trabajo al log local de la máquina y a la base de datos de SQLite.
- Resumen básico de sesión.

## Fases Futuras (Post-MVP)
- Analytics locales (Throughput, Cycle Time).
- Reporting a Markdown / PDF para compartir con clientes o managers.
- Soporte para arquitecturas de equipos o modelo SaaS auto-alojado.
