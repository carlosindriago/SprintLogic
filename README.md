# SprintLogic 🚀

SprintLogic is a **Local-First Desktop Application (Linux First)**, open-source, and designed exclusively for the solo developer. It acts as a comprehensive command center that optimizes the development workflow through deep integration with local repositories, AI-driven automation based on the SDD/TDD lifecycle, and rigorous Git control.

The app is bundled as a **Tauri 2** desktop binary that spawns a Python (FastAPI + Uvicorn) sidecar. All persistence stays in a local SQLite database and AI provider keys live in the OS keyring — nothing leaves your machine.

## 🌟 Key Features

- **Native SDD & TDD (Planning Studio)**:
  The AI assistant helps you structure ideas into concrete designs (Proposal, Specs, Design, Tasks) streamed over SSE before any production code is written.
- **Autonomous Execution Agent (El Quirófano)**:
  Instead of just generating code snippets, SprintLogic's agent autonomously applies AST-safe unified diff patches directly to your local files using a background patching engine.
- **Codebase Memory Graph**:
  tree-sitter parses Python, TypeScript, Java, Go, and PHP sources into a graph stored in SQLite. The graph is rendered in 2D with `react-force-graph-2d` and tasks link to affected AST nodes.
- **AI Tool Model Mappings**:
  Per-tool model overrides (`graph_analysis`, `chat`, `chat_sensei`, `insight_worker`, `code_coach`, `contextual_mentor`, `auto_fix`, `fim`, `ticket_mentor`, `planning_studio`, `phantom_extractor`, …) with a `__default__` global fallback. The DB is the **single source of truth**; tool endpoints resolve via `resolve_tool_model()`.
- **Insight Worker (REM Sleep)**:
  A background asyncio task that extracts "wisdom nuggets" (symptom + solution) from past unmapped conversations and persists them as `DeveloperInsight` rows for future retrieval.
- **Telemetry Daemon**:
  Productivity monitor that detects high friction or distractions and dispatches contextual prompts from the AI Sensei through the in-process EventBus.
- **Git Perfection**:
  Control and suggestion of branch names. The system automatically creates Git branches linked to Kanban tickets and facilitates atomic commits. AI-generated commit messages use Conventional Commits format.
- **Absolute Local Privacy**:
  No multi-tenancy. No cloud databases. All project and work information resides in a local SQLite database. API keys (e.g., Gemini) are securely saved in your OS keyring.
- **Interactive Kanban Board**:
  A fully offline Kanban board mapping exactly to your active Git workflow and SDD tasks. Auto-syncs WBS output from Planning Studio.
- **Monaco Editor + FIM**:
  Optimistic concurrency control via ETag/MD5 hashing prevents local IDE drafts from overwriting external file system changes (e.g., `git pull`). Fill-in-the-middle ghost text completion driven by Groq/LiteLLM.
- **Prompt Registry**:
  Database-persisted, versioned prompt templates with `required_variables` validated at runtime. Editable from the Settings UI.
- **Context7 Dependency RAG**:
  Optional Context7 integration fetches authoritative docs for a detected tech stack and injects them into AI prompts to reduce hallucinations.
- **Internationalization (i18n)**:
  Full multi-language support across the UI and AI prompts (English, Spanish, Portuguese).

## 🏗️ Architecture

SprintLogic is a unified split monorepo:

1. **Backend (`apps/api`)** — FastAPI + Uvicorn local API managing SQLite persistence, LiteLLM AI Gateway, AST Code Auditor/Patcher, Git shell commands, Tool Model Mappings, Insight Worker, Telemetry Daemon, Prompt Registry. See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).
2. **Frontend (`apps/web`)** — Next.js (React + TypeScript + Tailwind + Zustand), exported as static assets consumed by Tauri. Monaco powers the editor; `react-force-graph-2d` renders the codebase graph.
3. **Desktop Wrapper (`apps/web/src-tauri`)** — Tauri 2 hosts the static frontend, spawns the Python sidecar as `externalBin`, detects its port via the `[SPRINTLOGIC_READY::<port>]` handshake, and explicitly kills the child on `RunEvent::Exit` to avoid zombie processes.

