# SprintLogic — Analisis de Arquitectura Grafica

> Documento tecnico de referencia. Estado verificado contra el codigo fuente
> (`GraphScene.tsx` 1487 lineas, `scan_repo.py`, `ast_parser.py`, `graph_collapse.py`).

---

## 1. Estado Actual: Como funciona el motor grafico

### 1.1 Pipeline de Datos (Backend → Frontend)

```
  Filesystem          AST Parser           Graph Collapse          API            Frontend
  ─────────          ───────────           ──────────────          ────           ────────
  .py/.ts/.tsx  →  extract_nodes_from_   collapse_graph_by_    GET /graph    →  GraphScene.tsx
  .go/.java/.md     code() (Pasada 1)    density()             (SSE stream      (Canvas 2D +
                   ↓                     ↓                      para scan)       D3-force)
  tree-sitter      resolve_import_       Module super-nodos     JSON {           paintNode +
  parsea AST       edges() (Pasada 2)    cuando densidad        nodes,           paintBackground
                   ↓                     > 15 archivos          links,
  birth_time       crea edges            ↓                      birth_time}     Filtros +
  desde Git        IMPORTS +             expanded_folders                       animacion
                   CONTAINS              como query param                        cronologica
```

### 1.2 Componentes Principales

| Componente | Archivo | Responsabilidad |
|-----------|---------|----------------|
| AST Parser | `apps/api/app/infrastructure/parser/ast_parser.py` | Extraccion de nodos y edges desde codigo fuente via tree-sitter |
| Scan UseCase | `apps/api/app/application/scan_repo.py` | Orquesta el escaneo: recorre archivos, acumula imports, resuelve edges, emite SSE |
| Graph Collapse | `apps/api/app/application/graph_collapse.py` | Comprime directorios densos en super-nodos "Module" |
| Graph Metrics | `apps/api/app/application/graph_metrics.py` | Metricas topologicas (NetworkX) para analisis IA |
| Graph Repository | `apps/api/app/infrastructure/repositories/graph_repository.py` | Persistencia SQLAlchemy de nodos y edges |
| GraphScene | `apps/web/src/components/GraphScene.tsx` | Renderizado Canvas 2D + fisicas D3 + interaccion |
| ScanProgressBar | `apps/web/src/components/ScanProgressBar.tsx` | Barra de progreso SSE con AbortController |
| Graph Theme | `apps/web/src/lib/graph-theme.ts` | Colores por extension, glow effects, tema visual |
| Background Jobs Store | `apps/web/src/store/backgroundJobsStore.ts` | Estado Zustand de scans activos |

### 1.3 Backend: Extraccion y Resolucion

#### Pasada 1 — `extract_nodes_from_code()`
- Usa **tree-sitter** para parsear el AST de cada archivo.
- Extrae nodos: `File`, `Class`, `Function`, `Interface`.
- Extrae edges intra-archivo: `CONTAINS` (file → class/function).
- Extrae imports crudos como `set[str]` (ej: `"@/components/button"`, `"../../utils/helpers"`).
- Obtiene `birth_time` desde Git (`git log --diff-filter=A --format=%at`) o fallback a `os.path.getmtime`.

#### Pasada 2 — `resolve_import_edges()`
- Recibe `file_imports: dict[file_id, set[str]]` acumulado en la Pasada 1.
- Resuelve cada import contra `file_paths` (lista completa de archivos del proyecto).
- **Python**: resolucion correcta via `resolve_python_import()` — filtra stdlib, resuelve modulos y paquetes (`__init__.py`).
- **TS/JS/Go/Java**: resolucion por **stem matching** — toma el nombre del archivo del import y busca cualquier archivo con ese stem. NO lee `tsconfig.json`.

> **Limitacion conocida y documentada** (`ast_parser.py:175-180`): la resolucion de
> TS/JS no soporta path aliases (`@/components/...`), imports relativos correctos
> (`../../utils/helpers` sin considerar directorio fuente), ni workspace boundaries
> (`@myorg/shared` → `packages/shared/src/index.ts`).

