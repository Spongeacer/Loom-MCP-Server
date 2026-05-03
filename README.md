# LOOM

**Persistent context layer for AI agents.**

> **v0.5.0 — Memory Lifecycle + Cloud LLM Extraction + Privacy Controls**
> 
> New: Exponential decay engine, automatic memory archival, cloud-powered passive extraction (Xiaomi MiMo), session lifecycle hooks, and full cloud data deletion. 76 tests passing.

```bash
npm install -g loom-mcp
loom init "My Project"
loom session_start
```

---

## What is LOOM?

LOOM is a **semantic context operating system** for AI coding agents like Claude Code and Kimi Code. Most AI assistants lose all context when a chat session ends. LOOM solves this by persisting tasks, decisions, code artifacts, and their relationships in a structured knowledge base. Every time an agent starts a new session, LOOM injects a compact, cache-optimized prompt so the agent knows exactly where you left off.

### Architecture

```
Local (lightweight)                 Cloud (LLM-intensive)
┌──────────────┐                   ┌──────────────────┐
│ MCP Server    │  sync / extract   │ HTTP Server       │
│ Watch Daemon  │ ←─────────────→  │ LLM Extractor     │
│ CLI           │                   │ Profile Builder   │
│ (no LLM)      │                   │ (Xiaomi MiMo)     │
└──────────────┘                   └──────────────────┘
```

- **Local**: File watching, entry storage, sync, tool routing. No LLM calls, minimal resource usage.
- **Cloud**: Memory extraction from conversations, user profile aggregation, all LLM operations.

---

## Installation

### npm (recommended)

```bash
npm install -g loom-mcp
loom init "My Project"
```

### One-line install

```bash
# macOS / Linux
curl -fsSL https://raw.githubusercontent.com/Spongeacer/Loom-MCP-Server/main/install.sh | bash

# Windows
irm https://raw.githubusercontent.com/Spongeacer/Loom-MCP-Server/main/install.ps1 | iex
```

### VS Code Extension

Search for **"LOOM MCP"** in the VS Code Extension Marketplace.

### MCP Server Config

```json
{
  "mcpServers": {
    "loom": {
      "command": "node",
      "args": ["/path/to/packages/loom-mcp/dist/server.js"]
    }
  }
}
```

---

## Quick Start

```bash
# Initialize workspace
loom init "My Project"

# Start session (loads context)
loom session_start

# Work normally — LOOM watches files automatically

# End session (auto-extracts memories via cloud LLM)
loom session_end --conversation_text "Today we decided to use PostgreSQL..."

# Check memory health
loom prune status

# Manage cloud data
loom cloud register https://your-domain.com
loom cloud sync
```

---

## Core Concepts

### 7 Entry Types

| Type | Purpose |
|------|---------|
| **Task** | Active goals, progress, working sets |
| **Decision** | Architecture choices with rationale |
| **Rule** | Project conventions and constraints |
| **Memory** | General knowledge, gotchas, preferences |
| **Skill** | Reusable capabilities extracted from tasks |
| **Pattern** | Code or design patterns |
| **Artifact** | Files with filesystem metadata |

### Memory Lifecycle (v0.5.0)

Every entry has an exponential decay score that decreases over time. Accessing an entry resets its decay clock.

```
score(t) = score₀ × 2^(-elapsed / half_life)
```

| Entry Type | Half-life | Rationale |
|-----------|-----------|-----------|
| Skill | 365 days | Skills are stable once extracted |
| Rule | 180 days | Rules persist but can become outdated |
| Pattern | 180 days | Patterns are relatively stable |
| Decision | 90 days | Decisions can be superseded |
| Memory | 30 days | Memories have short relevance |
| Task | 30 days | Completed tasks decay fast |
| Artifact | 90 days | Follows file lifecycle |

**Immune entries**: Active tasks and draft entries never decay.

When an entry's decay score drops below **0.15**, it becomes eligible for archival. Archived entries are moved to `.loom/archive/` and excluded from prompt injection, but can be restored at any time.

### Session Lifecycle (v0.5.0)

```
Agent starts → loom_session_start → loads context + health check
  ↓
Work happens → decisions/rules/memories recorded
  ↓
Agent ends → loom_session_end(summary) → cloud LLM extracts memories
```

### Cloud Extraction (v0.5.0)

When a session ends, the conversation summary is sent to the LOOM cloud server, which uses an LLM (Xiaomi MiMo) to extract:
- **Decisions**: Architecture choices that were made
- **Rules**: Conventions that were established
- **Memories**: Notable facts, gotchas, insights

Extracted memories are automatically saved locally. No manual recording needed.

---

## CLI Commands

### Session Lifecycle

| Command | Purpose |
|---------|---------|
| `loom session_start` | Start session, load context |
| `loom session_end --conversation_text "..."` | End session, extract memories |
| `loom extract --conversation_text "..."` | Extract memories from text |

### Memory Management

