# 0001 — Use Clean Architecture

## Title
Use Clean Architecture

## Status
Accepted

## Context
SpintLogic is being built as a B2B SaaS that will evolve across multiple domains, integrations, and delivery teams. We need an architecture that protects business rules from framework churn, infrastructure concerns, and UI changes. The team also wants long-term maintainability, strong testability, and clear boundaries inside a monorepo.

## Decision
We will adopt Clean Architecture across the backend and respect equivalent separation principles across the monorepo. Core business rules will live in domain and application layers, while frameworks, persistence, transport, and third-party providers will remain in infrastructure/interface layers. Dependencies must point inward, and the domain must remain independent from FastAPI, ORMs, queues, and external SDKs.

## Consequences
Positive:
- Business rules remain isolated from framework decisions.
- Use cases become easier to test under strict TDD.
- Replacing infrastructure components becomes less risky.
- The codebase gains stronger modularity and onboarding clarity.

Trade-offs:
- More upfront structure and discipline are required.
- Mapping between domain, DTOs, and persistence models adds ceremony.
- Teams must actively enforce architectural boundaries during reviews.