## 🚀 Getting Started

### Prerequisites

- Node.js (v18+)
- Python 3.12+
- `uv` (Python Package Manager) — recommended but optional; you can also use a plain `venv` + `pip`
- Rust toolchain — required for the desktop wrapper (Tauri)
- (Linux) `libwebkit2gtk-4.1-dev`, `libssl-dev`, `libgtk-3-dev`, `libayatana-appindicator3-dev`, `librsvg2-dev` — the `start_dev.sh` script offers to install these via apt on first run

### ⚡ Quick Start (Recommended)

The easiest way to boot both services together is the unified dev launcher:

```bash
chmod +x start_dev.sh   # only needed once
./start_dev.sh
```

The script:
- Verifies Rust / Cargo availability (offers to install if missing)
- Frees ports `8000` (backend) and `3420` (frontend) if they are busy
- Launches `uvicorn app.main:app --reload --port 8000` in `apps/api`
- Waits for the backend to start listening
- Launches `tauri dev` (or falls back to `npm run dev` when Rust is not installed)
- Registers `INT`/`TERM`/`EXIT` traps that kill the entire process group — no orphaned uvicorn/node/cargo processes after Ctrl+C

### Manual Start

If you prefer to run the pieces by hand:

**1. Backend (FastAPI / Uvicorn on port 8000)**
```bash
cd apps/api
uv venv                       # or: python3.12 -m venv .venv
source .venv/bin/activate
uv pip install -e .           # installs from pyproject.toml
alembic upgrade head          # apply DB migrations (sqlite + aiolsqlite)
uvicorn app.main:app --reload --port 8000
```

**2. Frontend (Next.js on port 3420 + Tauri wrapper)**
```bash
cd apps/web
npm install
npx @tauri-apps/cli dev       # web-only fallback: npm run dev
```

Navigate to `http://localhost:3420` once the dev server reports ready.

> Backend-only dev: run just step 1 and skip Tauri. The Next.js web fallback (`npm run dev`) is enough for iteration without the desktop chrome.

## 📦 Building the Desktop App

Production build for desktop (Linux `.AppImage`/`.deb`, Windows `.exe`, macOS `.dmg`):

```bash
cd apps/web
npm install
npm run tauri build
```

The Python sidecar itself is referenced as `externalBin` (`apps/web/src-tauri/bin/sprintlogic-backend`) in `tauri.conf.json`. Production packaging of the sidecar (PyInstaller `--onedir`) is wired in `apps/api/build.rs` / `infra/`; see [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for the current sidecar bundling strategy.

## 🔐 Security & Keys

SprintLogic requires an AI provider key (Gemini, OpenAI, Anthropic, Groq, OpenRouter, NVIDIA NIM, Ollama, OpenCode Zen, OpenCode Go, …) to operate the AI assistant and execution agent.

- API Keys are NEVER stored in plain text or in the database.
- They are securely saved into your operating system's native keychain (via Python's `keyring` and DBus/SecretService on Linux).
- Add / verify / remove keys from the **Settings → Modelos & LLMs** panel inside the app.

## 🛠️ Contributing

Contributions are welcome. Before opening a PR:

1. Read [`docs/DEVELOPMENT_RULES.md`](docs/DEVELOPMENT_RULES.md) — project-wide coding, architecture, and testing rules.
2. Read [`docs/GIT_WORKFLOW.md`](docs/GIT_WORKFLOW.md) — trunk-based workflow, branch naming, atomic commits.
3. Read [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — folder layout, modules, and how tool endpoints resolve model overrides.
4. Check the current [`docs/ROADMAP.md`](docs/ROADMAP.md) to align your work with active phases.
5. Architectural decisions are recorded as ADRs under [`docs/adr/`](docs/adr/). If your change introduces a non-obvious decision, add a new ADR.

The repo enforces style via pre-commit hooks (`.pre-commit-config.yaml`): `ruff` for Python, `next lint` / `tsc --noEmit` for the frontend. Run them locally before pushing.

## 📄 License

This project is open-source. Please see the [LICENSE](LICENSE) file for more details.