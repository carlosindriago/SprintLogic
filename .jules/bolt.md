## 2024-07-04 - Kanban Drag and Drop Performance
**Learning:** `getTasksByStatus(col.id)` running `.filter` on the entire tasks array for every element mapping inside a React render loop was causing O(C * N) scaling problems and UI jank during SortableContext interactions on `KanbanBoard.tsx`.
**Action:** Use `useMemo` with `.reduce` to construct an O(N) lookup dictionary (`tasksByStatus`) to avoid N-length loops inside maps on every re-render.
- In high-frequency rendering contexts (like React Force Graph's canvas painting), avoid string allocations and transformations (like `.toLowerCase()`) inside the render loop. Memoize them outside the loop using `useMemo` to prevent garbage collection spikes and maintain 60 FPS.
