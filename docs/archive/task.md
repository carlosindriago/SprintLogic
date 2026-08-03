# Planning Studio Agentic Workspace

- [x] 1. Create `planning_studio.py` (FastAPI router) with `gemini-2.5-pro` function calling for `render_wbs_tree`.
- [x] 2. Register it in `main.py`.
- [x] 3. Update `api.ts` with `sendPlanningMessage`. If using SSE (Streaming), handle chunks correctly (text first, then `tool_calls`). If using standard HTTP JSON response, just ensure it returns the text and the WBS json.
- [x] 4. Add `'planning-studio'` to `tabsStore.ts`.
- [x] 5. Build `PlanningStudioTab.tsx` with a Split Screen layout (Flex/Grid). The chat on the left must be able to catch the `render_wbs_tree` tool payload and pass it to the WBS tree view on the right.
- [x] 6. Modify `AIReportViewer.tsx` to launch the `planning-studio` tab instead of a modal, seeding it with the initial context.
