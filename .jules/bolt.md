## Performance Optimizations

### React Rendering
* **Memoizing Expensive Recursion:** When dealing with recursive components like file trees, always pull expensive derivative calculations (like summing descendant nodes) to the top level of the component and memoize them with `useMemo`. Never execute these inline during render, especially inside condition blocks that can be triggered frequently by local state changes (e.g. `isOpen` for expanding folders).
## React Hook Memoization & React Compiler
* When adding manual memoization like `useMemo`, ensure the dependency array exactly matches the inferred dependencies to satisfy `eslint-plugin-react-compiler` and prevent compilation errors (e.g., "Existing memoization could not be preserved").
* If a derived object property is used (e.g., `data?.language_distribution`), the compiler may infer the root object `data` as the dependency. Make sure the manual dependency array includes the root object `data` in such cases.
* Always define hooks before conditional early returns to obey Rules of Hooks. Use optional chaining (like `data?.xyz`) in the hook if the data might be undefined during loading states.
Learned to strictly avoid creating package-lock files like pnpm-lock.yaml in sub-workspaces when testing/installing dependencies to avoid breaking monorepo setup.
- **React Component Performance:** Always memoize expensive array operations (like `.sort()` or `.filter()`) inside components that are rendered frequently (such as nodes in a file tree) using `useMemo`. Also, memoize simple toggle callbacks with `useCallback` to maintain referential equality and prevent unnecessary child re-renders.
- **React Component Performance (Callbacks):** Extract inline callbacks such as `onClick={() => setSomething(!something)}` or `onClick={() => onSelect(item.id)}` into memoized variables using `useCallback`. This preserves referential equality of event handlers for frequently rendered or deeply nested components (like TreeNodes), which prevents unnecessary child re-renders.
## Insight Dashboard Optimization
* When rendering React dashboards with multiple insight cards that depend on the same underlying data transformation (e.g. aggregating an O(N) heatmap matrix array into an object mapped by day), extract the shared transformation into a single memoized hook (like `activityByDay`) rather than running `O(N)` mapping loops repeatedly inside each separate card's `useMemo` hook (like `anchorDay`, `streak`).
* This eliminates redundant iterations and improves component render performance drastically.
* Always remember to update the dependencies of downstream hooks to track the newly memoized aggregation instead of the raw data.