#### Graph Collapse — `collapse_graph_by_density()`
- Agrupa archivos por directorio.
- Si un directorio tiene mas de `max_density=15` archivos, crea un super-nodo `Module`.
- El super-nodo reemplaza a los hijos en el grafo enviado al frontend.
- `expanded_folders` (pasado como query param al endpoint `/graph`) controla que directorios estan expandidos.
- Al expandir, los hijos se revelan manteniendo sus links externos.

#### Endpoint `/graph`
- `GET /projects/{project_id}/graph?expanded=apps/web/src/components`
- Devuelve JSON con `nodes` (incluyendo Module super-nodos) y `links`.
- Cada nodo File incluye `birth_time`, `in_degree`, `out_degree`, `folder`, `loc`.
- Deteccion de ciclos via NetworkX SCC.

#### Endpoint `/graph/analyze` (IA)
- `POST /projects/{project_id}/graph/analyze` — streaming SSE.
- Construye NetworkX DiGraph desde nodos y edges almacenados.
- Computa metricas topologicas via `_compute_graph_metrics_cpu_bound()`.
- Streamvia `LiteLLMGateway.analyze_anomalies_stream()` — el LLM recibe metricas del grafo.
- Retorna chunks `message_chunk`, `done`, `error`.

### 1.4 Frontend: Renderizado y Fisicas

#### Motor de Fisicas (D3-force)

| Fuerza | Configuracion | Proposito |
|--------|--------------|-----------|
| `charge` | `strength(-350)` | Repulsion global entre nodos |
| `link` | `distance(40)` | Distancia optima entre nodos conectados |
| `collide` | `forceCollide().radius(Module=22, File=10).iterations(2)` | Previene superposicion |
| `cluster` (custom) | `forceCluster()` — 0.08 * alpha | Atraccion magnetica hacia centroide del modulo |
| `radial` | `forceRadial(0,0,0).strength(0.05 if degree==0)` | Contiene nodos huerfanos orbitando el centro |
| `x`, `y` | `null` (removidas) | Elimina fuerzas estaticas que aplanan el grafo |

- `d3AlphaDecay` dinamico: `0.06` si >1000 nodos, `0.0228` si no.
- `cooldownTicks=100`.
- `d3ReheatSimulation()` al cambiar datos o expandir/colapsar carpetas.

#### Descongelamiento Fisico (fx/fy)
- Al colapsar una carpeta: `nItem.fx = undefined; nItem.fy = undefined;` para todos los nodos + `d3ReheatSimulation()`.
- Al arrastrar un nodo: `onNodeDragEnd` fija `n.fx = n.x; n.fy = n.y` (pin manual).
- Comentario explicito en linea 477: "We do NOT set fx/fy here because that permanently freezes the graph."

#### Renderizado Canvas 2D

**`paintNode()`** — Renderizado por nodo:
- Iconos de lenguaje via Devicons CDN (Python, TypeScript, React, Go, Java, etc.).
- `extColorHash(ext)` — color determinista por extension de archivo.
- `bloomGlow(color, alpha)` — efecto de resplandor.
- Super-nodos Module: radio mayor, texto del nombre dentro, `children_count`.
- Halo de out-degree respirando (senoidal) — solo si zoom > 1.2 y no faded.
- Ripple de in-degree expandiendose — solo para Function/Interface/nodos pequenos.
- **Supernova**: nodos nacidos en el ultimo 5% del timeline brillan con `shadowBlur` pulsante.
- Ring rojo para nodos con out-degree >= 10 (alta dependencia saliente).
- Tooltip on hover: LOC, in/out degree.
- Labels: visibles si zoom > 2, o si el nodo esta en focus/hover.

**`paintBackground()`** — Renderizado de fondo:
- Calcula centroides por modulo (primeros 2 segmentos del folder).
- Dibuja halos orbitales circulares con color del modulo.
- Etiqueta del modulo en texto sobre el halo.
- Respeta `cutoffTimeRef` para la animacion cronologica.

