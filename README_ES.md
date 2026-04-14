# LOOM

> **LOOM** es una memoria persistente para agentes de IA. Guarda tareas, decisiones y relaciones entre archivos entre sesiones, y luego las inyecta en un prompt estructurado y optimizado para caché en cada reinicio. Rastrea el estado de los archivos, mapea dependencias y marca código obsoleto automáticamente. Úsalo vía MCP o CLI para transformar chats fragmentados en colaboración continua y consciente del proyecto.

**Idiomas**: [中文](README.md) | [English](README_EN.md) | [한국어](README_KO.md) | **Español**

---

## ¿Por qué LOOM?

La mayoría de los asistentes de código con IA pierden el contexto cuando termina el chat. LOOM soluciona esto mediante:

- **Persistencia de tareas y decisiones** entre sesiones
- **Rastreo de relaciones entre archivos** (imports, bindings, estado)
- **Inyección automática de contexto estructurado** en el prompt del agente
- **Detección de archivos obsoletos/huérfanos/legacy** antes de que se conviertan en deuda técnica

---

## Inicio Rápido

```bash
# Inicializar el workspace de LOOM
./loom init "My Project"

# Ver el contexto actual (también ejecuta auto-scan del filesystem)
./loom status

# Gestión de tareas
./loom task create "Refactor auth"
./loom task set task-auth-refactor

# Consciencia del filesystem
./loom fs scan src tests
./loom fs health
./loom fs trash
./loom fs clean

# Watcher de archivos (registra artefactos automáticamente)
./loom watch src tests
```

---

## Servidor MCP

LOOM expone 15 herramientas vía MCP:

| Herramienta | Descripción |
|------|-------------|
| `loom_status` | Obtener el prompt de contexto completo |
| `loom_expand` | Expandir detalles de una entrada |
| `loom_task_set` / `loom_task_create` | Gestión de tareas |
| `loom_record_decision` | Registrar decisiones de arquitectura |
| `loom_fs_scan` | Escanear archivos y reconstruir grafo de dependencias |
| `loom_fs_health` | Reporte de salud de archivos |
| `loom_fs_trash` | Lista de candidatos para limpieza |
| `loom_watch_start` / `loom_watch_stop` | Watcher de archivos |

---

## Arquitectura Core

### 1. Prompt Basado en Slots

LOOM genera un prompt XML estructurado con orden estable para máximo reuso de KV-cache:

```xml
<loom_context>
  <protocol> ... </protocol>
  <governance> ... </governance>
  <decisions> ... </decisions>
  <dictionary> ... </dictionary>
  <task> ... </task>
  <working_set> ... </working_set>
  <risks> ... </risks>
  <recent_files> ... </recent_files>
  <fs_health> ... </fs_health>
</loom_context>
```

### 2. Tipos de Entrada

- **Rule** — restricciones duras (ej. "toda auth JWT debe pasar por middleware")
- **Pattern** — patrones de código/diseño reutilizables
- **Memory** — conocimiento general
- **Skill** — capacidades reutilizables
- **Artifact** — archivos, código, configs (con metadata del filesystem)
- **Task** — objetivos activos con progreso y working sets
- **Decision** — decisiones de arquitectura registradas

### 3. Consciencia del Filesystem

Cada Artifact rastrea:

```yaml
fs: { last_modified_at, size_bytes, exists }
deps: { imports, imported_by }
health: { status, score, reasons, suggested_action }
```

Estados de salud: `healthy` | `stale` | `orphan` | `legacy` | `redundant` | `missing`

### 4. Tres Capas de Ejecución

| Capa | Costo | Responsabilidad |
|-------|------|----------------|
| L1 Pre-computación | Costo LLM cero | Cargar entradas, construir caché, ejecutar fs scan |
| L2 Hooks | Muy bajo | Registrar artefactos, crear bindings, agregar a WAL |
| L3 Protocolo LLM | Costo de tokens | Decisiones semánticas vía system prompt + tools |

---

## Principios de Diseño

1. **El LLM es el motor** — los sistemas externos solo proveen datos y automatización ligera
2. **Consciente de costos** — preferir path matching sobre AST, AST sobre inferencia del modelo
3. **La verdad es distribuida** — Entries + Bindings + WAL son la fuente de verdad
4. **La confianza se gana** — el contenido inferido/viejo/externo debe poder degradarse e invalidarse
5. **Tarea sobre referencia** — el contexto se organiza alrededor de la tarea actual, no de similitud general
6. **Contexto estructurado sobre volcado de texto** — orquestación basada en slots, no concatenación plana de texto

---

## Estructura de Directorios

```
.loom/
├── entries/           # 7 tipos de entrada (*.loom.yml)
├── bindings/          # Archivos de relación (*.yml)
├── events/
│   └── wal.jsonl      # Log de eventos append-only
└── cache/
    ├── active-prompt.txt
    ├── manifest.yml
    └── last-fs-scan.txt

packages/loom/
├── src/
│   ├── cli.ts
│   ├── mcp.ts
│   └── core/
│       ├── store.ts
│       ├── prompt-builder.ts
│       ├── fs-tracker.ts
│       ├── dependency-graph.ts
│       ├── garbage-collector.ts
│       └── watch-daemon.ts
├── bin/loom
└── bin/loom-mcp
```

---

## Documento de Diseño Completo

Para la arquitectura completa, modelos de datos y roadmap, consulta el [README en chino](README.md).

---

## Licencia

MIT
