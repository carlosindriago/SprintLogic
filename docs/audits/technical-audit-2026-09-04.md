# SprintLogic — Technical Audit (2026-09-04)

Scope: full monorepo (`apps/api` FastAPI backend + `apps/web` Next.js/Tauri desktop frontend). Read-only analysis, no code changes. All findings below are verified against the current state of the code (commit `72a2096`, `main`), not inherited from prior audits without re-checking.

> Note: `tasks.md` and `docs/planning/current_plan.md` at the repo root (untracked) describe an unrelated project (Supabase multi-tenant SaaS, "Tramiflow" branding) and were excluded from this audit — they don't match the current SprintLogic stack (Tauri + FastAPI + SQLite desktop IDE).

---

## Executive Summary

SprintLogic is a desktop IDE: a Next.js 16 / React 19 frontend running inside a Tauri v2 shell, talking to a local FastAPI + SQLAlchemy(async)/SQLite sidecar process. The backend follows a genuinely clean hexagonal split at the domain layer; the frontend has good code-splitting discipline. Several previously-known issues (N+1 queries, archive-extraction path traversal, zombie sidecar process in dev) are **confirmed fixed** by recent merged PRs. Three **critical, currently-broken** issues were newly found:

1. A hardcoded port (`8000`) in 3 frontend call sites breaks the AST-sync/linting channel, Kanban live updates, and node lookup whenever the sidecar doesn't land on port 8000 — and the `--web` fallback dev launcher (`start_dev.sh`) makes this worse by **force-killing** any process already on port 8000 or 3420, violating the product requirement that SprintLogic must never claim or evict ports another project the developer is working on might be using. The Tauri desktop path already does this correctly (random OS-assigned port); the fix is to make the rest of the app consistent with it.
2. The backend never runs Alembic migrations at startup — only `CREATE TABLE IF NOT EXISTS` — so any user who updates the desktop app on top of an existing local database risks `OperationalError: no such column`.
3. The chat SSE stream has no cancellation; switching conversations mid-stream can corrupt the wrong conversation's messages.

Neither app has automated test coverage in the frontend (zero test files), and the backend's 86 tests are passing but thin relative to 149 app files.

---

## 1. Technology Stack

### Backend (`apps/api`)
- **Python ≥ 3.12** (pyproject.toml declares 3.12; the local dev `.venv` actually runs 3.14.3 — drift between declared minimum and dev environment).
- **FastAPI + uvicorn[standard]**, run embedded as a Tauri sidecar (dynamic port via socket FD, `[SPRINTLOGIC_READY::<port>]` handshake in `app/main.py:213-226`).
- **SQLAlchemy 2.0 (async) + aiosqlite + Alembic** — local SQLite persistence.
- **litellm + openai** — multi-provider LLM gateway (`app/infrastructure/llm/litellm_gateway.py`).
- **tree-sitter** (python/typescript/java/php/go/html/css/markdown) — multi-language parsing for the code graph.
- **onnxruntime + tokenizers + numpy** — local embeddings for semantic search / insight worker.
- **networkx** — dependency graph / blast-radius analysis.
- **sqlglot** — SQL schema introspection (DB Studio).
- **keyring** — OS keychain for credentials (not flat files).
- **sse-starlette, aiofiles, watchfiles, pathspec, jinja2**.

**Architecture**: explicit layering under `app/`: `domain/` (models, schemas, 3 domain ports, exceptions), `application/` (use cases: insight_worker, ai_agent, delta_sync, tdd_guard, cli), `infrastructure/` (18 subpackages), `interfaces/api/v1/` (23 routers). Domain layer verified clean (zero imports of infrastructure/interfaces). Weakness: routers mostly instantiate concrete SQLAlchemy repositories directly instead of going through a domain port — hexagonal only at the core, not at the edges.