#### Interaccion

| Accion | Comportamiento |
|--------|---------------|
| Click en Module | Expande carpeta + `zoomToFit` + `d3ReheatSimulation` |
| Click en File | Abre archivo en editor via `onNodeClick` prop |
| Right-click | Menu contextual: Aislar Nodo / Abrir Archivo |
| Drag | Pin del nodo (fx/fy) en la posicion soltada |
| Hover | Tooltip + fade de no-vecinos |
| Background click | Limpia focus |
| Collapse folder (X en breadcrumb) | Unfreeza todos los nodos + reheat |

#### Animacion Cronologica

- `timeRange` computado desde `birth_time` de nodos (`{min, max}`).
- `animProgress` (0-1) controlado por Play/Pause + slider manual.
- `cutoffTimeRef` — ref sincronizado desde `timeRange + animProgress` via `useEffect`.
- `nodeVisibility` prop — oculta nodos con `birth_time > cutoff`.
- `getLinkVisibility` — oculta links cuyo source/target nacio despues del cutoff.
- Supernova effect: nodos en el ultimo 5% del timeline brillan.
- Duracion: 15 segundos via `requestAnimationFrame`.

#### Integracion de Rescan

- Boton "Sincronizar" en panel "Metricas del Codigo".
- `handleRescan()` → `POST /rescan` + `startScan(projectId)` en Zustand store.
- **Dual-guard anti-bucle**: `useRef(false)` + `clearScan(projectId)` en `.finally()`.
- **Watchdog timeout** (60s): si el SSE no responde, fuerza `clearScan` + toast.
- **Cerrojo visual**: `opacity-40 pointer-events-none` en canvas durante scanning.
- **Manejo de 404**: `ApiError` con status 404 → grafo vacio silenciosamente (scan corriendo).

#### Analisis IA

- Boton "Analisis IA del Grafo" → `POST /graph/analyze` (streaming SSE).
- Texto streaming mostrado en panel con `max-h-32 overflow-y-auto`.
- Guardado en `localStorage` con firma del grafo (`nodes_links_loc`).
- Deteccion de cambios: `hasChanges` se activa si la firma cambia.
- Botones "Mostrar Analisis" / "Volver a Analizar" segun estado.
- Abre tab "Historial IA" al completar.

---

## 2. Cambios Recientes (Historico de Refactors)

### Refactor "Deep Space" (Fisicas + Colapso Jerarquico)
- Implementacion de `forceRadial` para contener nodos huerfanos (fix "Nube de Oort").
- Implementacion de `forceCluster` custom para agrupacion magnetica por modulo.
- Implementacion de `forceCollide` para prevenir superposicion de super-nodos.
- Remocion de `forceX` y `forceY` estaticas que aplanaban el grafo.
- Descongelamiento de `fx/fy` al colapsar carpetas.
- `graph_collapse.py` — super-nodos Module con expand/collapse bajo demanda.
- Breadcrumbs de carpetas expandidas con boton de colapsar.
- `paintBackground` — halos orbitales por modulo.
- `d3AlphaDecay` dinamico segun cantidad de nodos.

### Refactor "Cronos" (Animacion + Rescan)
- Boton "Sincronizar" en panel de metricas con integracion Zustand.
- Dual-guard anti-bucle para suscripcion a store (useRef + clearScan).
- Watchdog timeout de 60s para SSE zombie.
- Cerrojo visual durante scanning.
- Efecto Supernova para nodos recien nacidos en timeline.
- `nodeVisibility` + `cutoffTimeRef` para visibilidad basada en tiempo.
- Link width dinamico responsivo al zoom (`Math.max(1, 1.5/globalScaleRef)`).
- Link color simplificado a gris visible (`rgba(156,163,175,0.4)`).
- Manejo de 404 en fetch inicial.

### Refactor SSE (ScanProgressBar)
- Reemplazo de `throw new Error('__stream_closed__')` por `AbortController`.
- `ctrl.abort()` en `onclose`, `onerror`, y `onmessage.completed`.
- Catch simplificado: solo `AbortError` es silencioso.

