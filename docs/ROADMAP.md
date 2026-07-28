# Development Roadmap — SprintLogic Desktop

Phases marked with checkboxes reflect the **current** state of the repository
(verified against source code, not the original plans). When a phase is fully
delivered, all its bullet points are checked; when partially done, checkmarks
match what actually exists.

## Phase 1 — Local Desktop Environment and SQLite Database (✅ Completed)
- [x] Tauri 2 wrapper around the Next.js frontend (`apps/web/src-tauri`).
- [x] FastAPI sidecar spawned as `externalBin` with port handshake via
      `[SPRINTLOGIC_READY::<port>]` on stdout.
- [x] SQLite + aiolsqlite as the single persistence layer (no Postgres / Redis).
- [x] Removed authentication and multi-tenancy (single-user, local-first).
- [x] Initial application shell (Sidebar, Base Layout, TabBar).

## Phase 2 — Project Planner Assisted by SprintLogic AI (✅ Completed)
- [x] Settings UI for AI provider keys, persisted in the OS keyring.
- [x] Chat interface for the SprintLogic assistant (`SprintLogicChat.tsx`).
- [x] SDD Pipeline (Proposal → Specs → Design → Tasks) streamed over SSE
      (`apps/api/app/application/sdd_pipeline.py`,
       `apps/api/app/interfaces/api/v1/planning_studio.py`).
- [x] Planning Studio tab with `render_wbs_tree` tool-call integration
      (`PlanningStudioTab.tsx`).
- [x] WBS JSON output persisted to Kanban through `PlanningMessagePayload`.
- [x] Interactive Kanban Board (`KanbanBoard.tsx`).
- [x] Sticky Notes / persistent workspace state on the local file system.

## Phase 3 — Intelligent Code Editor & Code Coach (✅ Completed)
- [x] Monaco Editor integration for reading/writing project code (`EditorTab.tsx`).
- [x] Interactive AI Contextual Mentorship — Code Coach panel and Mentor mode
      (`CoachSidebar.tsx`, `CodeMentorPanel.tsx`, `apps/api/.../chat.py::mentor_sensei`).
- [x] Native TypeScript linter (TSServer) injection into AI context (`LspProvider`).
- [x] "Quick Fix" Code Actions from AI refactoring suggestions (`AutoFixTab.tsx`).
- [x] Optimistic Concurrency Control via ETag/MD5 content hashing
      (`apps/api/app/interfaces/api/v1/editor.py`, `DraftReviewer.tsx`).
- [x] Fill-in-the-Middle (FIM) Ghost Text completion
      (`FimHintBar.tsx`, `store/fimStore.ts`).

## Phase 4 — Codebase Memory Graph & Advanced IDE (🔄 In Progress)
- [x] Source code analysis with `tree-sitter` AST extraction
      (`apps/api/app/infrastructure/parser/`) for Python, TypeScript, Java,
      Go, PHP.
- [x] Graph nodes/edges persisted in SQLite (`GraphNodeModel`, `GraphEdgeModel`
      in `apps/api/app/infrastructure/db/models.py`).
- [x] 2D rendering with `react-force-graph-2d` (`GraphScene.tsx`,
      `GitGraphTab.tsx`).
- [x] **Autonomous Execution Agent (El Quirófano)** — `patch_engine.py`
      applies AST-safe unified diffs to the local file system.
- [x] **Internationalization (i18n)** — ES/EN/PT selector in Settings; AI
      prompts honor `Accept-Language` from the UI.
- [x] **Prompt Registry** — `PromptRegistryModel` + editable Settings panel
      (`PromptRegistrySection.tsx`) with `required_variables` validation.
- [x] **AI Tool Model Mappings** — per-tool overrides in
      `tool_model_mappings` table with `__default__` global fallback; resolved
      server-side via `resolve_tool_model()`. Single source of truth: the DB.
      Override UI: `ToolsSettingsSection.tsx` and `AIProvidersSection.tsx`.
- [x] **Insight Worker (REM Sleep)** — background asyncio task extracting
      Developer Insights from past unmapped conversations
      (`apps/api/app/application/insight_worker.py`, `DeveloperInsightModel`).
- [x] **Telemetry Daemon** — emits contextual Sensei prompts via EventBus.
- [ ] **SDD-AST Linking** — automatic `affectedNodes` attachment from SDD
      tasks to AST/Graph nodes (partial — `analyze_blast_radius.py` exists
      but the tree-link flow is manual today).
- [ ] **Persistent Memory (Decisions table)** — architectural decision
      capture surfaced in the chat (currently persisted ad-hoc via
      `DeveloperInsight`, not as a first-class Decision record).
- [ ] **Context7 Dependency RAG** — Context7 fetch is wired for `/mentor`
      flows; embedded semantic search (`sqlite-vec`) is **planned** and not
      yet enabled.

## Phase 5 — Local Git Control & Atomic Commits (🔄 In Progress)
- [x] Read local Git repositories from the file system (`LocalGitGateway`).
- [x] Link repository path with the project row in SQLite.
- [x] Automatic Git branch creation from Kanban ticket movement
      (`apps/api/app/interfaces/api/v1/git.py`).
- [x] AI-generated commit messages using Conventional Commits and respecting
      `Accept-Language` tag — endpoint resolves `chat_title_gen` tool override
      from the DB (no client-side model sent).
- [x] History view, commits, branches, diffs UI (`GitGraphTab.tsx`,
      `GitStatusWidget.tsx`, `DiffTab.tsx`).
- [ ] Blast-radius-aware dependency change visibility across the graph
      (UI scaffolding exists).

## Phase 6 — Integrated Focus Timer & Telemetry (✅ Completed)
- [x] Focus timer (Pomodoro) per task (`focusStore.ts`).
- [x] Telemetry Daemon continuously monitors coding/idle/distraction
      (`apps/api/app/application/telemetry_daemon.py`).
- [x] Work session log persisted to SQLite (`TelemetryPingModel`).
- [x] Session summary surfaced via `InsightDashboard.tsx`.

## Phase 7 — Tooling & Settings (✅ Completed)
- [x] Settings shell with sections:
      General, Appearance, Modelos & LLMs, Herramientas, Integrations,
      Git, Engine, Prompt Registry.
- [x] Custom LLM providers (BYO endpoint) with keyring storage
      (`CustomLLMProviderModel`).
- [x] OmniSearch modal for fast navigation (`OmniSearchModal.tsx`).
- [x] Cheat sheet / Help modal (`CheatSheetModal.tsx`, `HelpModal.tsx`).

## Phase 8 — Process Lifecycle Hardening (✅ Completed)
- [x] `start_dev.sh` traps INT/TERM/EXIT and kills the full process group so
      Ctrl+C never leaves orphaned uvicorn/node/cargo processes.
- [x] Tauri sidecar explicit kill on `RunEvent::Exit`
      (`apps/web/src-tauri/src/lib.rs::SidecarChild`).
- [x] STDIN umbilical cord for the Python sidecar — when the Tauri parent
      dies, `sys.stdin.read()` returns EOF and the child self-SIGINTs its
      way through `uvicorn` lifespan teardown (insight worker cancel,
      ProcessPoolExecutor shutdown). Gated on `SPRINTLOGIC_DESKTOP=1`.

## Future Phases (Post-MVP)
- [ ] Local Analytics (Throughput, Cycle Time).
- [ ] Reporting to Markdown / PDF for sharing with clients or managers.
- [ ] Semantic search via `sqlite-vec` for Dependency RAG.
- [ ] First-class SDD-AST linking (auto `affectedNodes`).
- [ ] Team architectures or self-hosted SaaS model (out of scope for MVP).