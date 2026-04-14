# LOOM

**Sistema operativo de contexto persistente para agentes de IA**

**Idiomas**: [中文](README.md) | [English](README_EN.md) | [한국어](README_KO.md) | **Español**

---

## ¿Qué es LOOM?

LOOM es un **sistema operativo de contexto semántico** diseñado para agentes de programación de IA como Claude Code y Kimi Code. La mayoría de los asistentes de IA pierden todo el contexto cuando termina una sesión de chat. LOOM resuelve este problema al persistir tareas, decisiones, artefactos de código y sus relaciones en una base de conocimiento local y estructurada. Cada vez que un agente inicia una nueva sesión, LOOM inyecta un prompt compacto y optimizado para caché, de modo que el agente sepa exactamente dónde dejaste el trabajo.

LOOM no solo almacena recuerdos: entiende los archivos de tu proyecto. Rastrea la frescura de los archivos, construye gráficos de dependencias por importaciones y detecta automáticamente código obsoleto, huérfano o redundante.

---

## ¿Por qué LOOM?

### El problema: la amnesia de sesión

Cuando cierras un chat con un asistente de programación de IA, todo desaparece:
- La tarea activa y su progreso
- Las decisiones de arquitectura que acabas de acordar
- En qué archivos estabas trabajando
- Por qué ciertos archivos eran relevantes

La próxima vez tendrás que explicarlo todo de nuevo. Esto está bien para preguntas puntuales, pero es agotador para refactorizaciones de varios días o trabajos de funcionalidades complejas.

### La solución de LOOM

LOOM persiste cuatro cosas fundamentales entre sesiones:

1. **Tareas y progreso** — Qué estás haciendo, qué está hecho, qué está bloqueado y qué viene después.
2. **Decisiones** — Elecciones de arquitectura que no deberían volver a cuestionarse a menos que cambien las premisas.
3. **Conjunto de trabajo (Working Set)** — Los archivos y reglas actualmente relevantes para la tarea activa.
4. **Salud del sistema de archivos** — Qué archivos están actualizados, cuáles son obsoletos, cuáles son huérfanos y qué depende de qué.

Cuando un agente inicia, LOOM genera automáticamente un prompt estructurado que contiene todo esto. El agente no tiene que adivinar: lo sabe.

---

## Inicio rápido

```bash
# 1. Inicializar LOOM en tu proyecto
./loom init "My Project"

# 2. Verificar el contexto actual (también ejecuta auto-scan del filesystem si es necesario)
./loom status

# 3. Crear y activar una tarea
./loom task create "Refactor auth middleware"
./loom task set task-auth-refactor

# 4. Iniciar la vigilancia de cambios en archivos
./loom watch src tests

# 5. Inspeccionar la salud de archivos y sus dependencias
./loom fs health
./loom fs deps src/auth/middleware.ts
```

### Instalación del servidor MCP

Para Kimi Code (o cualquier cliente compatible con MCP):

```bash
kimi mcp add --transport stdio loom -- node "/path/to/your/project/packages/loom/dist/mcp.js"
```

Esto expone 15 herramientas, incluyendo `loom_status`, `loom_expand`, `loom_fs_scan` y `loom_record_decision`.

---

## Conceptos fundamentales

### Entries: los átomos del contexto

Todo en LOOM es una **Entry (entrada)**. Existen 7 tipos:

| Tipo | Propósito |
|------|---------|
| **Rule** | Restricciones duras (p. ej., "Toda autenticación JWT debe pasar por middleware") |
| **Pattern** | Patrones de código o diseño reutilizables |
| **Memory** | Conocimiento general del proyecto |
| **Skill** | Descripciones de capacidades reutilizables |
| **Artifact** | Archivos, código, configuraciones—con metadata del filesystem |
| **Task** | Objetivos activos, progreso y conjuntos de trabajo |
| **Decision** | Decisiones de arquitectura registradas |