### Frontend (`apps/web`)
- **Next.js 16.2.6**, static export (`output: "export"`, `next.config.ts:5`) — no server routes, everything ships as static assets inside Tauri.
- **React 19.2.4** with `babel-plugin-react-compiler` installed as a devDependency, but **not enabled** in `next.config.ts` (no `experimental.reactCompiler` flag) and `reactStrictMode: false` — contradictory, since Strict Mode helps surface the exact impure-effect bugs the compiler needs to memoize safely.
- **Tauri v2.11** (Rust) + plugins `dialog`, `shell`, `fs`, `log`.
- **State**: Zustand 5 (24 domain stores) + TanStack Query 5 (provider mounted globally but barely used — most data fetching is manual `fetch` + `useState/useEffect`, not `useQuery`).
- **Editor**: Monaco (`@monaco-editor/react`) + `monaco-vim`. LSP was replaced by a custom WebSocket channel (`senseiStore.ts`) pushing AST/lint markers applied via `monaco.editor.setModelMarkers` — not a real LSP.
- **Graph**: `react-force-graph-2d` + `d3-force`, feature-sliced into granular hooks (data/physics/canvas/viewport/interaction/animation).
- **LLM streaming**: `@microsoft/fetch-event-source` is declared as a dependency but has **zero imports** — real streaming uses manual `fetch()` + `ReadableStream` for HTTP and a custom WebSocket for "Sensei" mode; native `EventSource` is used separately for Kanban/Insights/Scan progress SSE.
- **UI**: shadcn/ui + Radix + Tailwind v4, `@dnd-kit` (Kanban), `three.js` (DB Studio ER view only).
- **No test infrastructure**: no `__tests__`, no `*.test.ts(x)`, no `test` script, no testing library installed.

---

## 2. Bugs (verified in current code)

### Backend

| # | Location | Issue |
|---|---|---|
| B1 | `app/interfaces/api/v1/sync.py:238` | Bare `except:` inside the chat WebSocket streaming loop — catches `CancelledError`/`BaseException` too, can leave a streaming task in an inconsistent state on shutdown/disconnect; malformed chunks are silently dropped with no log. |
| B2 | `app/main.py` startup vs `migrations/versions/*` | Startup only runs `Base.metadata.create_all` (creates missing tables, never alters existing ones). Alembic (`alembic upgrade head`) is never invoked from application code — only from a manual dev setup script (`infra/scripts/setup.sh:22`). With 20 revisions that add columns to existing tables, a desktop-app update over an existing user database risks `no such column` errors in production. |
| B3 | `app/infrastructure/db/models.py:259-269` (`TelemetryPingModel`) | Neither `timestamp` nor `project_id` is indexed, despite being the filter columns for every insights-dashboard query (`insights.py:91,132,149,165`) — guaranteed full table scan, worsening as the telemetry daemon keeps inserting pings. |
| B4 | `app/infrastructure/db/models.py:228-236` (`SearchIndexModel`) + `projects/memory.py:106,197-203` | Docstring claims "FTS5 search index" but the table is a plain SQL table with no index; the search does `name LIKE %q% OR path LIKE %q% OR content LIKE %q%` — a leading-wildcard triple full scan that couldn't use an index even if one existed. |

### Frontend

