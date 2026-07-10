# Git Workflow

## 1. Branching Strategy
We use a lightweight, Trunk-Based Development approach adapted for solo/small teams.

- `main`: The single source of truth. Always deployable and pristine.
- Ephemeral branches: Branches created off `main` for specific features, fixes, or chores. Must be short-lived.

## 2. Naming Conventions

All ephemeral branches must follow the `type/scope` format.

- `feat/<scope>`: For new features (e.g., `feat/kanban-board`).
- `fix/<scope>`: For bug fixes (e.g., `fix/auth-token-leak`).
- `chore/<scope>`: For maintenance, dependencies, or configuration (e.g., `chore/update-deps`).
- `docs/<scope>`: For documentation updates (e.g., `docs/api-spec`).
- `refactor/<scope>`: For code restructuring without behavior changes (e.g., `refactor/api-controllers`).

## 3. Atomic Commits

We strictly follow the [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/) specification. A commit should be atomic, meaning it only contains changes related to a single, logical concept.

Format: `<type>[optional scope]: <description>`

Examples:
- `feat(ui): implement draggable kanban columns`
- `fix(api): resolve memory leak in project parser`
- `refactor(core): decouple database adapter`

Do not mix a whitespace formatting chore with a feature addition in the same commit.

## 4. The Loop

1. Sync local `main` with remote: `git checkout main && git pull origin main`
2. Create a new branch: `git checkout -b feat/my-new-feature`
3. Write code, tests, and documentation.
4. Stage specific files (never `git add .` blindly).
5. Create atomic commits.
6. Push to remote: `git push -u origin HEAD`
7. Open a Pull Request against `main`.
8. Ensure CI passes (linter, tests, build).
9. Squash and merge into `main`.
10. Delete the ephemeral branch locally and remotely.

## 5. Security & Safety Guards

- Never force push (`--force`) to `main`.
- Never rewrite history on a shared branch.
- Pre-commit hooks will enforce linting and conventional commit message formats.
