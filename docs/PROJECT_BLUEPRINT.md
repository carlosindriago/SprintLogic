# SprintLogic — Project Blueprint

## 1. Visión del producto
SprintLogic es una **Aplicación de Escritorio Local (Linux First)** de código abierto, diseñada exclusivamente para el desarrollador individual. Actúa como un centro de comando integral que optimiza el flujo de desarrollo mediante la integración profunda con repositorios locales, automatización guiada por IA (asistente Jarvis) basándose en el ciclo SDD/TDD, y un control riguroso de Git.

## 2. Propuesta de valor
- **SDD & TDD Nativos**: El asistente Jarvis ayuda a estructurar el diseño (Proposal, Specs, Design, Tasks) antes de escribir código, y acompaña en la escritura de los tests.
- **Git Perfection**: Control y sugerencia de nombres de ramas y commits atómicos sin fricción. Todo vinculado directamente a las tareas del board Kanban.
- **Privacidad Local Absoluta**: Sin multi-tenancy. Sin bases de datos en la nube. Toda la información del proyecto y del trabajo reside en un archivo SQLite local, y la clave API de IA (Gemini) se guarda exclusivamente en tu máquina.
- **Fricción Cero**: Al ser una app local, interactúa de inmediato con tus repositorios locales sin integraciones engorrosas por API.

## 3. Alcance MVP
El foco es el desarrollador solitario.
- Entorno de escritorio local (Tauri).
- Base de datos SQLite.
- Asistente IA (Jarvis) con Gemini local para la planificación de proyectos y asistencia en commits.
- Control visual del historial de Git local.
- Focus Timer integrado al log de la máquina.

*Se eliminan explícitamente*: multi-tenancy, autenticación en la nube, Docker corporativo, infraestructura de red externa.

## 4. Filosofía de diseño y uso
- **Local First**: Toda la data vive contigo.
- **Control Humano**: La IA (Jarvis) asiste y sugiere, nunca ejecuta destructivamente sin confirmación.
- **Clean Code & Architecture**: Predicar con el ejemplo aplicando los mismos estándares al propio desarrollo de SprintLogic.
