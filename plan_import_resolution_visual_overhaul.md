# Plan Corregido: Resolucion de Imports + Overhaul Visual Premium

> Plan verificado contra codigo fuente. Reemplaza al plan anterior.
> Fecha: 2026-07-22

---

## PARTE 1: Resolucion de Imports (Backend)

### 1.1 Diagnostico Verificado

| Dato | Valor | Fuente |
|------|-------|--------|
| `tsconfig.json` | 1 archivo en `apps/web/tsconfig.json` | `find` |
| `paths` en tsconfig | `"@/*": ["./src/*"]` | `cat tsconfig.json` |
| `baseUrl` en tsconfig | **Ausente** | `cat tsconfig.json` |
| `moduleResolution` | `"bundler"` | `cat tsconfig.json` |
| `package.json` con workspace | **No existe** (no hay `packages/`) | `find` |
| Imports con alias `@/` | 84 | `grep` en `apps/web/src/` |
| Imports relativos `../` | 6 | `grep` |
| Imports relativos `./` | 6 | `grep` |
| Imports externos (node_modules) | 71 | `grep` (react, next, d3, etc.) |
| `json5` disponible | **No** | `python3 -c "import json5"` |
| `import_resolver.py` existe | **No** | `find` |
| Tests existentes de imports | `test_scan_codebase_imports.py` (Python + dedupe) | `ls tests/` |

### 1.2 Correcciones al Plan Original (6 Huecos)

#### Hueco 1: Resolucion de Extensiones (CRITICAL)

**Problema**: `import { X } from "@/lib/api"` se traduce a `src/lib/api`. Pero el archivo real es `src/lib/api.ts`. TypeScript con `moduleResolution: "bundler"` no requiere extensiones.

**Solucion**: Despues de resolver el alias, probar extensiones en orden:
```python
CANDIDATE_EXTS = [".ts", ".tsx", ".js", ".jsx", ".mjs", ".json"]

def try_resolve_file(base_path: str, file_set: set[str]) -> str | None:
    # 1. Exact match (already has extension)
    if base_path in file_set:
        return base_path
    # 2. Try each extension
    for ext in CANDIDATE_EXTS:
        candidate = base_path + ext
        if candidate in file_set:
            return candidate
    # 3. Try index files (directory import)
    for ext in CANDIDATE_EXTS:
        candidate = base_path + "/index" + ext
        if candidate in file_set:
            return candidate
    return None
```

#### Hueco 2: WorkspaceResolver Innecesario (LOW)

**Problema**: El plan propone un `WorkspaceResolver` para mapear `@org/shared` → `packages/shared/`. Pero este monorepo no tiene `packages/`. Es `apps/web/` + `apps/api/` (Python + TypeScript, sin imports cruzados).

**Solucion**: **Eliminar el `WorkspaceResolver`** del plan. Si en el futuro se anaden `packages/`, se implementara entonces. YAGNI.

#### Hueco 3: `baseUrl` Ausente (MEDIUM)

**Problema**: El `TSConfigResolver` del plan asume que `baseUrl` existe. El tsconfig actual no lo tiene. Con `moduleResolution: "bundler"`, los `paths` se resuelven relativos al directorio del `tsconfig.json`.

**Solucion**:
```python
base_url = tsconfig_dir  # Si baseUrl ausente, usar directorio del tsconfig.json
# Si baseUrl presente, resolverlo relativo a tsconfig_dir
```

#### Hueco 4: Filtrado de Imports Externos (HIGH)

**Problema**: 71 de 96 imports son a `node_modules` (react, next, d3, lucide, sonner, zustand). Si el resolver no los filtra, hara stem matching contra archivos del proyecto y puede crear edges falsos.

**Solucion**: Un import es externo si:
- No empieza con `./` o `../` (relativo)
- No empieza con un alias conocido del tsconfig (ej: `@/`)
- No es un bare import que matchea un archivo del proyecto

```python
def is_external_import(imp: str, alias_prefixes: list[str]) -> bool:
    if imp.startswith("./") or imp.startswith("../"):
        return False
    for prefix in alias_prefixes:
        if imp.startswith(prefix):
            return False
    return True  # node_modules — skip
```

