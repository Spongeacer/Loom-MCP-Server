# LOOM

> **LOOM** is persistent memory for AI agents. It saves tasks, decisions, and file relationships across sessions, then injects them into a structured, cache-optimized prompt on every restart. It tracks file health, maps dependencies, and flags stale code automatically. Use it via MCP or CLI to turn fragmented chats into continuous, project-aware collaboration.

**Languages**: [中文](README.md) | **English** | [한국어](README_KO.md) | [Español](README_ES.md)

---

## Why LOOM?

Most AI coding assistants lose context when the chat ends. LOOM solves this by:

- **Persisting tasks and decisions** across sessions
- **Tracking file relationships** (imports, bindings, health)
- **Injecting structured context** into the agent's prompt automatically
- **Detecting stale/orphan/legacy files** before they become tech debt

---

## Quick Start

```bash
# Initialize LOOM workspace
./loom init "My Project"

# Check current context (also auto-runs filesystem scan)
./loom status

# Task management
./loom task create "Refactor auth"
./loom task set task-auth-refactor

# File system awareness
./loom fs scan src tests
./loom fs health
./loom fs trash
./loom fs clean

# File watcher (auto-registers artifacts)
./loom watch src tests
```

---

## MCP Server

LOOM exposes 15 tools via MCP:

| Tool | Description |
|------|-------------|
| `loom_status` | Get full context prompt |
| `loom_expand` | Expand entry details |
| `loom_task_set` / `loom_task_create` | Task management |
| `loom_record_decision` | Log architecture decisions |
| `loom_fs_scan` | Scan files & rebuild dependency graph |
| `loom_fs_health` | Show file health report |
| `loom_fs_trash` | List cleanup candidates |
| `loom_watch_start` / `loom_watch_stop` | File watcher |

---

## Core Architecture

### 1. Slot-Based Prompt

LOOM generates a structured XML prompt with stable ordering for maximum KV-cache reuse:

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

### 2. Entry Types

- **Rule** — hard constraints (e.g. "all JWT auth must go through middleware")
- **Pattern** — reusable code/design patterns
- **Memory** — general knowledge
- **Skill** — reusable capabilities
- **Artifact** — files, code, configs (with filesystem metadata)
- **Task** — active goals with progress and working sets
- **Decision** — recorded architectural choices

### 3. Filesystem Awareness

Every Artifact tracks:

```yaml
fs: { last_modified_at, size_bytes, exists }
deps: { imports, imported_by }
health: { status, score, reasons, suggested_action }
```

Health statuses: `healthy` | `stale` | `orphan` | `legacy` | `redundant` | `missing`

### 4. Three Execution Layers

| Layer | Cost | Responsibility |
|-------|------|----------------|
| L1 Pre-computation | Zero LLM cost | Load entries, build cache, run fs scan |
| L2 Hooks | Very low | Register artifacts, create bindings, append WAL |
| L3 LLM Protocol | Token cost | Semantic decisions via system prompt + tools |

---

## Design Principles

1. **LLM is the engine** — external systems only provide data and light automation
2. **Cost-aware** — prefer path matching over AST, AST over model inference
3. **Truth is distributed** — Entries + Bindings + WAL are the source of truth
4. **Trust is earned** — inferred/old/external content must be downranked and invalidate-able
5. **Task over reference** — context is organized around the current task, not general similarity
6. **Structured context over text dump** — slot-based orchestration, not flat text concatenation

---

## Directory Structure

```
.loom/
├── entries/           # 7 entry types (*.loom.yml)
├── bindings/          # Relationship files (*.yml)
├── events/
│   └── wal.jsonl      # Append-only event log
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

## Full Design Doc

For the complete architecture, data models, and roadmap, see the [Chinese README](README.md).

---

## License

MIT