---

## 3. Limitaciones Actuales

| Area | Limitacion | Impacto |
|------|-----------|---------|
| Resolucion TS/JS | No lee `tsconfig.json`, no resuelve `@/` aliases | Imports entre archivos TS no se conectan correctamente en monorepos |
| Resolucion relativa | Stem matching global, ignora directorio fuente | Match no determinista si hay archivos con mismo nombre |
| Workspace boundaries | No resuelve `@myorg/package` → `packages/` | Imports entre paquetes del monorepo se pierden |
| Renderizado | Canvas 2D en main thread | <60fps con >5000 nodos; UI se congela durante simulacion |
| Fisicas | D3-force en main thread | Botones no responsivos mientras nodos convergen |
| Sin semantic zoom | Labels binarios (visible/oculto) | Carga cognitiva alta en zoom lejano |
| Sin edge bundling | Links como curvas individuales | "Efecto espagueti" en grafos densos |
| Sin minimapa | Navegacion solo por zoom/pan | Desorientacion en grafos grandes |
| IA manual | Usuario debe clickar "Analisis IA" | No hay auto-tagging ni analisis en background |
| Sin Git churn | `birth_time` existe pero no modification frequency | No hay heatmap de deuda tecnica |
| Sin blast radius | No hay UI de "que depende de este nodo" | Analisis de impacto manual |

---

## 4. Hoja de Ruta: Mejoras por Valor

### Prioridad 1: Correccion de Datos (Impacto inmediato)

#### 4.1.1 Resolver Path Aliases de TypeScript
**Problema**: `@/components/ui/button` no se resuelve. Los imports entre archivos TS/TSX del monorepo no generan edges IMPORTS.
**Solucion**: Leer `tsconfig.json` del proyecto, parsear `compilerOptions.paths` y `compilerOptions.baseUrl`, y traducir aliases a rutas reales antes del stem matching.
**Archivos**: `ast_parser.py:resolve_import_edges()`
**Valor**: Sin esto, el grafo muestra "star graphs" aislados. Es la correccion mas critica.

#### 4.1.2 Resolver Imports Relativos Correctamente
**Problema**: `../../utils/helpers` se resuelve por stem global, no relativo al directorio fuente.
**Solucion**: `Path(source_file_dir).joinpath(import_path).resolve()` + buscar en `file_paths`.
**Archivos**: `ast_parser.py:resolve_import_edges()`

#### 4.1.3 Resolver Workspace Boundaries
**Problema**: `@sprintlogic/database` no se resuelve a `packages/database/src/index.ts`.
**Solucion**: Leer `package.json` de cada paquete en `packages/`, mapear `name` → `src/index.ts`, y resolver imports por nombre de paquete.
**Archivos**: `ast_parser.py:resolve_import_edges()`

### Prioridad 2: Rendimiento (Escalabilidad)

#### 4.2.1 Web Worker para Fisicas D3
**Problema**: D3-force bloquea el main thread. Con >1000 nodos, la UI no responde.
**Solucion**: Mover la simulacion de fuerzas a un Web Worker. `react-force-graph-2d` soporta `d3VelocityDecay` y acceso a `d3Force` desde fuera, pero la simulacion corre en main thread.
**Alternativa**: Usar `d3-force-worker` o implementar un worker custom que reciba nodos/links, ejecute `forceSimulation`, y postee posiciones de vuelta.
**Valor**: UI fluida (botones responsivos) durante la convergencia del grafo.

#### 4.2.2 Migracion a WebGL (react-force-graph-3d o 2D WebGL)
**Problema**: Canvas 2D redibuja todos los nodos en cada frame en el main thread.
**Solucion**: `react-force-graph-3d` usa Three.js (WebGL). Alternativamente, `sigma.js` o `cytoscape.js` con renderizado WebGL.
**Consideracion**: El `paintNode` custom (iconos, halos, supernova) requiere adaptacion a WebGL sprites/shaders.
**Valor**: 60fps estables con 10,000+ nodos.