#### Hueco 5: `json5` No Disponible (MEDIUM)

**Problema**: Los `tsconfig.json` de Next.js pueden tener comentarios `//`. `json.loads()` falla con comentarios. `json5` no esta en las dependencias.

**Solucion**: Strip de comentarios con regex (no anadir dependencia):
```python
import re

def strip_json_comments(text: str) -> str:
    # Remueve comentarios // de una linea (no dentro de strings)
    return re.sub(r'\/\/.*?$', '', text, flags=re.MULTILINE)
```

#### Hueco 6: `lstrip("./@")` Destruuye Relativos (HIGH)

**Problema**: El codigo actual (`ast_parser.py:225`) hace:
```python
normalized_imp = imp.replace("\\", "/").replace(".", "/").lstrip("./@")
```
Esto convierte `../../utils/helpers` en `utils/helpers` ANTES de cualquier resolucion. El plan propone anadir resolucion relativa, pero si no se reemplaza este flujo completo, la resolucion relativa recibira `utils/helpers` en lugar de `../../utils/helpers`.

**Solucion**: Reemplazar el bloque completo del branch `else` (no-Python) en `resolve_import_edges`:

```python
# ANTES (fragil):
normalized_imp = imp.replace("\\", "/").replace(".", "/").lstrip("./@")
target_stem = Path(normalized_imp).stem
matching_files = file_stems.get(target_stem, [])

# DESPUES (correcto):
if imp.startswith("./") or imp.startswith("../"):
    # Relativo: resolver desde el directorio del archivo fuente
    source_dir = Path(source_path_str).parent
    resolved = (source_dir / imp).resolve()
    target = try_resolve_file(str(resolved), file_set)
elif alias_resolver and alias_resolver.is_alias(imp):
    # Alias: resolver via tsconfig paths
    resolved = alias_resolver.resolve(imp, source_path_str)
    target = try_resolve_file(str(resolved), file_set)
else:
    continue  # Externo (node_modules) — skip
```

### 1.3 Arquitectura Final del ImportResolver

```
ast_parser.py:resolve_import_edges()
    │
    ├── 1. Construir file_set: set[str] de todos los file_paths (O(1) lookup)
    │
    ├── 2. Escanear tsconfig.json en file_paths
    │   └── TSConfigResolver(tsconfig_path, file_set)
    │       ├── parse_tsconfig() → {baseUrl, paths}
    │       ├── is_alias(imp) → bool
    │       └── resolve(imp, source_file) → str | None
    │           ├── Traduce alias via paths mapping
    │           ├── Resuelve relativos al baseUrl o tsconfig_dir
    │           └── try_resolve_file() con extensiones
    │
    └── 3. Para cada (source_id, imports):
        ├── Python → resolve_python_import() (existente, correcto)
        └── TS/JS/Go/Java:
            ├── Es relativo? → (source_dir / imp).resolve() + try_resolve_file()
            ├── Es alias? → TSConfigResolver.resolve() + try_resolve_file()
            └── Es externo? → skip
```

### 1.4 Archivos a Crear/Modificar

| Accion | Archivo | Descripcion |
|--------|---------|-------------|
| [NEW] | `apps/api/app/infrastructure/parser/import_resolver.py` | TSConfigResolver + try_resolve_file + strip_json_comments |
| [MODIFY] | `apps/api/app/infrastructure/parser/ast_parser.py` | Refactor branch `else` de `resolve_import_edges` |
| [NEW] | `apps/api/tests/test_import_resolver.py` | Tests: alias, relativo, extension, externo, index.ts |

### 1.5 Casos de Test