Toda Entry comparte el mismo esquema base:

```yaml
id: string
type: Rule | Memory | Skill | Pattern | Artifact | Task | Decision
version: number
namespace: project | user | auto | team | local

content:
  l1_5: string           # Micro-resumen, ~20 caracteres
  l2: string             # Resumen de una línea, ~100 caracteres
  l3: string | file:path # Contenido completo o referencia a archivo

lifecycle:
  state: draft | active | verified | stale | deprecated | archived | tombstone
  created: timestamp
  updated: timestamp
  last_accessed: timestamp
  last_activated: timestamp
  activation_count: number
  verification_count: number

quality:
  freshness: number      # [0,1]
  trust: number          # [0,1]
  activity: number       # [0,1]
  composite_score: number

trust:
  level: trusted | verified | derived | inferred | untrusted
  source: human | tool | model | import | pattern | external

activation:
  paths: string[]        # Rutas de archivo que activan esta entrada
  keywords: string[]
  intents: string[]
  tools: string[]
  entry_refs: string[]

conflicts:
  supersedes: string[]
  conflicts_with: string[]
  overridden_by: string | null
  precedence: number
  resolution_policy: newest_wins | verified_wins | manual_wins | scoped_wins

bindings_out: { target, rel, conf }[]
bindings_in:  { source, rel, conf }[]
```

### Bindings: el tejido conectivo

Un **Binding (vínculo)** es una relación persistente y tipada entre dos Entries. A diferencia de simples etiquetas, los Bindings llevan puntuaciones de confianza, evidencia, modelos de decaimiento y seguimiento de invalidación.

```yaml
source: string
target: string
relationship: governs | realized_in | depends_on | exemplifies | co_evolves | impacts | blocked_by
directionality: forward | bidirectional | inferred_reverse
status: active | weak | broken | superseded
confidence: number

confidence_model:
  base: number
  freshness_factor: number
  evidence_weight: number
  usage_boost: number
  drift_penalty: number

evidence:
  - type: path_match | import_scan | ast_pattern | lsp_reference | dialogue | test_pass | git_cochange | user_confirmed
    detail: string
    weight: number
    discovered: timestamp

decay:
  half_life_days: number
  last_reconfirmed: timestamp

invalidation:
  invalidated_by: string | null
  reason: string | null

verification_history:
  - date: timestamp
    method: ast_scan | lsp | import_scan | test_pass | user_confirm
    result: passed | weakened | failed | inconclusive
```

Esto significa que puedes preguntar `loom why art-auth-middleware` y obtener una cadena causal precisa: *"Está en el conjunto de trabajo de la tarea actual, está gobernado por rule-auth-style y el usuario lo está editando activamente."*

### Artifact: archivos con inteligencia

Los Artifacts en LOOM no son solo rutas de archivo. Entienden el sistema de archivos:

```yaml
artifact:
  path: string
  category: source_code | config | schema | migration | infra | docs
  file_type: string
  granularity: file | symbol | span | heading | config_key
  symbol: string | null
  span: { start_line, end_line }
  line_count: number
  git_tracked: boolean
  last_git_commit: string | null
  last_modifier: agent | user | both
  content_hash: string
  summary_hash: string

  # Consciencia del filesystem
  fs:
    last_modified_at: ISO timestamp
    last_seen_at: ISO timestamp
    size_bytes: number
    exists: boolean

  deps:
    imports: string[]       # Archivos que importa este artifact
    imported_by: string[]   # Archivos que importan este artifact

  health:
    status: healthy | stale | orphan | legacy | redundant | missing
    score: 0..1
    reasons: string[]
    suggested_action: keep | archive | delete | review
```

---

## Orquestación de prompts basada en slots

LOOM no vierte texto arbitrariamente en la ventana de contexto. Genera un prompt XML estructurado con slots ordenados por estabilidad para maximizar los aciertos de caché KV del modelo de lenguaje.

