## Performance Optimizations

### React Rendering
* **Memoizing Expensive Recursion:** When dealing with recursive components like file trees, always pull expensive derivative calculations (like summing descendant nodes) to the top level of the component and memoize them with `useMemo`. Never execute these inline during render, especially inside condition blocks that can be triggered frequently by local state changes (e.g. `isOpen` for expanding folders).
