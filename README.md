# SprintLogic 🚀

SprintLogic is a **Local-First Desktop Application (Linux First)**, open-source, and designed exclusively for the solo developer. It acts as a comprehensive command center that optimizes the development workflow through deep integration with local repositories, AI-driven automation based on the SDD/TDD lifecycle, and rigorous Git control.

## 🌟 Key Features

- **Native SDD & TDD (Planning Studio)**: 
  The AI assistant helps structure your ideas into concrete designs (Proposal, Specs, Design, Tasks) before you write any code.
- **Autonomous Execution Agent (El Quirófano)**: 
  Instead of just generating code snippets, SprintLogic's agent autonomously applies AST-safe, unified diff patches directly to your local files using a background patching engine.
- **Git Perfection**: 
  Control and suggestion of branch names. The system automatically creates Git branches linked to Kanban tickets and facilitates atomic commits.
- **Absolute Local Privacy**: 
  No multi-tenancy. No cloud databases. All project and work information resides in a local SQLite database. API keys (e.g., Gemini) are securely saved in your OS keyring.
- **Interactive Kanban Board**:
  A fully offline Kanban board mapping exactly to your active Git workflow and SDD tasks.
- **Telemetry Daemon**:
  Productivity monitor that detects high friction or distractions, sending localized prompts from your AI Sensei.
- **Internationalization (i18n)**:
  Full multi-language support across the UI and AI prompts (English, Spanish, Portuguese).

## 🏗️ Architecture

SprintLogic uses a unified, split-architecture tailored for local desktop use:

1. **Backend (`apps/api`)**: A powerful local FastAPI application managing SQLite persistence, the AI Gateway (LiteLLM), the AST Code Auditor/Patcher, Git shell commands, and Telemetry.
2. **Frontend (`apps/web`)**: A high-performance Next.js (React) application exported as a Static Site (SSG), using Zustand for state, TailwindCSS for styling, and Monaco Editor for code viewing/editing.
3. *(Planned)* **Desktop Wrapper**: Tauri will wrap the Static Next.js frontend and bundle the Python sidecar.

## 🚀 Getting Started

### Prerequisites

- Node.js (v18+)
- Python 3.12+ 
- `uv` (Python Package Manager)
- Rust (only required if building the desktop app)

### ⚡ Quick Start (Recommended)

The easiest way to boot up both the backend and frontend simultaneously is using our unified development script:

```bash
# Make the script executable (only needed once)
chmod +x start_dev.sh

# Run the unified development server
./start_dev.sh
```
This script will automatically handle virtual environments, database migrations, and boot both Next.js and FastAPI.

### Manual Start

If you prefer to run them separately:

**1. Start the Backend (API)**
```bash
cd apps/api
uv venv
source .venv/bin/activate
uv pip install -r requirements.txt
alembic upgrade head
npm run dev # or `uvicorn app.main:app --reload`
```

**2. Start the Frontend (Web)**
```bash
cd apps/web
npm install
npm run dev
```

Navigate to `http://localhost:3000` to start using SprintLogic!

## 📦 Building the Desktop App

SprintLogic is designed to be a native desktop application powered by Tauri. Once you are ready to compile the production bundle for your operating system (Linux `.AppImage`/`.deb`, Windows `.exe`, or macOS `.dmg`):

1. Ensure you have Rust and the Tauri CLI system dependencies installed.
2. Run the build command from the `apps/web` directory:

```bash
cd apps/web
npm run tauri build
```
*Note: The Python backend sidecar packaging is currently in development. For now, running the backend locally alongside the Tauri dev build (`npm run tauri dev`) is the recommended approach for desktop testing.*

## 🔐 Security & Keys

SprintLogic requires an AI provider key (like Gemini) to operate the AI Assistant and Execution Agent.
- API Keys are NEVER stored in plain text or in the database.
- They are securely saved into your operating system's native keychain (via Python's `keyring` and DBus/SecretService on Linux).

## 📄 License

This project is open-source. Please see the [LICENSE](LICENSE) file for more details.
