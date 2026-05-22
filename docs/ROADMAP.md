# Roadmap

## Fase 0 — Descubrimiento y diseño

### Objetivo
Cerrar la base estratégica y técnica antes del desarrollo.

### Entregables
- blueprint del producto;
- arquitectura objetivo;
- reglas de desarrollo;
- backlog MVP priorizado;
- diccionario inicial de métricas;
- diseño del modelo multi-tenant.

### Gate de salida
- stack aprobado;
- alcance MVP congelado;
- primeros épicos estimados.

---

## Fase 1 — Foundation Platform

### Objetivo
Dejar operativa la base del producto.

### Entregables
- monorepo;
- CI/CD;
- auth;
- organizaciones y roles;
- proyectos;
- base de diseño UI;
- observabilidad inicial.

### Resultado esperado
Un usuario puede entrar, crear organización y crear un proyecto.

---

## Fase 2 — Work Management Core

### Objetivo
Llevar el tablero Kanban al primer nivel usable.

### Entregables
- columnas del board;
- creación/edición de tareas;
- drag & drop;
- asignaciones;
- prioridades;
- tipos de tarea;
- bloqueos y dependencias básicas.

### Resultado esperado
El equipo puede planificar y operar trabajo diario en la plataforma.

---

## Fase 3 — Focus & Time Intelligence

### Objetivo
Capturar el trabajo real con la menor fricción posible.

### Entregables
- Focus Timer por tarea;
- sesiones start/pause/stop;
- interrupciones con motivo;
- resumen por usuario y proyecto;
- reconciliación estimado vs real.

### Resultado esperado
La plataforma ya produce datos operativos confiables.

---

## Fase 4 — Analytics & Executive Dashboard

### Objetivo
Transformar datos operativos en visibilidad ejecutiva.

### Entregables
- KPIs operativos;
- dashboard por proyecto;
- snapshots diarios;
- alertas de sobrecarga y desvío;
- predicción simple de finalización.

### Resultado esperado
PM y dirección pueden tomar decisiones sin Excel manual.

---

## Fase 5 — Automated Reporting

### Objetivo
Cerrar el loop de comunicación ejecutiva.

### Entregables
- reporte semanal web;
- PDF ejecutivo;
- scheduler;
- envío por email;
- historial de reportes.

### Resultado esperado
El PM deja de construir reportes manuales.

---

## Fase 6 — Hardening pre-Go-To-Market

### Objetivo
Preparar el producto para pilotos serios.

### Entregables
- hardening de seguridad;
- performance review;
- mejora de onboarding;
- pricing assumptions;
- analytics de uso;
- playbook de soporte.

### Resultado esperado
Producto listo para pilotos y primeros clientes.

---

## Secuencia recomendada de implementación

1. Tenancy y auth
2. Proyectos y board
3. Tareas y estados
4. Timer y sesiones
5. Métricas base
6. Dashboard
7. Reportes
8. Hardening

## Backlog post-MVP

- sprints avanzados y capacity planning;
- forecasting estadístico avanzado;
- benchmark por tipo de tarea;
- integraciones GitHub/Jira/Slack;
- billing;
- SSO;
- portfolio ejecutivo multi-proyecto;
- recomendaciones automáticas de mejora continua.

## Hitos sugeridos

### Hito A
Primera demo interna operativa.

### Hito B
Primer proyecto real usando board + timer.

### Hito C
Primer reporte automático útil para management.

### Hito D
Primer piloto externo controlado.