| # | Location | Issue |
|---|---|---|
| F1 | `src/store/senseiStore.ts:152`, `src/components/KanbanBoard.tsx:557`, and `src/app/page.tsx:468` (all `http(s)://…:8000/...`) | Hardcoded port `8000`, ignoring the dynamically-resolved sidecar port already used correctly elsewhere (`src/lib/api.ts:76-84`, `API_BASE_URL` set via `invoke("get_sidecar_port")`). Breaks the AST-sync/Sensei WebSocket, the Kanban live-update SSE feed, and node lookup on any build — packaged **or dev** — where the sidecar doesn't land on port 8000 (it's a random OS-assigned port by design). |
| F1b | `start_dev.sh:94-104` (dev launcher) | The dev launcher **force-kills** whatever process is already listening on ports 8000 and 3420 (`fuser -k -9 8000/tcp`) before starting anything, instead of picking free alternate ports. **Correction to the initial finding**: this force-kill is not scoped to the `--web` fallback path — it runs *unconditionally*, before the mode branch, so it also fires on every normal Tauri desktop dev launch (`start_dev.sh` with no args), even though only the `--web` branch actually needs port 8000 for its own uvicorn. This is a direct product-requirement violation: SprintLogic is meant to run *alongside* whatever project the developer is actively working on, and must never claim or evict ports another project's dev server/API might be using. **Fixed** — see docs/audits/action-plan-2026-09-04.md item #2. |
| F2 | `src/components/editor/hooks/useSenseiContext.ts:22-25` + `senseiStore.ts:148-150` | The Sensei socket is a single global singleton with no reference counting. Closing one `EditorTab` (split view supports several) unconditionally calls `disconnectSocket()`, killing sync/linting for every other open editor. `connectSocket(projectId)` also ignores its `projectId` argument, so a second open project reuses the first project's socket. |
| F3 | `src/components/SprintLogicChat.tsx:433-545` | No `AbortController` around the chat SSE read loop. Starting a new chat or switching conversations while a stream is in flight lets the old loop keep calling `setMessages` against the new conversation's state, corrupting the last visible message. The WebSocket path in the same file also never deregisters its `addSocketListener` on unmount unless `is_done` was already received. |
| F4 | `src-tauri/capabilities/default.json` vs `AIReportViewer.tsx:61,72` | Capabilities only declare `core:default`, `dialog:default`, `shell:default` — no `fs:*` permission, despite `tauri-plugin-fs` being initialized and `writeTextFile` being called. The failure is masked by a silent `catch` that falls back to a browser Blob download, so "Save As" appears to work but likely writes to the Downloads folder instead of the chosen path. |
| F5 | `src/components/ChatHistoryDrawer.tsx:44`, `SprintEpicManagerModal.tsx:99,110`, `ExecutionRoomTab.tsx:213` | `confirm()`/`window.confirm()` used directly, without the `@tauri-apps/plugin-dialog` replacement already applied in `ReportHistoryPanel.tsx`/`AIReportViewer.tsx` — inconsistent, broken confirmation dialogs under WebKitGTK. |
| F6 | `src/components/graph/hooks/useGraphPhysics.ts:32-153` | Effect deps include `displayGraphData.nodes`, a new array reference on every focus-node change or type filter toggle (`useGraphData.ts:242-268`). This triggers a full `d3ReheatSimulation()` and resets `initialFitDoneRef`, forcing a disruptive re-layout for what should be a cheap visual filter. |
| F7 | `src/components/KanbanBoard.tsx:558-559` | `JSON.parse(event.data)` inside `EventSource.onmessage` with no `try/catch` and no `onerror` handler — a malformed server message throws inside the callback with no recovery or user feedback. |
| F8 | `src/components/git-studio/CommitGraph.tsx:91-94` | Clickable commit row is a plain `<div onClick>` with no `role="button"`, `tabIndex`, or `onKeyDown` — unreachable by keyboard/screen reader. Not covered by the recent a11y PRs, which focused on icons and drawers. |

---

## 3. Technical Debt

### Backend
- **Inconsistent blocking I/O**: `app/utils/async_io.py` exists and is correctly used in `git_gateway.py` and `projects/memory.py`, but plain synchronous `open()`/`os.walk` inside `async def` handlers remain in `doc_studio.py` (audit_doc does a full synchronous `os.walk`, line 219), `chat.py:525,631`, `security_studio.py:153`, `graph.py:315`, `test_studio.py:87,158,176`.
- **Duplicated constant**: `MAX_FILE_BYTES = 500_000` copy-pasted in 8 different files instead of one shared config module.
- **Silent `except Exception: pass`**: 7 instances, most benign (temp-file cleanup, framework detection) but `settings.py:266-267,347-348` swallow provider-listing failures with no log, and `insight_worker.py:264-265` swallows a possible commit error.
- **Dead stub**: `sync.py:66` `debounced_lint()` waits 2s and does nothing (`# TODO: Run actual tree-sitter AST auditing here`) — the real-time linting feature it implies isn't implemented.
- **Deprecated APIs**: `datetime.utcnow()` used throughout `models.py`; `class Config` (Pydantic v1 style) in `omni_pad.py:20` and `prompt_schemas.py:22` instead of `ConfigDict`.
- **`mypy strict=false`**, `ruff ignore = ["E402","E501","E722"]` — unchanged since prior audits; directly explains why the one bare-except (B1) wasn't caught by lint.
- **Tests**: 86 tests, all passing, no skips/xfails — but no `pytest-cov`, so real coverage of 149 app files (23 routers, multi-language parsers, embeddings, LLM gateway) is unmeasured and likely thin.

