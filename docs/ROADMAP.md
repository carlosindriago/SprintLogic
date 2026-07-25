# Development Roadmap — SprintLogic Desktop

## Phase 1 — Local Desktop Environment and SQLite Database (✅ Completed)
- Configure Tauri wrapper for the frontend (Next.js).
- Configure sidecar / local API in FastAPI (Python).
- Switch the database from PostgreSQL to SQLite.
- Remove authentication and multi-tenancy logic.
- Initial design of the application shell (Sidebar, Base Layout).

## Phase 2 — Project Planner Assisted by SprintLogic AI (✅ Completed)
- Configure input for Gemini API Key and secure local storage.
- Create chat/assistant interface for SprintLogic AI.
- SDD Pipeline: From abstract description to `proposal.md`, `specs/`, `design.md`, `tasks.md`.
- Structured export to JSON format and save plan to disk.
- Automatic dump of JSON to the Kanban (Local Backlog).
- Interactive Kanban Board Implementation.
- Persistent Sticky Notes workspace integration.

## Phase 3 — Intelligent Code Editor & Code Coach (✅ Completed)
- Monaco Editor Integration for reading/writing project code.
- Interactive AI Contextual Mentorship (Code Coach).
- Native TypeScript Linter (TSServer) error injection into the AI context.
- Implement "Quick Fix" Code Actions directly from AI refactoring suggestions.
- Implement Optimistic Concurrency Control (ETag/MD5 Content Hashes).
- Fill-in-the-Middle (FIM) Ghost Text completion.

## Phase 4 — Codebase Memory Graph & Advanced IDE (🔄 In Progress)
- Source code analysis using `tree-sitter` (Python) to extract the AST.
- Save structural map in SQLite.
- High-performance 2D rendering in the frontend (Next.js) using `react-force-graph-2d`.
- **Autonomous Execution Agent (El Quirófano)**: AST-safe Unified diff patching to automatically implement AI solutions. (✅ Completed)
- **Internationalization (i18n)**: Multi-language support and Language selection (✅ Completed)
- **Prompt Registry**: Database-driven prompt templates via Enterprise Settings (✅ Completed)
- SDD-AST Linking: SprintLogic AI will link `TaskBreakdown` tasks directly to the AST nodes (`affectedNodes`) that the developer needs to touch.
- **Phase 4.5**: SprintLogic Persistent Memory (Decisions table and session summaries).
- **Phase 4.6**: Context7 Dependency RAG (Dependency parsing and sqlite-vec).

## Phase 5 — Local Git Control & Atomic Commits (🔄 In Progress)
- Integrate reading local Git repositories from the file system.
- Link repository with the project in SQLite.
- Automatic creation of Git branches from Kanban ticket movement (✅ Completed).
- GUI for branches, diffs, and commit preview.
- SprintLogic AI Assistant: automatic suggestion of branch names and atomic commit messages based on the active board task.

## Phase 6 — Integrated Focus Timer & Telemetry (✅ Completed)
- Implement focus timer (Pomodoro) per task.
- Telemetry Daemon to monitor idle times and distraction (✅ Completed).
- Link work time to the local machine log and SQLite database.
- Basic session summary.

## Future Phases (Post-MVP)
- Local Analytics (Throughput, Cycle Time).
- Reporting to Markdown / PDF to share with clients or managers.
- Support for team architectures or self-hosted SaaS model.