```xml
<loom_context>
  <protocol>
    Tienes un sistema de memoria semántica persistente.
    Si un ↣id podría ser importante pero no estás seguro, llama a loom_expand(id, level).
    Antes de modificar un artifact, verifica governance / risks / decisions.
    Si llegas a una conclusión estable, propón crear una Task / Decision / Rule / Memory.
  </protocol>

  <governance>
    ↣rule-auth-style: La autenticación JWT+RBAC debe pasar por middleware
  </governance>

  <decisions>
    ↣decision-rbac-over-abac: Elegir RBAC, no ABAC
  </decisions>

  <dictionary>
    ↣pattern-error-envelope: Estructura unificada de retorno de errores
    ↣task-auth-refactor: Refactorizar middleware de autenticación y mantener tests
  </dictionary>

  <task id="task-auth-refactor" status="active">
    Objetivo: Refactorizar middleware de autenticación y mantener tests pasando
    Actual: Arreglar lógica de permisos RBAC en middleware
    Pendiente: Si mantener el fallback de sesión antiguo
  </task>

  <working_set>
    ↣art-auth-middleware: src/auth/middleware.ts
    ↣art-auth-test: src/auth/middleware.test.ts
  </working_set>

  <risks>
    ↣art-auth-test: Resumen aún no verificado tras edición del usuario
  </risks>

  <recovery>
    Último punto de control: Refactorización principal del middleware completada, siguiente paso arreglar fixtures de tests
  </recovery>

  <recent_files>
    ↣art-auth-test: src/auth/middleware.test.ts (modificado 2026/4/14)
  </recent_files>

  <fs_health>
    ↣art-legacy-adapter: src/auth/legacy_adapter.ts está en estado legacy (acción: review)
  </fs_health>
</loom_context>
```

### ¿Por qué este orden?

Los slots se ordenan de lo **más estable** a lo **más volátil**:

1. **Capa estática** (`protocol` → `governance` → `decisions` → `dictionary`): Cambia muy lentamente. Se coloca primero para que el LLM pueda cachearla entre sesiones.
2. **Capa dinámica** (`task` → `working_set` → `risks` → `recovery` → `recent_files` → `fs_health`): Puede cambiar cada sesión. Se coloca al final para que los cambios no invaliden el prefijo cacheado.

Todos los slots de lista se ordenan internamente por `id` para evitar que fluctuaciones de orden rompan los aciertos de caché.

### Conciencia de presupuesto de tokens

| Slot | Tokens aproximados |
|------|----------------|
| protocol | 150-200 |
| governance | ~300 |
| decisions | ~200 |
| dictionary | 300-500 |
| task | ~200 |
| working_set | ~400 |
| risks | ~150 |
| recovery | ~150 |
| recent_files | ~150 |
| fs_health | ~150 |
| expanded (bajo demanda) | ~3000 |

Los slots fijos apuntan a 1500-2100 tokens. El contexto inyectado total debería mantenerse por debajo del 8-15% de la ventana de contexto del modelo.

---

## Consciencia del sistema de archivos

LOOM entiende los archivos de tu proyecto no solo como texto, sino como un sistema vivo.

### Capacidades fundamentales

| Capacidad | Descripción | Disparador |
|------------|-------------|---------|
| **Rastreo de frescura** | Rastrea `mtime`, `size_bytes` y `exists` para cada artifact | Automático / `loom fs scan` |
| **Grafo de dependencias** | Analiza imports en JS/TS/Python/Go/Rust/Java/etc. | Automático / `loom fs deps <path>` |
| **Análisis de salud** | Detecta archivos stale, orphan, legacy, redundant y missing | Automático / `loom fs health` |
| **Basura y limpieza** | Sugiere y ejecuta archivado a `.loom/trash/` o eliminación | `loom fs trash` / `loom fs clean` |

### Comportamiento de auto-disparo

No necesitas recordar ejecutar escaneos:

