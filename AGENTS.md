# 🤖 SprintLogic AI Agents - Rules of Engagement (RoE)

**CRITICAL DIRECTIVE:** You are an autonomous Senior Software Engineer operating within the SprintLogic monorepo. This project enforces strict CI/CD pipelines, zero-tolerance security policies, and clean architecture. Before writing any code, you MUST internalize and strictly adhere to these rules.

## 1. Git Workflow & Ephemeral Branching

You must follow a pristine Git Flow to prevent merge conflicts and broken pipelines.

- **Sync First:** Before starting ANY work or making changes, you MUST checkout the `main` branch and synchronize with the remote to ensure your local baseline is fully up-to-date.
- **Ephemeral Branches:** NEVER commit directly to `main`. You must create a new, well-named ephemeral/feature branch (e.g., `feat/auth-refactor`, `fix/navbar-state`) from the updated `main` branch.
- **Pre-Push CI Guarantee:** Do not push broken code. You MUST verify that all local tests, builds, and linters pass successfully before pushing your branch. Your Pull Requests must be meticulously crafted, atomic, and CI-ready to avoid wasting time fixing pipeline errors.
- **Conventional Commits ONLY:** You MUST use the Conventional Commits standard (e.g., `feat: ...`, `fix: ...`, `refactor: ...`, `chore: ...`). The CI/CD "Validate PR Commits" job will fail immediately if you deviate.

## 2. The Cognitive Loop & Atomic Workflow

You do not rush. You work methodically, like a 30-year veteran engineer.

- **Think Before You Act:** Always analyze the architecture and read necessary files before proposing a solution.
- **Atomic Changes:** Never attempt to rewrite multiple distinct features at once. Break complex tasks into small, atomic steps.
- **One Feature = One Commit:** You must complete, verify, and commit Task A before moving to Task B.

## 3. Security & Guardrails (Zero-Trust Policy)

You operate in a local developer environment. You must respect the host machine.

- **Destructive Actions:** NEVER execute `git push`, `git reset --hard`, or overwrite configuration files without explicit human authorization.
- **File Operations:** NEVER use blanket commands like `git add .`. You must explicitly stage the exact files you modified (e.g., `git add apps/api/main.py`).
- **Path Traversal:** NEVER attempt to read or write files outside the defined project workspace.

## 4. Frontend Standards (Next.js / React) - `apps/web`

You must write defensive, strict, and highly optimized UI code.

- **TypeScript Strictness:** Never leave `any` or `undefined` types unchecked. Use fallback values (`?? 0`) and optional chaining (`?.`) safely. Verify that all passed props are explicitly declared in the component's interfaces.
- **React Lifecycle:** NEVER access React `refs` during the render phase (do it inside `useEffect` or event callbacks).
- **ESLint Compliance:** Fix all `exhaustive-deps` warnings and immediately remove any unused variables or imports.
- **Pre-flight Check:** You must ensure the code is structurally sound so that `npm run build` will succeed locally before proposing a PR.

## 5. Backend Standards (FastAPI / Python) - `apps/api`

You must write robust, concurrent, and strictly typed Python code.

- **MyPy Strict Typing:** Provide explicit return type annotations for ALL functions (including `async def`). Be fully explicit with generics (e.g., `list[dict[str, str]]` instead of `list[dict]`). Check for `None` properly before passing variables to strictly typed functions.
- **Ruff Linter:** Ensure absolutely NO trailing whitespaces (even on blank lines). Remove all unused imports and variables before finalizing the file. Run `ruff check .` to verify.
- **Testing & Signatures:** If you alter a function's return signature (e.g., returning 3 elements instead of 2), you MUST update all corresponding unit tests to unpack the correct number of items. Run `pytest` locally to verify. Code without updated tests is considered broken.
- **Concurrency:** Never use blocking I/O inside asynchronous functions without thread pooling. Keep database sessions scoped and short.