### Frontend
- **Zero test coverage**: no test framework installed at all.
- **`as any`**: 25 occurrences (`GraphScene.tsx:110,241,285`, `lib/api.ts`, etc.).
- **`eslint-disable`**: 59 occurrences, several silencing `react-hooks/exhaustive-deps` — the exact rule that would have caught F2/F3-style stale-closure bugs.
- **Monolithic components** (33 files > 300 lines): `KanbanBoard.tsx` (1909 lines), `PlanningStudioTab.tsx` (1314), `lib/api.ts` (1266 — every backend endpoint in one file), `AIProvidersSection.tsx` (1195), `LLMSettingsPanel.tsx` (1164), `DatabaseStudioTab.tsx` (1077), `ExecutionRoomTab.tsx` (1042), `InsightDashboard.tsx` (954), `app/page.tsx` (953).
- **Duplicated error-silencing**: `src/app/layout.tsx:37-155` (inline script monkey-patching `console.error`/clipboard/global error listeners) and `src/components/ErrorSilencer.tsx` do the same substring-based error filtering twice, independently — risk of masking real production errors.
- **Dead dependencies**: `@gitgraph/react`, `react-force-graph-3d`, `force-graph`, `@microsoft/fetch-event-source` are declared but unused in `src/`.
- **`tsconfig.json`** has `strict: true` but lacks `noUncheckedIndexedAccess`/`noImplicitOverride`/`exactOptionalPropertyTypes`, which would be warranted given the volume of `as any` around array/map access in the graph code.

---

## 4. Security

### Backend
- **CORS** (`app/main.py:121-127`): fixed allowlist (`tauri://localhost`, `localhost:3420`, `localhost:3000`), `allow_credentials=True`, `allow_methods/headers=["*"]`. Not wildcard-open as previously assumed. The server binds loopback-only (`sock.bind(("127.0.0.1", 0))`), which mitigates network exposure — but there is **no authentication at all** (`app/infrastructure/auth/` is an empty package), so the standard "unauthenticated localhost API" risk pattern applies (any local process/browser tab could in principle hit it).
- **No security headers whatsoever**: confirmed zero occurrences of CSP/`X-Frame-Options`/`X-Content-Type-Options`/`Referrer-Policy` in the backend, which also serves the compiled frontend via `StaticFiles`.
- **Rate limiting**: correctly implemented (token bucket) and applied to every paid-LLM endpoint (`ai.py`, `chat.py`, `execution.py`, `graph.py`); the only unprotected `ai.py` endpoints don't call an LLM.
- **Archive extraction (zip/tar-slip)**: fix verified correct — path resolution + `is_relative_to()` guards, plus empty-name/path guards, matching the 4 recent security PRs.
- **Path traversal**: `resolve_project_path` is used consistently, with one inconsistency at `doc_studio.py:254` (`audit_doc`) which builds a path without going through it — low practical risk since the input comes from a filesystem scan, not direct user input, but it breaks the pattern used everywhere else.
- **SQL injection**: all `text(f"...")` usage (`insights.py`) only interpolates a fixed constant fragment, never the actual parameter, which is passed via bound `params` — not exploitable, but a fragile pattern worth tightening.
- **Command injection**: every `subprocess`/`create_subprocess_exec` call uses argument lists (never `shell=True`); branch names are sanitized to `[a-zA-Z0-9-]` before reaching `git checkout -b`.
- **Secrets**: OS keyring with env-var fallback, no flat-file secrets, no docker-compose artifact exists in the repo anymore (previously-flagged issue no longer applies).

