# SprintLogic — Project Blueprint

## 1. Product Vision
SprintLogic is a **Local-First Desktop Application (Linux First)**, open-source, and designed exclusively for the solo developer. It acts as a comprehensive command center that optimizes the development workflow through deep integration with local repositories, AI-driven automation (SprintLogic AI assistant) based on the SDD/TDD lifecycle, and rigorous Git control.

## 2. Value Proposition
- **Native SDD & TDD**: The SprintLogic AI assistant helps structure the design (Proposal, Specs, Design, Tasks) before writing code, and accompanies the developer in writing tests.
- **Git Perfection**: Control and suggestion of branch names and frictionless atomic commits. Everything is linked directly to Kanban board tasks.
- **Absolute Local Privacy**: No multi-tenancy. No cloud databases. All project and work information resides in a local SQLite file, and the AI API key (e.g., Gemini) is securely saved only on your machine.
- **Codebase Memory Graph (Pillar 1)**: SprintLogic will map the local codebase using tree-sitter (supporting Python, TS, Java, Go, PHP, etc.), store the nodes/edges in SQLite, and render them in 2D. SDD tasks will be directly linked to the affected nodes.
- **Persistent and Autonomous Memory (Pillar 2)**: SprintLogic AI features long-term memory. An `ai_memories` table is maintained in SQLite. SprintLogic AI has tools (`mem_save`, `mem_search`) to autonomously save architectural decisions and session summaries at the end of a Pomodoro cycle.
- **Dependency and Context RAG (Pillar 3)**: Implementation of 'Dependency-Aware Context'. The AST Parser reads `package.json`/`pyproject.toml` to identify libraries. Before generating code, SprintLogic AI retrieves updated snippets to prevent hallucinations. It uses local semantic search and allows BYOD (Bring Your Own Docs) for users to add their company's PDFs or Markdown documentation.
- **Zero Friction**: Being a local application, it interacts instantly with your local repositories without cumbersome API integrations.
- **Interactive AI Code Coach**: A real-time contextual mentor powered by the Monaco Editor integration, which offers "Quick Fix" Code Actions, pedagogical refactoring explanations, native TypeScript linting (TSServer) injection, and Fill-in-the-Middle (FIM) Ghost Text completion.

## 3. MVP Scope
The focus is the solo developer.
- Local desktop environment (Tauri).
- SQLite database (including `sqlite-vec` for semantic search).
- AI Assistant (SprintLogic AI) using a local LLM gateway for project planning and commit assistance.
- Visual control of local Git history.
- **2D Code Visualization**: Rendering of the Codebase Memory Graph using AST.
- Persistent Memory and integrated dependency RAG.
- Focus Timer integrated with the machine's log.
- **Kanban Board & Sticky Notes**: Interactive drag-and-drop task management board and globally persistent workspace sticky notes.
- **Optimistic Concurrency Control**: Protection against external file system mutations (e.g. `git pull`) while drafting in the IDE, using ETag/MD5 hashes.

*Explicitly excluded*: multi-tenancy, cloud authentication, corporate Docker, external network infrastructure.

## 4. Design and Usage Philosophy
- **Local First**: All data lives with you.
- **Human Control**: The AI (SprintLogic AI) assists and suggests, never executing destructively without confirmation.
- **Clean Code & Architecture**: Leading by example, applying the same standards to the development of SprintLogic itself.
