# Development Rules

## 1. Regla madre

**No se escribe código de producto sin pasar por planificación, diseño y criterio de aceptación.**

## 2. Flujo oficial de trabajo

1. Idea / problema
2. Propuesta
3. Diseño técnico
4. Tareas
5. Implementación
6. Verificación
7. Release note

## 3. Reglas de planificación

- toda feature debe tener objetivo de negocio;
- toda feature debe definir usuario, valor y métrica;
- todo cambio estructural debe dejar una ADR o decisión registrada;
- si algo no entra al MVP, se mueve explícitamente al backlog futuro.

## 4. Reglas de arquitectura

- modular monolith como patrón oficial;
- dependencias dirigidas hacia dominio y no al revés;
- no lógica de negocio crítica en componentes UI;
- el frontend orquesta experiencia; el backend gobierna reglas;
- evitar lógica duplicada entre web y API.

## 5. Reglas de código

- TypeScript estricto en frontend;
- Python tipado en backend;
- naming consistente y explícito;
- funciones pequeñas, cohesionadas y testeables;
- comentarios solo cuando expliquen intención, no obviedades;
- cero secretos hardcodeados;
- feature flags para cambios sensibles si el riesgo lo amerita.

### Reglas de Clean Code

- una función debe tener una sola razón para cambiar;
- preferir nombres que expresen intención;
- evitar funciones largas y clases “Dios”;
- eliminar duplicación sistemáticamente;
- preferir composición sobre complejidad accidental;
- errores explícitos antes que silencios mágicos;
- cada módulo debe tener responsabilidad clara;
- código legible > código “ingenioso”.

## 6. Reglas de datos

- PostgreSQL es la verdad del sistema;
- no borrar datos operativos sin política definida;
- todo cálculo KPI debe tener fórmula documentada;
- no confiar en tiempo enviado por el cliente sin validación;
- cambios de estado relevantes deben ser auditables.

## 6.1 Reglas de Clean Architecture

- el dominio no depende de frameworks;
- los casos de uso no conocen detalles de transporte HTTP;
- infraestructura implementa interfaces definidas por capas internas;
- DTOs de entrada/salida no son entidades de dominio;
- no mezclar ORM models con modelos de dominio si eso degrada claridad;
- toda dependencia externa debe entrar por adapter o gateway.

## 7. Reglas de API

- contrato OpenAPI antes de exponer endpoints críticos;
- payloads consistentes;
- validación exhaustiva en bordes;
- idempotencia en operaciones repetibles;
- versionado explícito cuando haya ruptura.

## 8. Reglas de UX de producto

- timer siempre visible pero no intrusivo;
- una acción crítica = una confirmación clara;
- estado del proyecto visible sin navegar demasiado;
- dashboards comprensibles para no técnicos;
- reportes diseñados para ser compartidos sin explicación extra.

## 9. Reglas de testing

### Backend
- unit tests para reglas de negocio;
- integration tests para API, DB y permisos;
- contract tests para payloads críticos.

### Frontend
- unit tests para utilidades y hooks;
- component tests para piezas críticas;
- e2e para flujos:
  - login;
  - crear proyecto;
  - mover tarea;
  - iniciar/terminar foco;
  - generar reporte.

## 10. Definition of Ready

Una tarea entra a desarrollo solo si tiene:

- objetivo claro;
- criterio de aceptación;
- diseño o referencia técnica;
- impacto en datos identificado;
- dependencia externa conocida;
- riesgo principal identificado.

## 11. Definition of Done

Una tarea se considera terminada solo si:

- cumple criterios de aceptación;
- tiene pruebas adecuadas;
- deja observabilidad mínima;
- actualiza documentación si aplica;
- no rompe seguridad ni multi-tenancy;
- pasa CI;
- está lista para demo o release interno.

## 12. Reglas de Git

- trunk-based con ramas cortas;
- nombres tipo `feat/...`, `fix/...`, `chore/...`, `docs/...`;
- PR pequeña, enfocada y revisable;
- no mezclar refactor grande con feature sin necesidad;
- commits descriptivos.

### Reglas de ramas

- `main` siempre protegida y deployable;
- una rama por cambio lógico;
- ramas cortas y de vida breve;
- convenciones sugeridas:
  - `feat/<alcance>`
  - `fix/<alcance>`
  - `refactor/<alcance>`
  - `docs/<alcance>`
  - `chore/<alcance>`

### Reglas de commits atómicos

- un commit = un cambio lógico;
- no mezclar formato, refactor y feature en el mismo commit;
- cada commit debe dejar el proyecto en estado coherente;
- si el cambio necesita explicación larga, probablemente no es atómico;
- usar mensajes claros estilo Conventional Commits:
  - `feat(board): add task status transitions`
  - `fix(timer): prevent duplicate active sessions`
  - `refactor(api): extract project repository port`

## 13. Reglas de review

- revisar lógica, seguridad, multi-tenant, tests y DX;
- no aprobar “solo porque funciona”;
- toda decisión no obvia debe quedar registrada.

## 14. Reglas de observabilidad

- todo error relevante debe poder trazarse;
- logs sin datos sensibles;
- alerts para fallos de jobs, reportes y auth;
- métricas técnicas y de negocio separadas.

## 15. Reglas de seguridad

- mínimo privilegio;
- validación server-side siempre;
- protección CSRF/XSS según superficie;
- control de acceso por organización y rol en cada operación;
- rotación y gestión seria de secretos.

## 16. Regla de roadmap

Cada fase debe cerrar con:

- demo funcional;
- métricas observables;
- deuda técnica explícita;
- decisión de continuar, corregir o pausar.