```python
# 1. Alias basico
import_path = "@/lib/api"
tsconfig = {"paths": {"@/*": ["./src/*"]}, "baseUrl": "."}
# Esperado: src/lib/api.ts

# 2. Relativo simple
import_path = "./button"
source = "src/ui/index.ts"
# Esperado: src/ui/button.tsx

# 3. Relativo con subida
import_path = "../../utils/helpers"
source = "src/components/ui/Button.tsx"
# Esperado: src/utils/helpers.ts

# 4. Directorio (index resolution)
import_path = "@/store"
tsconfig = {"paths": {"@/*": ["./src/*"]}}
# Esperado: src/store/index.ts

# 5. Externo (node_modules) — debe retornar None
import_path = "react"
# Esperado: None

# 6. Sin extension, multiples candidatas
import_path = "@/components/Button"
# Archivos: Button.ts, Button.tsx, Button.js
# Esperado: Button.ts (primera en CANDIDATE_EXTS)

# 7. tsconfig con comentarios JSON
tsconfig_content = '{ // comment\n"paths": {"@/*": ["./src/*"]} }'
# Debe parsear correctamente
```

---

## PARTE 2: Overhaul Visual Premium (Frontend)

### 2.1 Estado Actual Verificado

El `GraphScene` ya tiene un diseño "deep space" pulido:

| Feature | Estado actual |
|---------|---------------|
| Background | `#050508` (near-black void) |
| Nodos | Bloom glow + iconos Devicon + formas geometricas (circulo/cuadrado/triangulo/diamante) |
| Super-nodos Module | Indigo con contador, halo orbital en background |
| Edges | `rgba(148,163,184,0.18)` — casi invisibles |
| Panel izquierdo | Flat, `surfaceElevated: #0f0f14`, sin jerarquia visual |
| Toolbar inferior | Flat, botones sin agrupacion |
| Tooltip hover | Caja negra basica con texto blanco |
| Breadcrumbs | Pills indigo con glow |
| Animacion cronologica | Slider basico + porcentaje |
| Rescan overlay | Spinner + texto centrado |

### 2.2 Filosofia del Overhaul: "Mission Control"

El objetivo no es cambiar la identidad visual (deep space es acertada), sino elevar la calidad de ejecucion a nivel de herramientas enterprise como **Linear**, **Vercel Dashboard**, **Cursor**, **Raycast**.

Principios:
1. **Glassmorphism controlado**: paneles con `backdrop-blur` + borde sutil + sombra profunda
2. **Jerarquia tipografica**: titulos con `font-medium tracking-wide`, valores con `font-mono`
3. **Microinteracciones**: hover states con `scale-105` + transicion `cubic-bezier`
4. **Densidad informativa**: cada pixel aporta valor, sin clutter
5. **Consistencia de tokens**: un solo sistema de colores, no hardcoded hex dispersos

### 2.3 Cambios Concretos

#### 2.3.1 Panel de Control Izquierdo (Mission Control Panel)

**Antes**: Flat, sin jerarquia, colores hardcoded.

**Despues**:
- Container: `backdrop-blur-xl bg-[#0a0a0f]/80 border border-white/5 shadow-2xl rounded-xl`
- Busqueda: input con `bg-white/5 border-white/10 focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/20`
- Filtros de tipo: pills con `bg-white/5` cuando activos, border con color del nodo a `40%` opacidad
- Seccion metricas: header con `text-[10px] font-semibold tracking-[0.15em] text-white/40 uppercase`
- Valores: `font-mono text-white/80` (no `text-zinc-200`)
- Boton Sincronizar: `bg-white/5 hover:bg-white/10 border border-white/10` cuando idle, `bg-blue-500/20 border-blue-500/40 text-blue-300` cuando scanning
- Boton Analisis IA: `bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500` con `shadow-lg shadow-blue-500/25`
- Tags de extension: `bg-white/5 text-white/50 border border-white/5 font-mono text-[9px]`

#### 2.3.2 Toolbar Inferior (Command Bar)

**Antes**: Flat, botones sin agrupacion visual.

**Despues**:
- Container: `backdrop-blur-xl bg-[#0a0a0f]/80 border border-white/5 shadow-2xl rounded-xl`
- Botones con `p-2.5` (mas grandes), iconos `w-4 h-4`
- Separadores: `w-px h-5 bg-white/10` en lugar de `border-l border-[#3f3f46]`
- Agrupacion: zoom (3 botones) | separador | physics (1) | separador | flow (1)
- Estados activos: `bg-emerald-500/15 text-emerald-400` (physics), `bg-amber-500/15 text-amber-400` (flow)
- Hover: `hover:bg-white/5 hover:text-white` con `transition-all duration-200`