### Frontend (Tauri)
- **CSP** (`tauri.conf.json`): `default-src 'self'; script-src 'self'; connect-src 'self' http://localhost:*` — reasonably strict, no `unsafe-inline`/`unsafe-eval`. No explicit `style-src`, which falls back to `default-src 'self'` (no inline styles allowed) — yet the app has 42 `style={{...}}` JSX usages and direct DOM style mutation in `useVimMode.ts:52-61`. This is a **real risk of UI breakage under strict CSP enforcement in the packaged WebView** that should be manually verified in a built binary.
- **Capabilities**: minimal and correctly scoped (`core:default`, `dialog:default`, `shell:default` — `shell:default` only allows `shell.open`, not arbitrary execution) — but inconsistent with actual `fs` usage (see F4).
- **Markdown rendering**: `react-markdown` used without `rehype-raw`, so LLM-generated HTML in the chat is not interpreted as raw HTML — safe by default configuration, not by explicit sanitization.
- **Prompt injection**: no automatic injection of project files (README, config) into the LLM was found. The one legitimate "editable system prompt" surface (`PromptRegistrySection.tsx`) is an intentional feature with server-side validation, not a vulnerability.

---

## 5. Performance

### Backend
- **N+1 queries**: confirmed fixed across three independent recent PRs (projects router, kanban tickets, insight_worker — batch `IN` fetch + in-memory grouping verified in current code). No new N+1 patterns found in routers.
- **Blocking I/O in async routes**: partially fixed (git diff, memory/search indexing use `asyncio.to_thread` correctly) but still present in `doc_studio.py` (full synchronous `os.walk` + up to 100KB of RAG context reads on every request), `chat.py`, `test_studio.py`, `security_studio.py`, `graph.py:315` — these block the FastAPI event loop for the full operation duration, stalling all other concurrent requests.
- **Missing indexes**: `TelemetryPingModel` (B3) is the highest-impact finding — an unbounded, ever-growing table scanned in full on every insights dashboard load.
- **Search**: `LIKE '%q%'` triple scan instead of real FTS5 (B4).
- **File-size guard**: `MAX_FILE_BYTES = 500_000` consistently enforced before parsing/embedding (mitigates tree-sitter/embedding memory blowups), though duplicated 8x makes it hard to tune centrally.

### Frontend
- **Code splitting**: well done — every heavy tab (`GraphScene`, Monaco editor, `DatabaseStudioTab`, chat, Kanban, etc.) is `next/dynamic({ ssr: false })`, so Monaco/three.js/force-graph only load when their tab opens.
- **Graph physics**: reasonable defaults (`d3AlphaDecay: 0.1`, `cooldownTicks: 100`, animation paused when idle) but undermined by the unnecessary full reheat on focus/filter changes (F6).
- **Chat streaming**: correct 100ms buffered flush to avoid a render-per-token — good pattern, undermined by the missing cancellation (F3).
- **React Compiler**: installed but not enabled (`next.config.ts` has no `experimental.reactCompiler` flag) — likely providing zero benefit currently despite being in the dependency tree.
- **No list virtualization**: `KanbanBoard.tsx`, `FileTree.tsx`, `ChatHistoryDrawer.tsx` have no `react-window`/`react-virtual` — will degrade with large boards/trees/histories.

---

## 6. Prioritized Action Plan

### Critical
1. **[Backend]** `app/main.py` — run `alembic upgrade head` programmatically at startup instead of relying solely on `Base.metadata.create_all`. Prevents broken updates on existing user databases (B2).
2. **[Frontend]** `senseiStore.ts:152`, `KanbanBoard.tsx:557` — replace the hardcoded port `8000` with the dynamically-resolved sidecar port, exactly as `lib/api.ts` already does (F1).
3. **[Frontend]** `SprintLogicChat.tsx:433-545` — add an `AbortController`, cancel the in-flight stream on unmount / new chat / conversation switch (F3).