#### 4.2.3 Level-of-Detail Adaptativo
**Problema**: Todos los nodos se renderizan con el mismo detalle sin importar el zoom.
**Solucion**: En `paintNode`, escalar el detalle segun `globalScale`:
- `globalScale < 0.5`: solo puntos de color, sin iconos ni halos.
- `0.5 < globalScale < 1.5`: circulos coloreados, sin texto.
- `globalScale > 1.5`: iconos + halos + labels.
**Valor**: Reducir trabajo de canvas en zoom lejano.

### Prioridad 3: UX y Valor para el Desarrollador

#### 4.3.1 Semantic Zoom
**Problema**: Al alejar, se ven cientos de etiquetas ilegibles. Al acercar, falta contexto.
**Solucion**: Mostrar nombres de modulo cuando `globalScale < 1`, nombres de archivo cuando `globalScale > 2`, y funciones/clases cuando `globalScale > 4`.
**Valor**: Carga cognitiva reducida en cada nivel de zoom.

#### 4.3.2 Minimapa
**Problema**: En grafos grandes, el usuario se pierde al hacer pan/zoom.
**Solucion**: Canvas secundario en esquina inferior que renderiza una version simplificada del grafo con un rectangulo indicando el viewport actual.
**Valor**: Navegacion intuitiva en grafos de 1000+ nodos.

#### 4.3.3 Blast Radius (Analisis de Impacto)
**Problema**: No hay forma de preguntar "que se rompe si cambio este archivo".
**Solucion**: Al seleccionar un nodo, calcular el conjunto de nodos que dependen transitivamente de el (reverse BFS sobre edges IMPORTS). Resaltar esos nodos en rojo y atenuar el resto.
**Implementacion**: NetworkX `nx.ancestors(G, node)` en backend, o BFS en frontend sobre `graphData.links`.
**Valor**: Respuesta instantanea a "que afecta este cambio".

#### 4.3.4 Heatmap de Git Churn
**Problema**: No hay indicacion visual de que archivos cambian mas frecuentemente.
**Solucion**: En el backend, durante el scan, ejecutar `git log --oneline -- <file>` para contar commits por archivo. Mapear el count a una escala de color (verde → amarillo → rojo).
**Valor**: Identificar hotspots de deuda tecnica visualmente.

### Prioridad 4: IA como Arquitecto Copiloto

#### 4.4.1 Auto-Tagging de Super-Nodos
**Problema**: Los super-nodos Module muestran solo el nombre del directorio. No dicen que hacen.
**Solucion**: Despues del scan, enviar el contenido aggregate de cada Module al LLM (nombres de archivos, clases, funciones) y pedir etiquetas semanticas: "Capa de Auth", "Servicios de Pago", "Vistas Tontas".
**Almacenamiento**: Guardar tags en `meta_data` del nodo Module.
**UI**: Mostrar tags debajo del nombre del Module en `paintNode`.
**Valor**: El desarrollador entiende la responsabilidad de cada modulo sin abrir archivos.

#### 4.4.2 Deteccion de Violaciones Arquitectonicas
**Problema**: No hay alertas cuando un componente importa algo que no debe.
**Solucion**: El LLM recibe la topologia del grafo (metricas + edges entre modulos) y detecta patrones sospechosos: "UI importando modelo de DB", "Controller importando otro controller", "Vista importando logica de negocio".
**UI**: Resaltar edges violadores en rojo pulsante en el grafo.
**Valor**: Deteccion automatica de deuda arquitectonica.

#### 4.4.3 Resumen de Nodo bajo Demanda
**Problema**: Entender un archivo requiere abrirlo.
**Solucion**: Right-click → "Explicar con IA". El backend envia el AST del archivo + sus dependencias al LLM. Retorna un resumen de 3 lineas sobre la responsabilidad del archivo.
**UI**: Popover adyacente al nodo con el resumen.
**Valor**: Onboarding rapido a codebases desconocidos sin leer codigo.

