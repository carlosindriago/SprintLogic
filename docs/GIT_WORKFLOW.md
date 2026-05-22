# Git Workflow

## 1. Objetivo

Definir un flujo Git profesional que favorezca trazabilidad, revisiones limpias, integración continua y bajo riesgo.

## 2. Estrategia base

Se adopta un flujo **trunk-based controlado**:

- `main` es la rama estable;
- el trabajo se hace en ramas cortas;
- toda integración pasa por Pull Request;
- los cambios se integran pequeños y frecuentes.

## 3. Tipos de ramas

- `feat/<scope>`
- `fix/<scope>`
- `refactor/<scope>`
- `docs/<scope>`
- `chore/<scope>`
- `test/<scope>`

Ejemplos:

- `feat/focus-timer`
- `fix/report-pdf-timezone`
- `refactor/task-domain-model`

## 4. Reglas de ramas

1. Nunca trabajar directo en `main`.
2. Una rama debe atacar un solo objetivo.
3. Si una rama crece demasiado, se divide.
4. Rebase frecuente contra `main` para evitar drift largo.
5. Las ramas deben vivir poco tiempo.

## 5. Commits atómicos

### Definición
Un commit atómico representa **una sola intención de cambio** y deja el repositorio en estado consistente.

### Reglas

- separar refactor de feature;
- separar renombres masivos de cambios funcionales;
- separar cambios de infraestructura de cambios de dominio, salvo necesidad clara;
- no mezclar backend y frontend en un commit si no forman un solo cambio lógico;
- cada commit debe poder revisarse, revertirse y entenderse por sí solo.

## 6. Formato de commits

Usar **Conventional Commits**:

```text
type(scope): short summary
```

Tipos principales:

- `feat`
- `fix`
- `refactor`
- `docs`
- `test`
- `chore`
- `build`
- `ci`

Ejemplos:

```text
feat(tasks): add task assignment endpoint
fix(focus): block concurrent active sessions
refactor(domain): extract project status value object
docs(architecture): define clean architecture boundaries
```

## 7. Pull Requests

Cada PR debe:

- resolver un problema claro;
- ser pequeña o medianamente pequeña;
- incluir contexto de negocio y técnico;
- indicar riesgos;
- listar pruebas realizadas;
- actualizar docs si cambia comportamiento o arquitectura.

## 8. Política de merge

- preferir **squash merge** cuando la rama tenga commits de trabajo intermedio;
- preferir **rebase merge** cuando la secuencia de commits atómicos aporte valor histórico;
- no usar merge commits ruidosos sin necesidad.

## 9. Regla práctica

Si un reviewer no puede entender un commit en pocos minutos, el commit no es suficientemente atómico.

## 10. Checklist antes de abrir PR

- [ ] rama bien nombrada
- [ ] commits atómicos
- [ ] tests relevantes pasan
- [ ] linter/formatter pasa
- [ ] docs actualizadas si aplica
- [ ] sin cambios accidentales