1. **Al ejecutar `loom status`** — Si han pasado más de 5 minutos desde el último escaneo, LOOM ejecuta automáticamente un escaneo ligero del sistema de archivos (metadata + grafo de dependencias + análisis de salud) antes de generar el prompt.
2. **Al hacer flush del Watch Daemon** — Después de que el demonio procesa un lote de cambios de archivos, dispara automáticamente un escaneo incremental.

### Estados de salud

| Estado | Condición | Acción sugerida |
|--------|-----------|------------------|
| `healthy` | Archivo normal y activo | keep |
| `stale` | No modificado en >90 días | review |
| `orphan` | Sin bindings ni referencias | review |
| `legacy` | Nombre de archivo contiene old/backup/deprecated/etc. | review |
| `redundant` | Hash de contenido idéntico a otro archivo | archive |
| `missing` | Ya no existe en el disco | delete |

---

## Tres capas de ejecución

LOOM está diseñado con una conciencia de costos en su núcleo.

### Capa 1: Pre-computación (costo LLM cero)

Se ejecuta antes de que comience la sesión:
- Cargar todas las entries, bindings y WAL
- Reconstruir caché de manifiesto, hot entries y working set cache
- Restaurar la tarea activa
- Ejecutar escaneo del sistema de archivos y análisis de salud
- Calcular riesgos y marcadores stale/dirty

**Objetivo:** menos de 100ms para proyectos pequeños y medianos.

### Capa 2: Hooks (costo muy bajo)

Se ejecuta sincrónicamente después de escrituras/edición de archivos:
- Registrar nuevos Artifacts
- Crear bindings inmediatos de bajo costo (coincidencia de ruta, coincidencia de palabra clave)
- Marcar resúmenes como stale
- Agregar al WAL
- Disparar actualizaciones del conjunto dirty

**Objetivo:** menos de 50ms por hook.

### Capa 3: Protocolo LLM (costo de tokens, pero controlado)

El LLM decide:
- Si expandir detalles L2/L3
- Cuál debería ser la siguiente acción
- Cuándo registrar una Decision
- Cuándo proponer una nueva Rule/Memory/Pattern
- Si un riesgo necesita verificación

El LLM está restringido por el system prompt e interactúa usando herramientas como `loom_expand`, `loom_record_decision` y `loom_verify`.

---

## CLI y herramientas MCP

### CLI de shell

| Comando | Propósito |
|---------|---------|
| `./loom init <name>` | Inicializar workspace `.loom/` |
| `./loom status` | Mostrar contexto del prompt basado en slots |
| `./loom expand <id> [l2\|l3]` | Expandir una entrada |
| `./loom explain <id>` | Mostrar metadata y bindings |
| `./loom why <id>` | Explicar relevancia en el contexto actual |
| `./loom task` | Listar tareas |
| `./loom task set <id>` | Activar tarea |
| `./loom task create <title>` | Crear nueva tarea |
| `./loom watch [dirs...]` | Iniciar demonio de vigilancia de archivos |
| `./loom watch stop` | Detener vigilante |
| `./loom fs scan [dirs...]` | Escanear archivos, actualizar metadata, reconstruir deps |
| `./loom fs deps <path>` | Mostrar imports e imported-by |
| `./loom fs health` | Mostrar reporte de salud |
| `./loom fs trash` | Listar candidatos para limpieza |
| `./loom fs clean` | Archivar/eliminar archivos no saludables |

### Herramientas MCP

