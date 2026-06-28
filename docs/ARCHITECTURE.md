# Architecture

## 1. Decisión arquitectónica principal

Se recomienda una **arquitectura modular monolith** con:

- **frontend web** en Next.js;
- **API de dominio** en FastAPI;
- **PostgreSQL** como fuente única de verdad;
- **Redis + workers** para jobs y procesos asíncronos;
- integración con **Supabase Auth** para autenticación y control base de acceso.

Esto permite velocidad de entrega hoy, sin cerrar el camino a separar servicios mañana.

## 2. Stack recomendado

| Capa | Tecnología | Motivo |
|---|---|---|
| Frontend | Next.js + TypeScript | UX moderna, App Router, SSR/streaming, buen DX |
| UI | Tailwind CSS + shadcn/ui | rapidez, consistencia y diseño enterprise moderno |
| Estado cliente | TanStack Query + Zustand | server state claro + estado efímero de timer/board |
| Backend | FastAPI + Pydantic + SQLAlchemy 2 | API rápida, tipada y lista para analítica en Python |
| DB | PostgreSQL | consistencia, analítica SQL fuerte y extensibilidad |
| Auth | Supabase Auth | login, JWT, RLS y base sólida multi-tenant |
| Realtime | Supabase Realtime al inicio | menor costo de implementación para board/presence |
| Queue / cache | Redis | colas, locks, cache, rate limiting, idempotencia |
| Workers | Celery | PDFs, emails, snapshots y jobs programados |
| Reportes | HTML + PDF renderer | un solo template para web/PDF |
| IA | LangChain / LiteLLM o SDK directo | agnosticisimo de LLMs, parseo estructurado |
| Integración Git | PyGithub / GitLab API | acceso a repos, branches y commits desde backend |
| Email | Resend | simple para reportes transaccionales |
| Observabilidad | Sentry + OpenTelemetry + logs estructurados | errores, trazas y diagnóstico |
| Analítica de uso | PostHog | adopción, funnels y product analytics |
| CI/CD | GitHub Actions | checks, tests, build y deploy |
| Infra | Docker + servicios gestionados | simple de operar en etapa inicial |

## 3. Alternativas consideradas

### Opción A — Next.js fullstack
- **Pros**: menor complejidad inicial.
- **Contras**: peor separación para motor analítico y reporting pesado.

### Opción B — Next.js + FastAPI + PostgreSQL
- **Pros**: mejor separación, Python para analítica, escalado más limpio.
- **Contras**: dos runtimes y más disciplina de integración.

### Recomendación
Elegir **Opción B**.

## 3.1 Estilo arquitectónico interno

La implementación debe seguir **Clean Architecture**:

- **Domain**: entidades, value objects, reglas de negocio puras.
- **Application**: casos de uso, orquestación y puertos.
- **Infrastructure**: DB, auth, email, colas, proveedores externos.
- **Interface**: API HTTP, realtime gateways y UI adapters.

### Regla clave
Las dependencias siempre apuntan **hacia adentro**:

```text
Interface → Application → Domain
Infrastructure → Application / Domain contracts
```

### Implicaciones prácticas

- el dominio no conoce frameworks;
- FastAPI, Next.js, Supabase, Redis o Postgres no deben contaminar reglas centrales;
- repositorios, gateways y servicios externos se acceden mediante interfaces/puertos;
- los casos de uso deben ser testeables sin infraestructura real.

## 4. Principios de arquitectura

1. **Single source of truth**: PostgreSQL manda.
2. **Eventos internos primero**: no microservicios, pero sí eventos de dominio.
3. **Contracts first**: API y esquemas antes que implementación.
4. **Tenant isolation by design**.
5. **Write once, consume many**: el mismo dato debe servir a board, dashboard y reportes.
6. **Snapshots para analítica histórica**.

## 5. Módulos del backend

### 5.1 Identity & Organization
- usuarios;
- organizaciones;
- membresías;
- roles;
- permisos.

### 5.2 Project Management
- proyectos;
- sprint cycles;
- estados del board;
- políticas de WIP.

### 5.3 Task Management
- tareas;
- asignaciones;
- dependencias;
- bloqueos;
- etiquetas;
- comentarios futuros.

### 5.4 Focus & Time Tracking
- sesiones de foco;
- pausas;
- interrupciones;
- tiempo efectivo;
- sesiones activas.

