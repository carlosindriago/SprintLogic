# SprintLogic Web Frontend

This is the Next.js (App Router) frontend for SprintLogic, designed to be bundled into a desktop application (via Tauri) or run as a local web interface.

## Tech Stack

- **Framework**: Next.js (App Router, Static Export `output: export`)
- **Language**: TypeScript
- **State Management**: Zustand
- **Styling**: TailwindCSS, Radix UI (shadcn/ui)
- **Editor**: Monaco Editor (`@monaco-editor/react`)
- **i18n**: Custom hook (`useTranslation`) with strict typings

## Key Features

- **Planning Studio**: An interactive interface for breaking down ideas into SDD plans and WBS (Work Breakdown Structures).
- **Execution Room**: The main coding environment featuring a 3-pane layout (Chat, Code Editor, Task Context).
- **Enterprise Settings**: Deep configuration for AI Models, System Prompts (Prompt Registry), and Visual Appearance.
- **Kanban Board**: Drag-and-drop offline kanban tracking synced with the SQLite backend.

## Development

First, make sure the backend (FastAPI in `apps/api`) is running on `localhost:8000`.

Then, install dependencies and run the development server:

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

## Build Requirements

Because SprintLogic is designed for a local desktop environment, the Next.js app must be fully statically exportable:
- No dynamic route segments (e.g., `[id]`) without `generateStaticParams`.
- We use query parameters (`?id=...`) and `Suspense` boundaries for dynamic routing.
- See `next.config.mjs` for the `output: export` configuration.

## i18n (Internationalization)

SprintLogic supports English (`en`), Spanish (`es`), and Portuguese (`pt`).
- Dictionaries are located in `src/i18n/`.
- Use the `useT()` hook from `src/hooks/useTranslation.ts` to consume translations with full autocomplete support.
- Language is auto-detected on first load (`navigator.language`) and persisted in `settingsStore`.
