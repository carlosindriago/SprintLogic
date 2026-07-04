# Contributing to SprintLogic

Thank you for your interest in contributing to **SprintLogic** — a local-first, AI-driven SDD command center for developers.

Before you dive in, please read this guide fully. We have a structured workflow to keep the project organized and maintainable.

---

## Table of Contents

- [Issue-First Workflow](#issue-first-workflow)
- [Label System](#label-system)
- [Development Setup](#development-setup)
- [Testing](#testing)
- [Commit Convention](#commit-convention)
- [Delivery Strategy for SDD Changes](#delivery-strategy-for-sdd-changes)
- [Pull Request Rules](#pull-request-rules)
- [Code of Conduct](#code-of-conduct)

---

## Issue-First Workflow

**No PR without an issue. No exceptions.**

This project follows a strict issue-first workflow:

1. **Open an issue** using the appropriate template (Bug Report or Feature Request)
2. **Wait for approval** — a maintainer will add the `status:approved` label when the issue is ready to be worked on
3. **Comment on the issue** to let others know you're working on it
4. **Open a PR** referencing the approved issue

PRs that are not linked to an approved issue will be **automatically rejected** by CI.

---

## Label System

### Type Labels (applied to PRs)

| Label | Description |
|-------|-------------|
| `type:bug` | Bug fix |
| `type:feature` | New feature or enhancement |
| `type:docs` | Documentation only |
| `type:refactor` | Code refactoring, no functional changes |
| `type:chore` | Build, CI, tooling changes |
| `type:breaking-change` | Breaking change |

### Size Labels (applied to PRs)

| Label | Description |
|-------|-------------|
| `size:exception` | Maintainer-approved exception for PRs above the 400 changed-line review budget |

### Status Labels (applied to Issues)

| Label | Description |
|-------|-------------|
| `status:needs-review` | Newly opened, awaiting maintainer review |
| `status:approved` | Approved for implementation — work can begin |
| `status:in-progress` | Being worked on |
| `status:blocked` | Blocked by another issue or external dependency |
| `status:wont-fix` | Out of scope or won't be addressed |

### Priority Labels

| Label | Description |
|-------|-------------|
| `priority:critical` | Blocking issues, security vulnerabilities |
| `priority:high` | Important, affects many users |
| `priority:medium` | Normal priority |
| `priority:low` | Nice to have |

---

## Development Setup

### Prerequisites

- Node.js (v18+)
- Python (3.10+)
- Rust (for Tauri)
- Git

### Clone and Build

```bash
git clone https://github.com/carlosindriago/SprintLogic.git
cd SprintLogic
```

### Run Locally

We use a monorepo structure. Run the provided script to start both the FastAPI sidecar and the Next.js frontend within Tauri:

```bash
./start_dev.sh
```

---

## Testing

### Unit Tests

*Documentation on running specific frontend (Vitest/Jest) and backend (Pytest) test suites will be added soon.*

---

## Commit Convention

This project uses [Conventional Commits](https://www.conventionalcommits.org/).

Commit messages **must** match this pattern:

```
^(build|chore|ci|docs|feat|fix|perf|refactor|revert|style|test)(\([a-z0-9\._-]+\))?!?: .+
```

### Format

```
<type>(<optional-scope>)!: <description>

[optional body]

[optional footer]
```

### Allowed Types

| Type | Purpose |
|------|---------|
| `feat` | New feature |
| `fix` | Bug fix |
| `docs` | Documentation only |
| `refactor` | Code change (no behavior change) |
| `chore` | Maintenance, dependencies, tooling |
| `style` | Formatting, linting (no logic change) |
| `perf` | Performance improvement |
| `test` | Adding or updating tests |
| `build` | Build system or external deps |
| `ci` | CI configuration |
| `revert` | Reverts a previous commit |

### Breaking Changes

Add `!` after the type/scope and include a `BREAKING CHANGE:` footer:

```
feat(api)!: rename v1 endpoints to v2

BREAKING CHANGE: the previous /api/v1 prefix has been changed to /api/v2.
```

Breaking changes map to the `type:breaking-change` label.

---

## Branch Naming

Branch names **must** match this pattern:

```
^(feat|fix|chore|docs|style|refactor|perf|test|build|ci|revert)\/[a-z0-9._-]+$
```

**Rules:**
- All lowercase
- Use hyphens, dots, or underscores as separators (no spaces, no uppercase)
- Description must be short and descriptive

**Examples:** `feat/local-sqlite`, `fix/fastapi-startup`, `docs/api-reference`, `ci/add-lint-job`

---

## Pull Request Rules

### Delivery Strategy for SDD Changes

Before implementation starts, always consider the **Review Workload Forecast**. This protects reviewers from one giant, exhausting PR when the work should be split.

| Strategy | Use when | What happens before apply |
|---|---|---|
| `ask-on-risk` | Default. Pause only when the forecast is risky. | If the forecast is high or above 400 changed lines, consider splitting or proceeding with `size:exception`. |
| `auto-chain` | You already know the change should be reviewed in slices. | Implement the next chained/stacked PR slice using work-unit commits. |
| `single-pr` | The change is small or must land atomically. | If the forecast exceeds 400 changed lines, wait until a maintainer approves `size:exception`. |

**Decision checklist:**

- [ ] Can one reviewer understand this in about 60 minutes?
- [ ] Is the PR at or below 400 changed lines?
- [ ] Does each work-unit commit include its code, tests, and docs together?
- [ ] If the answer is “no” to any item, choose `auto-chain` or get explicit `size:exception` approval.

### PR Size Budget

Keep PRs at or below **400 changed lines** (`additions + deletions`). This is a deliberate cognitive-load limit: a PR should be reviewable in roughly **60 minutes** without pushing reviewers into fatigue.

### Work-Unit Commits

Structure commits by deliverable unit, not by file type. A good commit includes the code, tests, and docs needed to understand and verify one behavior or workflow.

- Prefer `feat(auth): validate local tokens` over separate `models`, `services`, and `tests` commits.
- Keep rollback reasonable: reverting one commit should not remove unrelated work.

### Before Opening a PR

- [ ] There is a linked approved issue (`Closes #<N>`)
- [ ] The PR is at or below 400 changed lines, or a maintainer approved `size:exception`
- [ ] Commits are organized by deliverable work unit
- [ ] All local tests pass
- [ ] Commits follow Conventional Commits format
- [ ] Code is self-reviewed

### PR Title

Use the same Conventional Commits format as commit messages:

```
feat(ui): add kanban board visualization
fix(api): handle missing API keys gracefully
```

### Linking Your Issue

In the PR body, include one of:

```
Closes #42
Fixes #42
Resolves #42
```

---

## Code of Conduct

Be respectful. We're building something together.

- Critique code, not people
- Be constructive in reviews
- Welcome newcomers

Violations may result in removal from the project. See our [Code of Conduct](CODE_OF_CONDUCT.md).
