# 4. Monaco Editor and Flexbox Layout Strategy

Date: 2026-07-07

## Status

Accepted

## Context

We integrated the `monaco-editor` inside a horizontal split-pane layout to display a Code Coach Sidebar on the right. Initially, we used the `react-resizable-panels` library (via Shadcn `ResizablePanelGroup`) to handle the dynamic width. 

However, we encountered a severe layout bug where the Code Coach Sidebar was completely crushed to the right edge (or entirely off-screen). The root cause was a battle between Flexbox percentages and Monaco's internal dynamic sizing:
- By default, Monaco tries to aggressively fill its flex container by setting `width: 100%`.
- `react-resizable-panels` sets virtual flex basis (e.g. `flex: 75 1 0px`) without enforcing rigid pixel bounds.
- When rendered together without absolute bounding boxes, Monaco forces the flex layout to expand beyond the viewport's limits, rendering the 25% sidebar useless or squeezing it to 1 character wide.

## Decision

We have decided to drop the complex abstraction of `react-resizable-panels` for the primary IDE split layout in `EditorTab.tsx`, and instead use a **strict, native CSS Flex layout** with fixed constraints.

The implemented solution follows these rules:
1. The wrapper element uses `flex flex-row w-full h-full` and strictly declares `overflow-hidden` to prevent horizontal scrolling.
2. The Monaco Editor pane acts as the primary flexible area (`flex-1`).
3. The Sidebar pane uses a fixed pixel width (`w-[350px]`) and `shrink-0` to guarantee it never collapses.
4. A standard `div` acts as a static handle. 
*(If drag-to-resize is required in the future, we will implement a custom drag hook on this handle that strictly modifies the pixel width of the right panel, rather than relying on an opaque library).*

## Consequences

### Positive
- **Guaranteed Layout Stability:** The sidebar will never be crushed by Monaco, regardless of when Monaco mounts or calculates its internal size.
- **Simpler DOM:** Removes a massive layer of complexity and extra DOM nodes that Shadcn's wrappers were injecting.
- **Eliminated Hydration Warnings:** Solved Next.js/React warnings regarding `autoSaveId` leakage to DOM nodes.

### Negative
- **No drag-to-resize (for now):** The user cannot resize the sidebar by dragging out-of-the-box. This will require a custom hook implementation in the future if resizing is strictly demanded.