#### 2.3.3 Timeline Cronologica (Time Machine)

**Antes**: Slider basico + porcentaje como texto.

**Despues**:
- Container: `backdrop-blur-xl bg-[#0a0a0f]/80 border border-white/5 shadow-2xl rounded-xl`
- Slider: `accent-blue-500` con `h-1.5` (mas grueso), `rounded-full`
- Boton Play/Pause: `bg-white/5 hover:bg-white/10 rounded-lg p-2` con icono `w-4 h-4`
- Porcentaje: `font-mono text-xs text-white/60 tabular-nums`
- Anadir etiqueta temporal: fecha real del cutoff (ej: "Jul 2024") al lado del porcentaje
- Track del slider con `bg-white/10` y fill con `bg-gradient-to-r from-blue-600 to-cyan-400`

#### 2.3.4 Leyenda de Modulos (Top Right)

**Antes**: Flat, lista simple.

**Despues**:
- Container: `backdrop-blur-xl bg-[#0a0a0f]/80 border border-white/5 shadow-2xl rounded-xl`
- Header: `text-[10px] font-semibold tracking-[0.15em] text-white/40 uppercase`
- Items: `hover:bg-white/5 rounded-md px-2 py-1 transition-all`
- Dots: `w-2.5 h-2.5 rounded-full` con `shadow-[0_0_8px_var(--color)]` (glow)
- Contador de archivos por modulo al lado derecho en `text-white/30 font-mono text-[10px]`

#### 2.3.5 Context Menu (Right Click)

**Antes**: Caja negra plana.

**Despues**:
- `backdrop-blur-xl bg-[#0f0f14]/95 border border-white/10 shadow-2xl rounded-xl py-1.5 min-w-[200px]`
- Items: `px-4 py-2.5 hover:bg-white/5 transition-all flex items-center gap-3`
- Iconos: `w-4 h-4 text-white/40` que se ponen `text-white/80` on hover
- Separador entre acciones: `h-px bg-white/5 my-1`
- Animacion de entrada: `origin-top scale-95 opacity-0 → scale-100 opacity-100` con `duration-150`

#### 2.3.6 Rescan Overlay

**Antes**: Spinner + texto centrado.

**Despues**:
- Overlay completo: `bg-black/60 backdrop-blur-sm`
- Card centrada: `bg-[#0f0f14]/90 border border-white/10 shadow-2xl rounded-2xl px-6 py-4`
- Spinner: `animate-spin text-blue-400 w-5 h-5`
- Texto: `text-sm text-white/80 font-medium`
- Subtexto: `text-xs text-white/40` ("Sincronizando AST con Git birth dates...")

#### 2.3.7 Breadcrumbs de Carpetas

**Antes**: Pills indigo con glow.

**Despues**: Mantener pero refinar:
- `bg-indigo-500/10 border border-indigo-500/30 text-indigo-200/90 backdrop-blur-md rounded-full`
- Glow: `shadow-[0_0_12px_rgba(99,102,241,0.2)]`
- Hover: `hover:bg-indigo-500/20 hover:border-indigo-500/50`
- Boton X: `hover:bg-red-500/20 hover:text-red-300 rounded-full p-0.5`

#### 2.3.8 Tooltip de Hover (Canvas)

**Antes**: Caja negra basica con texto blanco.

**Despues**: En `paintNode`, mejorar el tooltip:
- Fondo: `rgba(10,10,15,0.92)` con `roundRect` radius `6`
- Borde: `strokeStyle = "rgba(255,255,255,0.1)"` con `lineWidth = 1`
- Texto: `font = "11px 'Inter', sans-serif"` con `fillStyle = "rgba(255,255,255,0.9)"`
- Padding: `6px` horizontal, `4px` vertical
- LOC en `font-mono` con color azul: `"rgba(96,165,250,0.9)"`
- Degrees con iconos visuales: `"↓3 ↑2"` en gris claro

