# Bolt.md

Performance optimization insights.

*   React callbacks should be wrapped in `useCallback` when passed as props to child components or used as dependencies in `useEffect`. Empty dependency arrays `[]` are safe for `setState` callbacks or stable event handlers that do not depend on state or props.
*   Make sure to update dependency arrays to satisfy ESLint hooks plugins. For example, if a `useEffect` calls a newly memoized callback, that callback must be added to the `useEffect`'s dependency array.
- Performance Coding Standards (JavaScript Engine): Inside high-frequency execution loops (like D3 force ticks or canvas rendering), avoid using `WeakMap` for caching due to lookup overhead in V8. For mutable objects like D3 nodes, cache pre-computed values via direct object property mutation for optimal performance.
