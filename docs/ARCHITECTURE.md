# Technical Architecture — SprintLogic Desktop

This document reflects the **current** repository layout. It is the canonical
reference for contributors — read it before opening a PR so you know which
module owns which responsibility.

## 1. Recommended Stack

The platform is designed as a **Desktop Architecture**, offering native
performance and local control:

- **Desktop Wrapper**: [Tauri 2](https://tauri.app/) — wraps the static Next.js
  export and spawns the Python sidecar as `externalBin`. The Rust entry lives
  in `apps/web/src-tauri/src/lib.rs`.
- **Web Frontend**: Next.js (App Router) + React + TypeScript + TailwindCSS +
  Zustand (state management). Monaco powers the editor; `react-force-graph-2d`
  renders the codebase graph.
- **Backend / Core Logic**: FastAPI (Python 3.12+) running as a local sidecar
  (`apps/api`). Maintains SQLite persistence, the LiteLLM AI Gateway, the
  tree-sitter AST auditor/patcher, Git shell integration, Prompt Registry,
  Telemetry Daemon, Insight Worker, and Tool Model Mappings.

## 2. Repository Layout

```
sprintLogic-monorepo/
├── apps/
│   ├── api/                         # FastAPI Python sidecar
│   │   ├── app/
│   │   │   ├── application/         # use cases & long-running workers
│   │   │   │   ├── ai_agent.py
│   │   │   │   ├── ast_auditor.py
│   │   │   │   ├── delta_sync.py
│   │   │   │   ├── graph_collapse.py
│   │   │   │   ├── graph_metrics.py
│   │   │   │   ├── insight_worker.py     # REM sleep — extracts dev insights
│   │   │   │   ├── patch_engine.py       # El Quirófano — AST-safe diffs
│   │   │   │   ├── scan_codebase.py
│   │   │   │   ├── sdd_pipeline.py
│   │   │   │   ├── semantic_splitter.py
│   │   │   │   ├── tdd_guard.py
│   │   │   │   └── telemetry_daemon.py
│   │   │   ├── domain/               # pure business models & ports
│   │   │   │   ├── exceptions.py
│   │   │   │   ├── git_models.py / git_repository.py
│   │   │   │   ├── graph_models.py / graph_repository.py / graph_schemas.py
│   │   │   │   ├── kanban_models.py / kanban_schemas.py
│   │   │   │   ├── path_validator.py
│   │   │   │   ├── ports/             # interfaces (codebase_provider, etc.)
│   │   │   │   ├── project.py
│   │   │   │   ├── sdd_models.py
│   │   │   │   └── user.py
│   │   │   ├── infrastructure/       # adapters & gateways
│   │   │   │   ├── ai/                # context builder, provider adapter,
│   │   │   │   │                       # prompt renderer, Context7 client,
│   │   │   │   │                       # vector engine, project scanner
│   │   │   │   ├── auth/
│   │   │   │   ├── config.py          # DEFAULT_LLM_MODEL, etc.
│   │   │   │   ├── db/                # SQLAlchemy models + sessionmaker
│   │   │   │   │   ├── database.py
│   │   │   │   │   ├── models.py      # 22 ORM models (see §5)
│   │   │   │   │   └── project_repository.py
│   │   │   │   ├── events/            # active_scans, EventBus (pub/sub)
│   │   │   │   ├── file_watcher.py
│   │   │   │   ├── git/               # LocalGitGateway
│   │   │   │   ├── kanban_sync.py
│   │   │   │   ├── llm/               # litellm_gateway.py — unified LLM API
│   │   │   │   ├── parser/            # tree-sitter AST + dependency parser
│   │   │   │   │   ├── analyzer_factory.py
│   │   │   │   │   ├── ast_parser.py
│   │   │   │   │   ├── dependency_parser.py
│   │   │   │   │   ├── import_resolver.py
│   │   │   │   │   ├── language_adapters.py
│   │   │   │   │   ├── route_matcher.py
│   │   │   │   │   └── strategies/    # python, ts, java, go, php
│   │   │   │   ├── providers/        # local FS provider for code scanning
│   │   │   │   ├── repositories/
│   │   │   │   │   ├── graph_repository.py
│   │   │   │   │   ├── kanban_repository.py
│   │   │   │   │   ├── prompt_repository.py
│   │   │   │   │   └── tool_model_repository.py   # §4 — tool overrides
│   │   │   │   ├── scanners/
│   │   │   │   └── security/
│   │   │   │       └── credential_manager.py       # OS keyring bridge
│   │   │   └── interfaces/
│   │   │       └── api/v1/           # FastAPI routers
│   │   │           ├── ai.py             # code_coach, contextual_mentor, tech-scan
│   │   │           ├── chat.py           # chat, mentor (sensei), ticket-mentor, auto-fix
│   │   │           ├── editor.py         # generate_docs, optimistic concurrency
│   │   │           ├── git.py            # branches, commits, diff, generate-commit-message
│   │   │           ├── kanban.py
│   │   │           ├── lsp.py             # TSServer proxy
│   │   │           ├── planning_studio.py # SSE planning assistant + WBS tool
│   │   │           ├── projects.py       # graph/analyze, WBS, reports, blast radius
│   │   │           ├── prompts.py
│   │   │           ├── providers.py
│   │   │           ├── settings.py       # curated providers, API keys, tool-models
│   │   │           ├── sync.py
│   │   │           └── telemetry.py
│   │   ├── migrations/              # Alembic (sqlite + aiolsqlite)
│   │   ├── alembic.ini
│   │   ├── pyproject.toml
│   │   └── main.py                  # uvicorn entrypoint with lifespan
│   │                                  # (insight worker, ProcessPoolExecutor,
│   │                                  #  STDIN umbilical cord for graceful death)
│   └── web/                         # Next.js frontend consumed by Tauri
│       ├── src/
│       │   ├── app/                 # Next.js App Router pages
│       │   ├── components/
│       │   │   ├── Settings/
│       │   │   │   ├── AIProvidersSection.tsx     # global __default__ override
│       │   │   │   ├── AppearanceSettingsSection.tsx
│       │   │   │   ├── EngineSettingsSection.tsx
│       │   │   │   ├── GitSettingsSection.tsx
│       │   │   │   ├── IntegrationsSettingsSection.tsx
│       │   │   │   ├── PromptRegistrySection.tsx
│       │   │   │   ├── SettingsTab.tsx
│       │   │   │   └── ToolsSettingsSection.tsx   # per-tool overrides UI
│       │   │   ├── AIAuditPanel.tsx
│       │   │   ├── AutoFixTab.tsx
│       │   │   ├── KanbanBoard.tsx
│       │   │   ├── GraphScene.tsx
│       │   │   ├── PlanningStudioTab.tsx
│       │   │   ├── SprintLogicChat.tsx
│       │   │   ├── EditorTab.tsx
│       │   │   └── … (FimHintBar, DiffTab, OmniSearchModal, CheatSheetModal,
│       │   │       DraftReviewer, InsightDashboard, GitStatusWidget, etc.)
│       │   ├── store/                # Zustand stores
│       │   │   ├── settingsStore.ts
│       │   │   ├── llmConfigStore.ts
│       │   │   ├── fimStore.ts
│       │   │   ├── tddStore.ts
│       │   │   └── … (chat, focus, planning, projectInsights, telemetry, …)
│       │   └── lib/api.ts            # typed fetch wrapper; one-stop shop for
│       │                              # backend calls (ProjectData, ToolModel,
│       │   │                          # generateWBS, fetchToolModels, …)
│       └── src-tauri/
│           ├── src/lib.rs            # Rust host: spawns sidecar, kin LOS Exit
│           ├── tauri.conf.json       # externalBin: bin/sprintlogic-backend
│           └── bin/                  # PyInstaller-bundled sidecar (per target)
├── docs/                            # architecture, blueprint, rules, roadmap, ADRs
│   └── adr/                          # Decision records (add new ones here)
├── infra/                           # CI/scripts for bundling the sidecar
├── scripts/
├── start_dev.sh                    # unified dev launcher with process-group
│                                     # traps (avoid orphan uvicorn/node/cargo)
└── README.md
```

## 3. Persistence and Storage

- **Engine**: SQLite (via `aiolsqlite` async driver).
- **Schema**: Migrations live under `apps/api/migrations/versions/` and applied via
  `alembic upgrade head` (see `start_dev.sh`). The current schema covers ~22 ORM
  models in `apps/api/app/infrastructure/db/models.py`:
  `UserModel`, `ProjectModel`, `GraphNodeModel`, `GraphEdgeModel`,
  `ASTNodeMapModel`, `ASTVectorModel`, `AIMemoryModel`, `ContextSnippetModel`,
  `DeveloperInsightModel`, `ConversationModel`, `MessageModel`,
  `AnalysisReportModel`, `SearchIndexModel`, `ProjectMemoryModel`,
  `AdrChunkModel`, `TelemetryPingModel`, `DaemonLockModel`,
  `KanbanTicketModel`, `KanbanTicketNodeModel`, `PromptRegistryModel`,
  `CustomLLMProviderModel`, `ToolModelMappingModel`.
- **Source of Truth**: a single `sprintlogic.db` file produced next to the API
  working directory. No PostgreSQL. No Redis.
- **Workspace State**: some ephemeral state (e.g., sticky notes) persists in a
  `.sprintlogic/` JSON file on the user's file system next to the repo.

## 4. Tool Model Mappings — Single Source of Truth

Every AI-touching endpoint resolves its model through the helper in
`apps/api/app/infrastructure/repositories/tool_model_repository.py`:

```python
async def resolve_tool_model(session: AsyncSession, tool_name: str)
    -> tuple[str, str]
```

Resolution order (the **only** authoritative path — the frontend does NOT send
the model anymore):

1. **Tool-specific override** in `tool_model_mappings` for `tool_name`.
2. **Global default override** — the `__default__` row.
3. **Env var fallback** — `DEFAULT_LLM_MODEL` (defaults to
   `gemini/gemini-2.5-flash`).

Known tool names (see `KNOWN_TOOLS` in `tool_model_repository.py`):

| Tool name            | Use case                                                            |
|----------------------|--------------------------------------------------------------------|
| `chat`               | SprintLogic Chat main assistant                                    |
| `chat_sensei`        | Chat in Socratic Architect modus (`/mentor` endpoint)             |
| `chat_title_gen`     | Background title generation for new conversations                  |
| `graph_analysis`     | `POST /projects/{id}/graph/analyze` — architectural audit         |
| `phantom_extractor`  | Extract Kanban tickets from an analysis report                    |
| `code_coach`         | `POST /ai/health-overview` — contextual code review               |
| `contextual_mentor`  | `POST /ai/contextual-mentorship` — anti-pattern detection         |
| `auto_fix`           | `POST /chat/auto-fix` — apply refactors from coach/chat           |
| `fim`                | Fill-in-the-Middle inline completion                              |
| `ticket_mentor`      | `POST /chat/ticket-mentor` — blast-radius-aware ticket help       |
| `planning_studio`    | `POST /planning-studio/message` and `POST /.../kanban/wbs`       |
| `insight_worker`     | REM sleep — extracts Developer Insights in background             |

Changes to a tool override happen via Settings → Herramientas (or Settings →
Modelos & LLMs for the `__default__` global) in the frontend. Both surfaces
read/write the same `tool_model_mappings` rows through the
`/settings/tool-models` API; there is no other source of truth.

## 5. AI Engine (AI Gateway) and SDD Pipeline

- **Bring Your Own Key (BYOK)**: Gemini, OpenAI, Anthropic, OpenRouter,
  Groq, NVIDIA NIM, Ollama, Ollama Cloud, OpenCode Zen, OpenCode Go.
- **Unified LiteLLM gateway**: `apps/api/app/infrastructure/llm/litellm_gateway.py`
  adapts the requested model string through `provider_adapter.py` and asks
  `CredentialManager` for an API key by provider name. Provider keys live in
  the OS keyring and are referenced from `CustomLLMProviderModel` for custom
  endpoints.
- **Prompt Registry**: `PromptRegistryModel` stores versioned prompt templates
  with `required_variables`. `prompt_renderer.render_prompt` substitutes and
  validates variables before sending. Editable from Settings → Prompt Registry.
- **Context7 Dependency RAG**: `infrastructure/ai/context7_client.py` fetches
  authoritative docs for the detected tech stack and injects them into AI
  prompts to reduce hallucinations. Wires into `/mentor` flows today; semantic
  search over local vectors (sqlite-vec) is planned.
- **SDD Pipeline**: `apps/api/app/application/sdd_pipeline.py` generates the
  planning artifacts (`proposal`, `specs`, `design`, `tasks`), streamed via
  Server-Sent Events through `planning_studio.py`. Frontend `PlanningStudioTab`
  surfaces them through the `render_wbs_tree` LLM tool call.
- **Execution Agent (El Quirófano)**: `application/patch_engine.py` applies
  AST-safe unified diffs from the AI directly to the local file system using
  `diff-match-patch` and strict AST boundaries.
- **Insight Worker (REM Sleep)**: `application/insight_worker.py` is a
  background asyncio task started from `main.py::lifespan`. It scans past
  unmapped conversations, extracts `(symptom, solution)` tuples, and persists
  them as `DeveloperInsight` rows for future retrieval. The worker itself
  resolves its model from the `insight_worker` tool override (DB).
- **Telemetry Daemon**: `application/telemetry_daemon.py` monitors
  coding/idle/distraction and emits contextual Sensei prompts through
  `infrastructure/events/event_bus.py` (in-process pub/sub).

## 6. IDE & Interactive Frontend

- **Monaco Editor**: full integration in `EditorTab.tsx`. Flexible layout for
  horizontal/vertical splitting and real-time syntax highlighting by language.
- **Optimistic Concurrency Control**: ETag/MD5 content hashing between the
  Monaco draft and the file system protects against losing the local draft
  when the file system changes externally (e.g., `git pull`). See
  `apps/api/app/interfaces/api/v1/editor.py` and `DraftReviewer.tsx`.
- **Fill-in-the-Middle (FIM)**: `store/fimStore.ts` + `FimHintBar.tsx`
  generate inline "Ghost Text" predictions through Monaco's inline
  completions provider; the backend resolves the `fim` tool override from the DB.
- **LSP proxy**: `apps/api/app/interfaces/api/v1/lsp.py` proxies TSServer so
  AI prompts can be augmented with native lint errors.
- **Kanban Board**: drag-and-drop React interface in `KanbanBoard.tsx`. Tasks
  live in SQLite; the Planning Studio's `render_wbs_tree` tool call feeds
  the WBS straight into Kanban.
- **2D Code Visualization**: `GraphScene.tsx` renders the Codebase Memory
  Graph with `react-force-graph-2d`. `GitGraphTab.tsx` overlays branch
  history.

## 7. Git Integration

- **LocalGitGateway** (`app/infrastructure/git/git_gateway.py`) tracks the
  project's `cwd`, monitors branch state, runs diffs, performs atomic
  commits, and is exposed through `interfaces/api/v1/git.py`.
- **AI-assisted commit messages**: `POST /projects/{id}/git/generate-commit-message`
  resolves the `chat_title_gen` tool override from the DB (no client-side
  model is sent anymore), produces a Conventional Commits summary, and
  honors the UI language via `Accept-Language`.
- **Branch creation**: moving a Kanban ticket into "In Progress" can trigger
  an automatic `feat/<scope>` branch creation through `kanban_sync.py`.

## 8. Process Lifecycle

Two layers ensure the Python sidecar dies when the desktop app closes:

1. **Rust layer** (`apps/web/src-tauri/src/lib.rs`) — `SidecarChild` wraps the
   spawned `Child`. The builder is restructured to
   `builder.build(ctx)?.run(closure)`, and the closure kills the child on
   `RunEvent::Exit` (`child.kill()` then `child.wait()` so the OS reaps).
2. **Python layer** (`apps/api/app/main.py`) — `kill_zombie_on_parent_death`
   runs in a daemon thread gated on `SPRINTLOGIC_DESKTOP=1`. When the parent
   dies, STDIN EOF triggers `os.kill(os.getpid(), signal.SIGINT)` so uvicorn
   runs its lifespan teardown (insight worker cancel, ProcessPoolExecutor
   shutdown).

The dev script `start_dev.sh` uses `set -m` and traps INT/TERM/EXIT to spray
SIGTERM (and SIGKILL after a short grace) across the entire process group so
no orphaned uvicorn/node/cargo survivors remain after Ctrl+C.

## 9. Testing

- **Backend**: `pytest` under `apps/api/tests/` (unit + integration, including
  a `codebase-memory-mcp` knowledge graph for cross-file traceability when
  exploring structural changes). `tdd_guard.py` enforces TDD discipline
  during SDD flows.
- **Frontend**: React component tests for critical pieces; e2e flows are
  tracked in `docs/DEVELOPMENT_RULES.md` §9.
- **Static analysis**: `ruff` (Python) + `next lint` / `tsc --noEmit`
  (TypeScript), enforced via `.pre-commit-config.yaml`.

## 10. Where to Add What

Looking to contribute? Match your change to the right layer:

| Change                                    | Folder / file                                |
|-------------------------------------------|---------------------------------------------|
| New AI provider                           | `infrastructure/ai/provider_adapter.py` + `settings.py::CURATED_MODELS` |
| New AI flow / endpoint                    | `interfaces/api/v1/<router>.py` (use `resolve_tool_model`) |
| New tool override                         | Add entry to `KNOWN_TOOLS` (`tool_model_repository.py`) + Settings UI |
| New prompt template                       | Settings → Prompt Registry (`prompt_repository.py`) |
| New persistence model / migration         | `infrastructure/db/models.py` + `alembic revision` in `migrations/versions/` |
| New language AST strategy                | `infrastructure/parser/strategies/<lang>_strategy.py` + `analyzer_factory.py` |
| New frontend feature/component            | `apps/web/src/components/` + a Zustand store if stateful |
| New desktop/lifecycle behavior           | `apps/web/src-tauri/src/lib.rs`            |
| Architectural decision                    | `docs/adr/<NNNN>-<topic>.md`                |

For rules governing each layer, see [`DEVELOPMENT_RULES.md`](DEVELOPMENT_RULES.md)
and [`GIT_WORKFLOW.md`](GIT_WORKFLOW.md).