| Herramienta | Propósito |
|------|---------|
| `loom_status` | Obtener el prompt de contexto actual |
| `loom_read_prompt` | Leer el prompt en caché directamente |
| `loom_expand` | Expandir detalles de entrada |
| `loom_explain` | Explicar metadata de entrada |
| `loom_why` | Explicar relevancia de entrada |
| `loom_task_set` | Cambiar tarea activa |
| `loom_task_create` | Crear nueva tarea |
| `loom_record_decision` | Registrar decisión de arquitectura |
| `loom_watch_start` | Iniciar demonio de vigilancia |
| `loom_watch_stop` | Detener demonio de vigilancia |
| `loom_watch_status` | Verificar estado del vigilante |
| `loom_fs_scan` | Disparar escaneo del sistema de archivos |
| `loom_fs_deps` | Mostrar dependencias de archivo |
| `loom_fs_health` | Mostrar reporte de salud |
| `loom_fs_trash` | Mostrar candidatos para limpieza |

---

## Estructura de directorios

```
.loom/                         # Fuente de verdad
├── entries/
│   ├── rules/
│   ├── memories/
│   ├── skills/
│   ├── patterns/
│   ├── artifacts/
│   ├── tasks/
│   └── decisions/
├── bindings/                  # Archivos de relación *.yml
├── events/
│   └── wal.jsonl              # Registro de eventos append-only
├── cache/
│   ├── active-prompt.txt      # Inyectado en sesiones de agentes
│   ├── manifest.yml
│   ├── binding-graph.json
│   ├── working-set.yml
│   ├── hot-entries.yml
│   ├── intent-map.yml
│   └── last-fs-scan.txt
├── sessions/
└── config.yml

packages/loom/
├── src/
│   ├── cli.ts
│   ├── mcp.ts
│   └── core/
│       ├── store.ts
│       ├── prompt-builder.ts
│       ├── fs-tracker.ts
│       ├── fs-scan.ts
│       ├── dependency-graph.ts
│       ├── garbage-collector.ts
│       ├── binding-discovery.ts
│       ├── watch-daemon.ts
│       └── paths.ts
├── bin/loom
├── bin/loom-mcp
├── package.json
└── tsconfig.json
```

**Importante:** `.loom/` es la fuente de verdad. Los archivos de caché pueden reconstruirse a partir de entries + bindings + WAL.

---

## Principios de diseño

```yaml
P1_llm_is_the_engine:
  statement: "El LLM es el centro de comprensión y toma de decisiones."
  implication: "Los sistemas externos solo proveen datos y automatización ligera."

P2_cost_aware:
  statement: "Cada capacidad debe ser consciente del costo en tiempo y tokens."
  implication: "Preferir coincidencia de rutas sobre AST, y AST sobre inferencia del modelo."

P3_truth_is_distributed:
  statement: "Entries + Bindings + Event Log son la fuente de verdad."
  implication: "Los manifiestos y cachés son derivados y pueden reconstruirse."

P4_trust_is_earned:
  statement: "La memoria no es un hecho. Todas las entries y bindings deben ganar confianza."
  implication: "El contenido inferido, viejo o externo debe poder degradarse e invalidarse."

P5_task_over_reference:
  statement: "El contexto se organiza alrededor de la tarea actual, no de la similitud general."
  implication: "Task / Working Set / Decision importan más que la coincidencia semántica pura."

P6_structured_context_over_text_dump:
  statement: "Inyectar contexto basado en responsabilidades, no volcados de texto."
  implication: "Usar orquestación basada en slots, no concatenación plana de L1/L2/L3."
```

---

## Hoja de ruta

### Fase 1: Esqueleto
- WAL + entries + caché
- Micro-resúmenes L1.5
- Task / Decision
- Prompt basado en slots
- `loom_expand`

### Fase 2: Continuidad de tareas y gobernanza
- Caché de working set
- Bindings instantáneos de nivel 0
- Slot de riesgos
- `loom status`, `loom explain`, `loom why`

### Fase 3: Decaimiento y verificación
- Motor de decaimiento (decay)
- Capa de verificadores (verifier)
- Invalidación de bindings
- `loom audit`, `loom verify`

### Fase 4: Mejoras de alta precisión
- Integración AST / LSP
- Artefactos a nivel de símbolo/span
- Recuperación por embeddings
- Análisis de co-evolución

---

## Licencia

MIT
