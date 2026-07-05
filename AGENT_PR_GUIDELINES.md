# Agent Instructions for Pull Requests (SprintLogic)

As an AI agent working on the SprintLogic monorepo, you MUST adhere strictly to the following rules before creating a Pull Request or pushing code. Our CI/CD pipeline is extremely strict, and any violation of these rules will result in a failed build. 

## 1. Commits and PR Metadata
- **Conventional Commits**: You MUST use Conventional Commits for ALL commit messages and the Pull Request title (e.g., `feat: ...`, `fix: ...`, `perf: ...`, `chore: ...`). The `Validate PR Commits` CI job will fail immediately if you don't.
- **PR Size Budget**: Keep PRs atomic and focused. Do not combine massive refactors with feature development.

## 2. Web Frontend (Next.js & React)
- **TypeScript Strictness**: 
  - Do NOT leave `any` or `undefined` types unchecked. 
  - Always verify that properties exist on the interface (e.g., if you pass a prop in `page.tsx`, it MUST be defined in the component's interface).
  - Use optional chaining (`?.`) and nullish coalescing (`??`) when dealing with optional properties (e.g., `(b.ahead ?? 0) > 0`).
- **ESLint & Hooks**:
  - Fix all `eslint` warnings before pushing.
  - NEVER access React `refs` during the render phase. Access them only inside `useEffect`, `useCallback`, or event handlers.
  - Ensure all dependencies are correctly listed in dependency arrays (`exhaustive-deps`).
- **Validation**: BEFORE pushing web changes, run `npm run build` inside `apps/web`. If the build fails locally, DO NOT push.

## 3. Backend (FastAPI & Python)
- **MyPy Type Checking**: 
  - Provide return type annotations for ALL functions (including `async def`).
  - Be explicit with generic types (e.g., use `list[dict[str, str]]` instead of `list[dict]`).
  - Check for `None` before passing variables to strict functions (e.g., use `assert session is not None` or explicit typing).
- **Ruff Linter**:
  - Ensure there is NO trailing whitespace, including on blank lines.
  - Remove all unused imports and variables.
  - Run `ruff check .` inside `apps/api` to validate before pushing.
- **Pytest**:
  - Run `pytest` inside `apps/api` before pushing. 
  - If you change a function signature (e.g., returning 3 items instead of 2), you MUST update the corresponding unit tests to unpack the correct number of items.

## 4. General Workflow
- Never assume a change is "small enough to skip tests". The CI will catch it.
- Always check for potential regressions or conflicts. If you are modifying a core component like `EditorTab`, double-check its usages across the app.