| Command | Purpose |
|---------|---------|
| `loom prune status` | Show decay statistics |
| `loom prune apply` | Update decay scores |
| `loom prune archive` | Auto-archive stale entries |
| `loom prune list` | List archived entries |
| `loom prune restore <id>` | Restore archived entry |
| `loom prune purge <id>` | Permanently delete |

### Tasks & Knowledge

| Command | Purpose |
|---------|---------|
| `loom task create <title>` | Create task |
| `loom task set <id>` | Activate task |
| `loom decision <q> <chosen> <rationale>` | Record decision |
| `loom memory <content>` | Add memory |
| `loom rule <scope> <rule>` | Create rule |

### Filesystem

| Command | Purpose |
|---------|---------|
| `loom fs scan [dirs...]` | Scan files, update metadata |
| `loom fs health` | Show health report |
| `loom fs deps <path>` | Show dependencies |
| `loom watch [dirs...]` | Start file watcher |

### Cloud

| Command | Purpose |
|---------|---------|
| `loom cloud signup <url> <user> <pass>` | Create account |
| `loom cloud login <url> <user> <pass>` | Login |
| `loom cloud register <url>` | Register device |
| `loom cloud activate <key>` | Activate license |
| `loom cloud sync` | Sync with cloud |

---

## MCP Tools

### Session & Extraction

| Tool | Purpose |
|------|---------|
| `loom_session_start` | Start session, load context |
| `loom_session_end` | End session with auto-extraction |
| `loom_extract` | Extract memories via cloud LLM |
| `loom_extract_save` | Save extracted memories |

### Tasks & Knowledge

| Tool | Purpose |
|------|---------|
| `loom_task_create` | Create task |
| `loom_task_update` | Update task fields |
| `loom_task_set` | Activate task |
| `loom_task_list` | List tasks |
| `loom_record_decision` | Record decision |
| `loom_memory_add` | Add memory |
| `loom_rule_create` | Create rule |

### Entries & Context

| Tool | Purpose |
|------|---------|
| `loom_status` | Get current context prompt |
| `loom_expand` | Expand entry details |
| `loom_explain` | Explain entry metadata |
| `loom_why` | Explain entry relevance |

### Lifecycle & Cleanup

| Tool | Purpose |
|------|---------|
| `loom_decay_status` | Show decay statistics |
| `loom_prune` | Manage memory lifecycle |
| `loom_cloud_delete` | Delete cloud data |

### Filesystem

| Tool | Purpose |
|------|---------|
| `loom_fs_scan` | Trigger filesystem scan |
| `loom_fs_deps` | Show file dependencies |
| `loom_fs_health` | Show health report |
| `loom_watch_start` | Start watcher daemon |
| `loom_watch_stop` | Stop watcher daemon |

---

## Directory Structure

```
.loom/
├── entries/                  # 7 entry type directories
│   ├── rules/
│   ├── memories/
│   ├── skills/
│   ├── patterns/
│   ├── artifacts/
│   ├── tasks/
│   └── decisions/
├── archive/                  # Archived (decayed) entries
│   ├── rules/
│   ├── memories/
│   └── ...
├── bindings/                 # Relationship files
├── events/
│   └── wal.jsonl             # Append-only event log
├── cache/
│   ├── active-prompt.txt     # Injected into sessions
│   ├── working-set.yml
│   └── store-cache-version.txt
├── trash/                    # Soft-deleted entries
└── config.yml
```

---

## Privacy

### Local-first

All entries are stored locally as YAML files. The `.loom/` directory is the source of truth.

### Cloud sync — data minimization

When syncing to the cloud, LOOM strips:
- Filesystem paths (redacted)
- Access patterns (`last_accessed`, `activation_count`)
- Decay scores (locally computed)
- Artifact filesystem metadata

Entries with `namespace: 'local'` or `noSync: true` are never uploaded.

### Cloud deletion

Full GDPR-compliant data deletion:

```bash
# Delete specific entries
loom cloud_delete --scope entries --entry_ids '["id1","id2"]'

# Delete entire project
loom cloud_delete --scope project --project_id my-project

# Delete account and all data
loom cloud_delete --scope account
```

### LLM privacy

The cloud extraction endpoint sends only conversation text to the LLM. The LLM provider (Xiaomi MiMo) processes the text and returns structured results. No entry content, file paths, or project metadata is sent to the LLM.

---

## Development

```bash
# Build all packages (in dependency order)
npm run build:core && npm run build:cli && npm run build:mcp

# Run all tests
npm test

# Run specific package tests
npm run test -w packages/loom-core
npm run test -w packages/loom-mcp
```

### Test Coverage

76 tests across 22 suites:
- **loom-core**: 65 tests (store, WAL, prompt, dependency graph, health, bindings, trash, decay, archive)
- **loom-mcp**: 10 tests (router, server, tools)
- **loom-cli**: 6 tests (doctor, task)

---

## License

MIT