### High
4. **[Backend]** `models.py` — add an index (ideally composite `(project_id, timestamp)`) to `TelemetryPingModel`, with an Alembic migration (B3).
5. **[Backend]** `sync.py:238` — replace the bare `except:` with a typed `except (json.JSONDecodeError, KeyError)` plus logging (B1).
6. **[Backend]** Migrate the remaining synchronous `open()`/`os.walk()` calls inside async handlers (`doc_studio.py`, `chat.py`, `test_studio.py`, `security_studio.py`, `graph.py:315`) to the existing `async_io.py` helpers.
7. **[Frontend]** Fix `fs` capability mismatch — either grant the needed `fs:*` permission in `capabilities/default.json` or remove the dead-end `writeTextFile` path in `AIReportViewer.tsx` (F4).
8. **[Frontend]** Finish the `confirm()` → Tauri dialog migration in the 3 remaining files (F5).
9. **[Frontend]** `useSenseiContext.ts`/`senseiStore.ts` — make the shared socket reference-counted and honor the real `projectId` instead of ignoring it (F2).
10. **[Frontend]** Verify, in a packaged build, whether the 42 inline `style={{...}}` usages render correctly under the current CSP; add explicit `style-src` if not.

### Medium
11. **[Backend]** Implement a real FTS5 search index or correct the misleading docstring/comment in `memory.py` (B4).
12. **[Backend]** Centralize `MAX_FILE_BYTES` into one config module.
13. **[Backend]** Add minimal security headers middleware (`X-Content-Type-Options`, `X-Frame-Options`) since the backend also serves the static frontend.
14. **[Frontend]** `useGraphPhysics.ts` — decouple structural reheat from focus/filter changes (F6).
15. **[Frontend]** Add `try/catch` + `onerror` around the Kanban `EventSource` handler (F7).
16. **[Frontend]** Add keyboard support (`role="button"`, `tabIndex`, `onKeyDown`) to `CommitGraph.tsx`'s clickable rows (F8).
17. **[Frontend]** Remove dead dependencies (`@gitgraph/react`, `react-force-graph-3d`, `force-graph`, `@microsoft/fetch-event-source`) or actually adopt the last one for the manual SSE/stream code.
18. **[Frontend]** Collapse the duplicate error-silencing mechanism (`layout.tsx` script + `ErrorSilencer.tsx`) into one, narrowly scoped.

### Low
19. **[Backend]** Replace deprecated `datetime.utcnow()` and Pydantic v1 `class Config` usages.
20. **[Backend]** Implement or remove the `debounced_lint()` stub in `sync.py:66`.
21. **[Backend]** Add logging to the silent `except Exception: pass` blocks in `settings.py`.
22. **[Frontend]** Re-enable `reactStrictMode: true` — directly relevant given the socket/listener lifecycle bugs found (F2/F3).
23. **[Frontend]** Either enable `experimental.reactCompiler` or drop the unused `babel-plugin-react-compiler` dependency.
24. **[Frontend]** Introduce Vitest + Testing Library, starting with `graph/hooks/*` and `lib/api.ts`.
25. **[Frontend]** Split `lib/api.ts` (1266 lines) into per-domain modules.

---

## Appendix — Previously reported issues, current status

| Issue (from earlier audits) | Status |
|---|---|
| Zombie sidecar process on app close | **Fixed** for dev flow (`src-tauri/src/lib.rs:89-121`); production sidecar lifecycle not directly verifiable from source alone. |
| `window.confirm` broken under Tauri | **Partially fixed** — 2 files migrated, 3 files still broken (F5). |
| N+1 queries in API | **Fixed** (3 independent PRs, verified in code). |
| Archive extraction path traversal / empty names | **Fixed**, verified correct against zip/tar-slip and empty-name edge cases. |
| Blocking I/O without `asyncio.to_thread` | **Partially fixed** — git diff and memory/search paths fixed; 6+ other routers still block the event loop. |
| Missing rate limiting on paid LLM endpoints | **Fixed** — token-bucket limiter applied consistently. |
| Permissive CORS / secrets in docker-compose | CORS is an allowlist, not wildcard (lower risk than assumed); no docker-compose artifact exists anymore. |
| `mypy strict=false`, ruff ignoring E402/E501/E722 | **Unchanged** — still in effect, directly correlated with bug B1. |
