## 2024-07-04 - Kanban Drag and Drop Performance
**Learning:** `getTasksByStatus(col.id)` running `.filter` on the entire tasks array for every element mapping inside a React render loop was causing O(C * N) scaling problems and UI jank during SortableContext interactions on `KanbanBoard.tsx`.
**Action:** Use `useMemo` with `.reduce` to construct an O(N) lookup dictionary (`tasksByStatus`) to avoid N-length loops inside maps on every re-render.
