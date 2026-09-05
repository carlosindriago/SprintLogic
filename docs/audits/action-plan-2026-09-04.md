# SprintLogic — Action Plan (2026-09-04)

Derived from [`technical-audit-2026-09-04.md`](./technical-audit-2026-09-04.md). 25 items, ordered from most to least important. Each item is independently actionable — no ordering dependency between items unless noted.

Legend: **Area** = which app; **Effort** = rough size (S = under an hour, M = a session, L = needs its own migration/design pass).

## Progress at a glance

**23 / 25 done** — all of Critical, all of High, all of Medium, and items 19–23 of Low. Next up: item #24.

| # | Status | PR |
|---|---|---|
| 1 | ✅ Done | [#200](https://github.com/carlosindriago/SprintLogic/pull/200) |
| 2 | ✅ Done | [#201](https://github.com/carlosindriago/SprintLogic/pull/201) |
| 3 | ✅ Done | [#202](https://github.com/carlosindriago/SprintLogic/pull/202) |
| 4 | ✅ Done | [#203](https://github.com/carlosindriago/SprintLogic/pull/203) |
| 5 | ✅ Done | [#204](https://github.com/carlosindriago/SprintLogic/pull/204) |
| 6 | ✅ Done | [#205](https://github.com/carlosindriago/SprintLogic/pull/205) |
| 7 | ✅ Done | [#206](https://github.com/carlosindriago/SprintLogic/pull/206) |
| 8 | ✅ Done | [#208](https://github.com/carlosindriago/SprintLogic/pull/208) |
| 9 | ✅ Done | [#210](https://github.com/carlosindriago/SprintLogic/pull/210) |
| 10 | ✅ Done | [#212](https://github.com/carlosindriago/SprintLogic/pull/212) |
| 11 | ✅ Done | [#214](https://github.com/carlosindriago/SprintLogic/pull/214) |
| 12 | ✅ Done | [#216](https://github.com/carlosindriago/SprintLogic/pull/216) |
| 13 | ✅ Done | [#218](https://github.com/carlosindriago/SprintLogic/pull/218) |
| 14 | ✅ Done | [#220](https://github.com/carlosindriago/SprintLogic/pull/220) |
| 15 | ✅ Done | [#222](https://github.com/carlosindriago/SprintLogic/pull/222) |
| 16 | ✅ Done | [#224](https://github.com/carlosindriago/SprintLogic/pull/224) |
| 17 | ✅ Done | [#226](https://github.com/carlosindriago/SprintLogic/pull/226) |
| 18 | ✅ Done | [#228](https://github.com/carlosindriago/SprintLogic/pull/228) |
| 19 | ✅ Done | [#230](https://github.com/carlosindriago/SprintLogic/pull/230) |
| 20 | ✅ Done | [#232](https://github.com/carlosindriago/SprintLogic/pull/232) |
| 21 | ✅ Done | [#234](https://github.com/carlosindriago/SprintLogic/pull/234) |
| 22 | ✅ Done | [#236](https://github.com/carlosindriago/SprintLogic/pull/236) |
| 23 | ✅ Done | [#238](https://github.com/carlosindriago/SprintLogic/pull/238) |
| 24–25 | ⬜ Not started | — |

All merges land on `develop` (not `main`): each item gets its own ephemeral branch, a PR into `develop`, and is deleted after merge.

---

## Critical — do these first, in order

- [x] **1. Run Alembic migrations at startup, not just `create_all`** — ✅ [PR #200](https://github.com/carlosindriago/SprintLogic/pull/200)
  Area: Backend · Effort: M
  File: `app/main.py` (lifespan)
  Fix: invoke `alembic.command.upgrade(cfg, "head")` programmatically before serving traffic, instead of relying solely on `Base.metadata.create_all`.
  Why first: without this, any app update over an existing user database can crash with `no such column` — it's a production data-integrity risk, not a code-quality one.

- [x] **2. Never hardcode or claim a fixed port — SprintLogic must not collide with the developer's own project** — ✅ [PR #201](https://github.com/carlosindriago/SprintLogic/pull/201)
  Area: Frontend + tooling · Effort: M
  Product principle (explicit user requirement): SprintLogic runs *alongside* whatever the developer is actively building. It must never assume, occupy, or evict a "commonly used" default port (8000, 3000, 5173, 8080, etc.) that the developer's own project's dev server or API might need at the same time.
  Sub-fixes:
  - [x] 2a. `src/store/senseiStore.ts:152`, `src/components/KanbanBoard.tsx:557`, `src/app/page.tsx:468` — replace the hardcoded `:8000` URLs with `API_BASE_URL` (`src/lib/api.ts`), which already resolves the real sidecar port via `invoke("get_sidecar_port")`.
  - [x] 2b. **`start_dev.sh:94-104`** — removed the `fuser -k -9` force-kill; `reap_stray_port()` now only kills a listener whose `/proc/PID/cwd` is inside this checkout, and the backend port is probed for the first free one instead of assumed.
  - [x] 2c. ~~CORS allowlist~~ — turned out unnecessary: the frontend dev port stays fixed (Tauri's `devUrl` requires it), only the *backend* port became dynamic in `--web` mode, and CORS cares about the frontend's origin, not the backend's own port. See PR #201 description.
  - [x] 2d. Superseded by 2b's cwd-based check — no separate PID-file mechanism needed.
  Why first: this isn't just a bug — `start_dev.sh` actively kills other developers' running processes today. That's actively destructive, not just broken.

- [x] **3. Add cancellation to the chat SSE stream** — ✅ [PR #202](https://github.com/carlosindriago/SprintLogic/pull/202)
  Area: Frontend · Effort: S
  File: `src/components/SprintLogicChat.tsx:433-545`
  Fix: wrap the fetch in an `AbortController`; abort on unmount, on `handleNewChat`, and on conversation switch. Also deregister the WebSocket listener on unmount unconditionally (not only after `is_done`).
  Why first: currently corrupts messages across conversations — a visible correctness bug in the main feature.

---

## High — schedule next

- [x] **4. Index `TelemetryPingModel` on `(project_id, timestamp)`** — ✅ [PR #203](https://github.com/carlosindriago/SprintLogic/pull/203)
  Area: Backend · Effort: S
  File: `app/infrastructure/db/models.py:259-269` + new Alembic migration
  Fix: added a composite `(project_id, timestamp)` index *and* a plain `timestamp` index (the global, no-project-filter dashboard endpoint needed the second one).

- [x] **5. Replace bare `except:` in chat WebSocket streaming** — ✅ [PR #204](https://github.com/carlosindriago/SprintLogic/pull/204)
  Area: Backend · Effort: S
  File: `app/interfaces/api/v1/sync.py:238`
  Fix: `except (json.JSONDecodeError, AttributeError, TypeError) as exc:` with logging (not `KeyError` as originally planned — the code uses `.get()` everywhere, which never raises it). `CancelledError` now propagates; covered by 2 new regression tests.

- [x] **6. Move remaining blocking I/O off the event loop** — ready on `fix/6-blocking-io-off-event-loop`, pending commit authorization
  Area: Backend · Effort: M
  Files: `app/interfaces/api/v1/doc_studio.py` (incl. `os.walk` at line 219), `chat.py:525,631`, `test_studio.py:87,158,176`, `security_studio.py:153`, `graph.py:315`
  Fix: routed through the existing `app/utils/async_io.py` helpers. Also converted `doc_studio.py`'s `scan_markdown_docs`/`scan_undocumented_code` calls (same bug, same endpoints, not in the original file:line list) and extracted the tree-building `os.walk` into `_build_project_tree_sync()` run via `asyncio.to_thread` — kept as one function because the ignored-dir pruning needs the live generator, not a materialized list.

- [x] **7. Fix the `fs` capability / `writeTextFile` mismatch** — ✅ [PR #206](https://github.com/carlosindriago/SprintLogic/pull/206)
  Area: Frontend · Effort: S
  Files: `src-tauri/capabilities/default.json`, `src/components/AIReportViewer.tsx:61,72`
  Fix: granted `fs:allow-write-text-file` (verified against this repo's own generated `gen/schemas/desktop-schema.json`) — no static `fs:scope` needed, since Tauri's `dialog.save()` already grants scope for the chosen path at runtime. Fallback now also toasts instead of only `console.warn`.

- [x] **8. Finish the `confirm()` → Tauri dialog migration** — ✅ [PR #208](https://github.com/carlosindriago/SprintLogic/pull/208)
  Area: Frontend · Effort: S
  Files: `src/components/ChatHistoryDrawer.tsx:44`, `src/components/SprintEpicManagerModal.tsx:99,110`, `src/components/ExecutionRoomTab.tsx:213`
  Fix: replaced with `confirm` from `@tauri-apps/plugin-dialog`, matching `ReportHistoryPanel.tsx`/`AIReportViewer.tsx`. `clearChatHistory` in `ExecutionRoomTab.tsx` had to become `async` (was sync).

- [x] **9. Make the Sensei WebSocket reference-counted and project-scoped** — ✅ [PR #210](https://github.com/carlosindriago/SprintLogic/pull/210)
  Area: Frontend · Effort: M
  Files: `src/components/editor/hooks/useSenseiContext.ts:22-25`, `src/store/senseiStore.ts:148-152`
  Fix: added `socketRefCount` + `socketProjectId`; `EditorTab.tsx` now actually passes its real `projectId` prop through (it never did before). Also fixed a race found during implementation: the old socket's async `onclose` could otherwise clobber the new one's state after a project switch.

- [x] **10. Verify inline styles under the packaged-app CSP** — ✅ [PR #212](https://github.com/carlosindriago/SprintLogic/pull/212)
  Area: Frontend · Effort: S (verification) / M (fix if broken)
  File: `src-tauri/tauri.conf.json`
  Fix: couldn't build+visually verify in this environment (no GUI/WebKitGTK harness available); verified the mechanism against Tauri's own docs/source instead (CSP only enforced in packaged builds, nonce injection doesn't cover the `style=""` attribute) and added `style-src 'self' 'unsafe-inline'` per user's choice, matching Tauri's own reference example.

---

## Medium

- [x] **11. Implement real FTS5 search or correct the misleading docstring** — ✅ [PR #214](https://github.com/carlosindriago/SprintLogic/pull/214)
  Area: Backend · Effort: M
  File: `app/interfaces/api/v1/projects/memory.py` (+ `models.py:228-236`)
  Turned out worse than documented: `project_memories` search was **completely broken** (MATCH against a plain table), not just slow. Implemented real FTS5 for both tables (user's explicit choice, accepting data loss on existing `project_memories` rows). Also had to fix a gap in item #1's bootstrap logic (`_CREATE_ALL_BASELINE_REVISION`) that this migration exposed, and reverted a pre-existing LIKE workaround in `ai_agent.py`'s `search_codebase` tool back to real MATCH.

- [x] **12. Centralize `MAX_FILE_BYTES`** — ✅ [PR #216](https://github.com/carlosindriago/SprintLogic/pull/216)
  Area: Backend · Effort: S
  Files: 9 occurrences (not 8), moved into `app/infrastructure/config.py`. Turned out only 2 of the 9 were ever actually used — the other 7 were dead copy-pasted constants, removed outright.

- [x] **13. Add minimal security headers middleware** — ✅ [PR #218](https://github.com/carlosindriago/SprintLogic/pull/218)
  Area: Backend · Effort: S
  File: `app/main.py` — `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: no-referrer`, CSP mirroring `tauri.conf.json`.

- [x] **14. Decouple graph reheat from focus/filter changes** — ✅ [PR #220](https://github.com/carlosindriago/SprintLogic/pull/220)
  Area: Frontend · Effort: M
  File: `src/components/graph/hooks/useGraphPhysics.ts:32-153`
  Fix: switched to the raw unfiltered node set (`graphData.nodes`) instead of the filtered `displayGraphData.nodes` — also fixed a deeper bug where domain-group target positions were being recomputed from whatever was currently filtered, not just an unnecessary reheat.

- [x] **15. Harden the Kanban `EventSource` handler** — ✅ [PR #222](https://github.com/carlosindriago/SprintLogic/pull/222)
  Area: Frontend · Effort: S
  File: `src/components/KanbanBoard.tsx:558-559` — added `try/catch` around `JSON.parse` and an `onerror` handler.

- [x] **16. Add keyboard support to clickable commit rows** — ✅ [PR #224](https://github.com/carlosindriago/SprintLogic/pull/224)
  Area: Frontend · Effort: S
  File: `src/components/git-studio/CommitGraph.tsx:91-94` — added `role="button"`, `tabIndex={0}`, `onKeyDown`, plus `aria-label` and a visible focus outline.

- [x] **17. Remove dead dependencies (or adopt them)** — ✅ [PR #226](https://github.com/carlosindriago/SprintLogic/pull/226)
  Area: Frontend · Effort: S
  Packages: `@gitgraph/react`, `react-force-graph-3d`, `force-graph`, `@microsoft/fetch-event-source` — removed (chat's manual SSE already has working cancellation from item #3).

- [x] **18. Collapse the duplicate error-silencing mechanism** — ✅ [PR #228](https://github.com/carlosindriago/SprintLogic/pull/228)
  Area: Frontend · Effort: M
  Files: `src/app/layout.tsx:37-155`, `src/components/ErrorSilencer.tsx` — turned out `ErrorSilencer.tsx` was dead code (never imported), removed. Narrowed `layout.tsx`'s `disposed`/`TextModel` checks to require both words together, grounded in Monaco's actual source error messages.

---

## Low

- [x] **19. Replace deprecated `datetime.utcnow()`** — ✅ [PR #230](https://github.com/carlosindriago/SprintLogic/pull/230)
  Area: Backend · Effort: S
  Files: `models.py` (30 sites, needed a zero-arg `_utcnow()` helper since it's passed by reference as a SQLAlchemy default), plus `kanban_repository.py` (9 sites) and `db_studio.py` (2 sites) not in the original scope.

- [x] **20. Migrate Pydantic v1 `class Config` to `ConfigDict`** — ✅ [PR #232](https://github.com/carlosindriago/SprintLogic/pull/232)
  Area: Backend · Effort: S
  Files: `omni_pad.py`, `prompt_schemas.py`, and `report_schemas.py` (a third file with the same pattern, not in the original list).

- [x] **21. Implement or remove the `debounced_lint()` stub** — ✅ [PR #234](https://github.com/carlosindriago/SprintLogic/pull/234)
  Area: Backend · Effort: M (implement) / S (remove)
  File: `app/interfaces/api/v1/sync.py:66` — wired to the existing `run_lint_immediate` heuristic instead of building real tree-sitter AST auditing (a separate feature).

- [x] **22. Log the silent `except Exception: pass` blocks** — ✅ [PR #236](https://github.com/carlosindriago/SprintLogic/pull/236)
  Area: Backend · Effort: S
  File: `app/interfaces/api/v1/settings.py:266-267,347-348`.

- [x] **23. Re-enable `reactStrictMode: true`** — ✅ [PR #238](https://github.com/carlosindriago/SprintLogic/pull/238)
  Area: Frontend · Effort: S (flag) / M (fixing whatever it surfaces)
  File: `next.config.ts:5`. Flag flipped, production build verified clean; actual dev-mode double-invoke behavior needs the user's own interactive testing (no GUI available here).

- [ ] **24. Resolve the React Compiler dependency**
  Area: Frontend · Effort: S
  File: `next.config.ts` — either add `experimental.reactCompiler: true` or drop the unused `babel-plugin-react-compiler` devDependency.

- [ ] **25. Introduce Vitest + Testing Library**
  Area: Frontend · Effort: L
  Start with `src/components/graph/hooks/*` and `src/lib/api.ts` (most reused, zero coverage). Split `lib/api.ts` into per-domain modules as part of this work (natural pairing, same file).

---

## Suggested execution order (sequencing notes)

1. Items **1–3** (critical) — no dependencies, do in parallel if working with more than one person.
2. Items **4–10** (high) — independent of each other; item **9** should land before item **23** (Strict Mode will otherwise double-fire the buggy socket lifecycle).
3. Items **11–18** (medium) — independent.
4. Items **19–24** (low) — independent, cheap cleanup.
5. Item **25** (tests) — do last, or interleave: write a regression test for each bug immediately after fixing it (1, 2, 3, 6, 9, 14) rather than waiting for a dedicated testing pass.
