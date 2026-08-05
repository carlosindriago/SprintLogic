# Operación Limpieza Profunda - Master To-Do List

## Fase 1: Escudos Críticos (Seguridad de Frontera)
- [x] 1.1 Fix Tauri: CSP nulo, identificador por defecto y flash de ventana (tauri.conf.json).
- [x] 1.2 Fix CORS: Eliminar el wildcard * con credenciales y aplicar Whitelist (main.py).
- [x] 1.3 Fix SQL Injection: Sanitizar IN clauses con bindparam (delta_sync.py).
- [x] 1.4 Extirpación de Infraestructura Muerta: Eliminar docker-compose.yml (app Sidecar 100% local, sin contenedores en la distribución).
- [x] 1.5 Fix Path Traversal: Proteger lectura de rutas en doc_studio.py y git.py.

## Fase 2: Higiene del Repositorio (Infraestructura y Git)
- [x] 2.1 Limpieza de Git: git rm --cached de artefactos de build y .db gigantes; actualizar .gitignore.
- [x] 2.2 Reubicación: Mover scripts sueltos, documentos de diseño y tests huérfanos a sus carpetas correctas.
- [x] 2.3 CI/CD Pipeline: Integrar los linters en el workflow de GitHub Actions.

## Fase 3: Estabilidad del Motor (Backend)
- [x] 3.1 Desbloqueo del Event Loop: Refactorizar I/O bloqueante en projects.py usando asyncio.to_thread().
- [x] 3.2 Rate Limiting: Proteger el endpoint de IA contra abusos.

## Fase 4: Deuda Técnica y Lógica
- [x] 4.1 Purgar los 169 except Exception genéricos en el backend.
- [x] 4.2 Eliminar los `any` en TypeScript y console.log.
