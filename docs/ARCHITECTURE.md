# Technical Architecture — SprintLogic Desktop

## 1. Recommended Stack

The platform is designed as a **Desktop Architecture**, offering native performance and local control:
- **Desktop Wrapper**: [Tauri](https://tauri.app/) (ideal for packaging web applications with a lightweight resource footprint on Linux/Windows/Mac).
- **Web Frontend**: Next.js (App Router) + React + TypeScript + TailwindCSS + Zustand (State Management).
- **Backend / Core Logic**: FastAPI (Python) running as a local executable sidecar that provides the system API to the Tauri view. Maintaining a local FastAPI/Python sidecar allows for deep ecosystem compatibility with AI frameworks, AST parsers (tree-sitter), and SQLite operations.

## 2. Persistence and Storage

- **Engine**: SQLite.
- **Source of Truth**: A single `.db` file hosted on the user's local file system (e.g., `~/.config/sprintlogic/data.db`).
- **Migrations**: Alembic (managing the local SQLite schema).
- **Workspace State**: File-based JSON persistence for features like Kanban Boards and globally persistent Sticky Notes (`.sprintlogic/notes.json`).

*Note:* We explicitly avoid PostgreSQL or Redis. All persistence is strictly embedded and local.

## 3. Security and Privacy

- **Zero Cloud Data**: Data never leaves the developer's machine. There are no tenants, no SaaS model, and no shared database.
- **API Keys**: Integration with AI models (SprintLogic AI via Gemini) requires an API key which is encrypted and securely stored **only locally**.
- **Local Control**: Git repositories to be managed are scanned directly from the local file system, eliminating the need to provide OAuth access to external platforms like GitHub or GitLab.

## 4. AI Engine (AI Gateway) and SDD Pipeline

The backend exposes local routes to interact with the AI in a structured manner.
- **Bring Your Own Key (BYOK) Architecture**: Support for major providers (e.g., Gemini, Anthropic, OpenAI).
- **Unified API**: `LiteLLM` is utilized in the Python sidecar to unify and standardize calls regardless of the LLM chosen by the user.
- **SDD Pipeline**: Asynchronous generation of project planning artifacts (`proposal.md`, `specs/`, `design.md`, `tasks.md`).
- **Code Coach & Mentorship**: Deep contextual integration mapping frontend code to the LLM. It includes pedagogical refactoring feedback and natively injects IDE/Linter (TSServer) errors into the AI payload for better context awareness.

## 5. IDE & Interactive Frontend

- **Monaco Editor**: A fully integrated Monaco Editor instance powers the file view. It uses a flexible layout design for horizontal/vertical splitting and real-time syntax highlighting.
- **Optimistic Concurrency Control**: The architecture implements ETag/MD5 content hashing between the frontend and backend. This prevents local IDE drafts from inadvertently overwriting external file system changes (e.g., from a `git pull`).
- **Fill-in-the-Middle (FIM)**: An inline autocomplete layer generating "Ghost Text" predictions, managed by Monaco Editor's inline completions provider.
- **Kanban Board**: Drag-and-drop React interface closely mapped to the local persistent SQLite tasks for SDD workflow tracking.

## 6. Git Integration

The backend utilizes system commands or native libraries (`GitPython` or asynchronous shell invocations) to track the project's `cwd` (Current Working Directory), monitor branch state, run diffs, and perform atomic commits.