#### 4.4.4 Analisis de Impacto con IA
**Problema**: El blast radius (4.3.3) muestra que nodos dependen, pero no explica el impacto.
**Solucion**: Combinar el reverse BFS con el LLM: "Si modifico `auth.service.ts`, estos 12 archivos dependen de el. El impacto probable es: [explicacion del LLM]".
**Valor**: No solo ver el impacto, sino entenderlo.

---

## 5. Metricas de Rendimiento Actuales

| Metrica | Valor actual | Objetivo |
|---------|-------------|----------|
| Nodos maximos (60fps) | ~500 (Canvas 2D) | 10,000+ (WebGL) |
| Tiempo de convergencia D3 | ~3-5s (500 nodos) | <2s (Web Worker) |
| Responsividad UI durante simulacion | Bloqueada | Fluida (Worker) |
| Tiempo de scan (proyecto medio) | 5-15s | 2-5s (paralelizacion) |
| Tamaño JSON /graph | ~200KB (500 nodos) | Streaming parcial |

---

## 6. Arquitectura de Datos (Schema)

### Nodo (`GraphNode`)
```typescript
{
  id: string;           // "file:apps/web/src/components/Button.tsx" o "module:apps/web/src"
  label: string;        // "File" | "Module" | "Class" | "Function" | "Interface"
  name: string;         // "Button.tsx" o "COMPONENTS"
  file_path: string;    // ruta relativa
  folder: string;       // directorio padre
  size?: number;        // tamaño en bytes
  loc?: number;         // lineas de codigo
  birth_time?: number;  // timestamp Unix del primer commit Git
  in_degree: number;    // dependencias entrantes
  out_degree: number;   // dependencias salientes
  metadata?: object;    // datos adicionales (children_count para Module)
}
```

### Edge (`GraphEdge`)
```typescript
{
  source: string | GraphNode;  // ID o objeto nodo
  target: string | GraphNode;
  type: string;                // "IMPORTS" | "CONTAINS" | "CALLS"
  is_cycle: boolean;           // true si forma parte de un ciclo
}
```

### Edge Types
| Tipo | Origen → Destino | Significado |
|------|------------------|-------------|
| `CONTAINS` | File → Class/Function/Interface | Estructura intra-archivo |
| `IMPORTS` | File → File | Dependencia cross-archivo (resuelta en Pasada 2) |
| `CALLS` | Function → Function | Llamada de funcion (no implementado actualmente) |

---

## 7. Endpoints de API

| Metodo | Path | Proposito |
|--------|------|-----------|
| `POST` | `/projects/scan` | Escaneo inicial (async, SSE stream) |
| `GET` | `/projects/{id}/scan/stream` | SSE stream de progreso de escaneo |
| `POST` | `/projects/{id}/rescan` | Re-escaneo (limpia grafo + reescanea) |
| `GET` | `/projects/{id}/graph?expanded=...` | Obtiene grafo con colapso jerarquico |
| `POST` | `/projects/{id}/graph/analyze` | Analisis IA streaming del grafo |
| `POST` | `/projects/{id}/analyze` | Analisis general del proyecto |

---

## 8. Decisiones Tecnicas Clave

| Decision | Razon | Alternativa descartada |
|----------|-------|----------------------|
| Tree-sitter (Python) | Parser universal multiproposito | ts-morph (Node.js) — require subprocess |
| Canvas 2D | Control pixel-level de paintNode | SVG (muy lento para 500+ nodos) |
| D3-force | Estandar de facto, flexible | WebCola (constraint-based) — mas complejo |
| Zustand store | Estado global simple para scans | Redux — overkill para un solo slice |
| AbortController | Terminacion graceful de SSE | throw Error — anti-patron, zombie reconnects |
| Super-nodos Module | Reducir carga cognitiva | Renderizar todo — colapsa el navegador |
| Stem matching TS/JS | Funciona para casos simples | tsconfig resolver — complejidad alta (pendiente) |
| `asyncio.to_thread` | No bloquear event loop de FastAPI | Sync puro — bloquea el servidor |