### 5.5 AI & Git Automation Engine
- prompts de generación de tareas;
- generador de nombres de ramas (branching rules);
- autogeneración de commit messages semánticos;
- sincronización de repositorios, ramas y PRs (Git Gateway);
- extracción de diffs.

### 5.6 Analytics Engine
- agregaciones por tarea, persona, sprint y proyecto;
- proyecciones;
- snapshots diarios;
- cálculo de KPIs.

### 5.7 Reporting
- plantillas;
- generación PDF;
- scheduling;
- envío por email;
- historial de reportes.

### 5.8 Notification Layer
- eventos críticos;
- recordatorios;
- alertas de riesgo;
- canales internos / email.

## 6. Arquitectura lógica

```text
Next.js Web App
   │
   ├── Queries / Commands
   ▼
FastAPI Application
   ├── Identity & Org
   ├── Projects / Tasks
   ├── AI & Git Automation Engine
   ├── Focus Sessions
   ├── Analytics
   ├── Reports
   ▼
PostgreSQL  ←→  Supabase Auth / Realtime
   │
   ├── Redis
   └── Celery Workers
```

## 7. Modelo de datos inicial

### Tablas core

- `users`
- `organizations`
- `organization_members`
- `projects`
- `project_members`
- `project_status_columns`
- `sprints`
- `tasks`
- `task_dependencies`
- `task_assignments`
- `git_repositories`
- `git_branches`
- `git_commits`
- `focus_sessions`
- `focus_interruptions`
- `time_entries` *(derivada o materializada según diseño final)*
- `daily_project_snapshots`
- `report_configs`
- `generated_reports`
- `audit_events`

## 8. Convenciones de modelado

- todas las tablas operativas incluyen `organization_id`;
- `created_at`, `updated_at` y, donde aplique, `deleted_at`;
- IDs con UUID;
- soft delete solo donde tenga sentido de negocio;
- auditoría obligatoria en cambios críticos de estado y permisos;
- timestamps siempre en UTC;
- campos monetarios en enteros de menor unidad o numeric controlado.

## 9. API design

- versión inicial: `/api/v1`;
- OpenAPI como contrato;
- comandos y queries separados cuando agregue claridad;
- errores con payload uniforme;
- idempotency keys para endpoints sensibles:
  - start/stop session;
  - generate report;
  - invite member.

## 10. Realtime strategy

### MVP
- cambios de board;
- presencia opcional por proyecto;
- sincronización de timer visible.

### Regla
El timer oficial se persiste en backend; el cliente nunca es fuente final de verdad.

## 11. Jobs asíncronos

Usar workers para:

- generar reportes PDF;
- enviar emails;
- crear snapshots diarios;
- recalcular métricas pesadas;
- detectar riesgos programados.

## 12. Seguridad

- JWT emitido por proveedor de auth;
- validación de tenant en cada request;
- RLS o políticas equivalentes para acceso por organización;
- secrets fuera del repo;
- rate limiting en endpoints sensibles;
- trazabilidad de invites y roles;
- mínimo privilegio en backoffice y jobs.

## 13. Observabilidad

- logs JSON con request id;
- tracing entre frontend, API y jobs;
- métricas de salud, latencia y error rate;
- dashboard de negocio separado de dashboard técnico.

## 14. Estructura sugerida del monorepo

```text
apps/
  web/
  api/
packages/
  ui/
  config/
  types/
  sdk/
infra/
  compose/
  docker/
  scripts/
docs/
```

## 14.1 Estructura sugerida por capas

```text
apps/api/src/
  domain/
  application/
  infrastructure/
  interfaces/

apps/web/src/
  app/
  features/
  components/
  lib/
```

### Regla de frontend
En frontend también se respetan límites:

- `features/` encapsula casos de uso de UI;
- `components/` contiene piezas reutilizables;
- `lib/` solo contiene utilidades transversales;
- evitar mezclar acceso a datos, lógica de negocio y presentación en el mismo archivo.

## 15. Decisiones para no sobrediseñar

- no microservicios en fase 1;
- no event bus externo en MVP;
- no CQRS distribuido;
- no forecasting con ML antes de validar KPIs simples;
- no integraciones enterprise hasta validar adopción base.