### 2.4 Tokens de Diseño Unificados

Reemplazar todos los hex dispersos (`#18181b`, `#3f3f46`, `#27272a`, `#0a0a0a`) por un sistema de tokens:

```typescript
// graph-theme.ts — anadir tokens de UI
export const graphUI = {
  // Surfaces (glassmorphism)
  surface:        "rgba(10, 10, 15, 0.80)",   // paneles principales
  surfaceHover:   "rgba(255, 255, 255, 0.05)", // hover de items
  surfaceActive:  "rgba(255, 255, 255, 0.08)", // items activos

  // Borders
  border:         "rgba(255, 255, 255, 0.06)", // sutil
  borderActive:   "rgba(96, 165, 250, 0.40)",  // azul activo

  // Text
  textPrimary:    "rgba(255, 255, 255, 0.90)",
  textSecondary:  "rgba(255, 255, 255, 0.50)",
  textMuted:      "rgba(255, 255, 255, 0.30)",

  // Accent
  accentBlue:     "rgba(96, 165, 250, 0.90)",
  accentEmerald:  "rgba(52, 211, 153, 0.90)",
  accentAmber:    "rgba(245, 158, 11, 0.90)",

  // Shadows
  shadowPanel:    "0 8px 32px rgba(0, 0, 0, 0.40)",
  shadowButton:   "0 4px 16px rgba(0, 0, 0, 0.30)",
};
```

### 2.5 Archivos a Modificar (Frontend)

| Archivo | Cambios |
|---------|---------|
| `apps/web/src/lib/graph-theme.ts` | Anadir `graphUI` tokens |
| `apps/web/src/components/GraphScene.tsx` | Aplicar tokens a todos los paneles, toolbar, timeline, context menu, overlay, breadcrumbs |

### 2.6 Lo que NO se cambia

- Motor de fisicas D3 (`forceRadial`, `forceCluster`, `forceCollide`) — ya calibrado
- `paintNode` (formas, bloom, supernova, LOD) — ya pulido
- `paintBackground` (halos orbitales) — ya pulido
- Logica de rescan (dual-guard, watchdog, cerrojo visual) — ya robusta
- Animacion cronologica (cutoffTimeRef, nodeVisibility, linkVisibility) — ya funcional
- ScanProgressBar — ya refactorizado con AbortController

---

## PARTE 3: Orden de Ejecucion

```
Fase 1: Backend — ImportResolver
  ├── Crear import_resolver.py (TSConfigResolver + try_resolve_file)
  ├── Refactor resolve_import_edges branch else
  ├── Crear test_import_resolver.py
  └── Verificar: pytest + reescaneo manual

Fase 2: Frontend — Tokens de Diseño
  ├── Anadir graphUI a graph-theme.ts
  └── Verificar: tsc --noEmit

Fase 3: Frontend — Overhaul Visual
  ├── Panel izquierdo (mission control)
  ├── Toolbar inferior (command bar)
  ├── Timeline (time machine)
  ├── Leyenda de modulos
  ├── Context menu
  ├── Rescan overlay
  ├── Breadcrumbs
  └── Tooltip canvas

Fase 4: Verificacion Final
  ├── tsc --noEmit (cero errores nuevos)
  ├── eslint (cero errores nuevos)
  ├── pytest (cero failures nuevos)
  └── Verificacion manual: reescaneo + grafo con constelaciones conectadas
```

---

## PARTE 4: Open Questions Resueltas

| Pregunta | Respuesta | Evidencia |
|----------|-----------|-----------|
| Buscar tsconfig dinamicamente o solo raiz? | **Dinamicamente** en `file_paths` | El tsconfig esta en `apps/web/`, no en raiz |
| Priorizar exactitud sobre milisegundos? | **Si** | 96 imports totales, 1 tsconfig de 500 bytes — impacto despreciable |
| WorkspaceResolver necesario? | **No** | No hay `packages/` en este monorepo |
| json5 o regex? | **Regex** | No anadir dependencia para un tsconfig sin comentarios complejos |
