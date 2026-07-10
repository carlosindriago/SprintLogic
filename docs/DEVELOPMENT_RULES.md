# Development Rules

## 1. Golden Rule

**No product code is written without passing through planning, design, and acceptance criteria.**

## 2. Official Workflow

1. Idea / problem
2. Proposal
3. Technical design
4. Tasks
5. Implementation
6. Verification
7. Release note

## 3. Planning Rules

- every feature must have a business objective;
- every feature must define user, value, and metric;
- every structural change must leave an ADR or registered decision;
- if something doesn't fit the MVP, it is explicitly moved to the future backlog.

## 4. Architecture Rules

- modular monolith as the official pattern;
- dependencies directed towards the domain and not vice versa;
- no critical business logic in UI components;
- frontend orchestrates experience; backend governs rules;
- avoid duplicate logic between web and API.

## 5. Coding Rules

- strict TypeScript in frontend;
- strictly typed Python in backend;
- consistent and explicit naming;
- small, cohesive, and testable functions;
- comments only when they explain intention, not obvious things;
- zero hardcoded secrets;
- feature flags for sensitive changes if the risk warrants it.

### Clean Code Rules

- a function should have only one reason to change;
- prefer names that express intention;
- avoid long functions and "God" classes;
- eliminate duplication systematically;
- prefer composition over accidental complexity;
- explicit errors rather than magical silences;
- each module must have a clear responsibility;
- readable code > "clever" code.

## 6. Data Rules

- local SQLite is the system's source of truth;
- do not delete operational data without a defined policy;
- every KPI calculation must have a documented formula;
- do not trust time sent by the client without validation;
- relevant state changes must be auditable.

## 6.1 Clean Architecture Rules

- the domain does not depend on frameworks;
- use cases do not know HTTP transport details;
- infrastructure implements interfaces defined by internal layers;
- input/output DTOs are not domain entities;
- do not mix ORM models with domain models if it degrades clarity;
- every external dependency must enter through an adapter or gateway.

## 7. API Rules

- OpenAPI contract before exposing critical endpoints;
- consistent payloads;
- exhaustive validation at the edges;
- idempotency in repeatable operations;
- explicit versioning when breaking changes occur.

## 8. Product UX Rules

- timer always visible but not intrusive;
- one critical action = one clear confirmation;
- project state visible without too much navigation;
- dashboards understandable for non-technical users;
- reports designed to be shared without extra explanation.

## 9. Testing Rules

### Backend
- unit tests for business rules;
- integration tests for API, DB, and permissions;
- contract tests for critical payloads.

### Frontend
- unit tests for utilities and hooks;
- component tests for critical pieces;
- e2e for flows:
  - login;
  - create project;
  - move task;
  - start/end focus;
  - generate report.

## 10. Definition of Ready

A task enters development only if it has:

- clear objective;
- acceptance criteria;
- design or technical reference;
- data impact identified;
- external dependency known;
- main risk identified.

## 11. Definition of Done

A task is considered finished only if:

- meets acceptance criteria;
- has adequate tests;
- leaves minimum observability;
- updates documentation if applicable;
- does not break security or multi-tenancy;
- passes CI;
- is ready for demo or internal release.

## 12. Git Rules

- trunk-based with short-lived branches;
- names like `feat/...`, `fix/...`, `chore/...`, `docs/...`;
- PR small, focused, and reviewable;
- do not mix a large refactor with a feature unnecessarily;
- descriptive commits.

### Branch Rules

- `main` always protected and deployable;
- one branch per logical change;
- short-lived branches;
- suggested conventions:
  - `feat/<scope>`
  - `fix/<scope>`
  - `refactor/<scope>`
  - `docs/<scope>`
  - `chore/<scope>`

### Atomic Commit Rules

- one commit = one logical change;
- do not mix formatting, refactor, and feature in the same commit;
- each commit must leave the project in a coherent state;
- if the change needs a long explanation, it's probably not atomic;
- use clear messages following Conventional Commits:
  - `feat(board): add task status transitions`
  - `fix(timer): prevent duplicate active sessions`
  - `refactor(api): extract project repository port`

## 13. Review Rules

- review logic, security, tests, and DX;
- do not approve "just because it works";
- every non-obvious decision must be recorded.

## 14. Observability Rules

- every relevant error must be traceable;
- logs without sensitive data;
- alerts for job failures, reports, and auth;
- technical and business metrics separated.

## 15. Security Rules

- least privilege;
- server-side validation always;
- CSRF/XSS protection according to surface;
- serious secret rotation and management.

## 16. Roadmap Rule

Each phase must close with:

- functional demo;
- observable metrics;
- explicit technical debt;
- decision to continue, correct, or pause.
