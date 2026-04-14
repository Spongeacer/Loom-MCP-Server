# LOOM

**Persistent context layer for AI agents.**

**Languages**: [中文](README.md) | **English** | [한국어](README_KO.md) | [Español](README_ES.md)

---

## What is LOOM?

LOOM is a **semantic context operating system** for AI coding agents like Claude Code and Kimi Code. Most AI assistants lose all context when a chat session ends. LOOM solves this by persisting tasks, decisions, code artifacts, and their relationships in a structured, local knowledge base. Every time an agent starts a new session, LOOM injects a compact, cache-optimized prompt so the agent knows exactly where you left off.

It doesn't just store memories—it understands your project's files. LOOM tracks file freshness, builds import dependency graphs, and automatically flags stale, orphaned, or redundant code.

---

## Why LOOM?

### The Problem: Session Amnesia

When you close a chat with an AI coding assistant, everything is gone:
- The active task and its progress
- Architecture decisions you just agreed on
- Which files you were working on
- Why certain files were relevant

Next time, you have to re-explain. This is fine for one-off questions, but exhausting for multi-day refactoring or complex feature work.

### The LOOM Solution

LOOM persists four critical things across sessions:

1. **Tasks & Progress** — What you're doing, what's done, what's blocked, and what's next.
2. **Decisions** — Architecture choices that should never be questioned again unless assumptions change.
3. **Working Set** — The files and rules currently relevant to the active task.
4. **File System Health** — Which files are fresh, which are stale, which are orphans, and what depends on what.

When an agent starts, LOOM automatically generates a structured prompt containing all of this. The agent doesn't guess—it knows.

---

## Quick Start

```bash
# 1. Initialize LOOM in your project
./loom init "My Project"

# 2. Check the current context (also auto-runs filesystem scan if stale)
./loom status

# 3. Create and activate a task
./loom task create "Refactor auth middleware"
./loom task set task-auth-refactor

# 4. Start watching files for changes
./loom watch src tests

# 5. Inspect file health and dependencies
./loom fs health
./loom fs deps src/auth/middleware.ts
```

### Installing the MCP Server

For Kimi Code (or any MCP-compatible client):

```bash
kimi mcp add --transport stdio loom -- node "/path/to/your/project/packages/loom/dist/mcp.js"
```

This exposes 15 tools including `loom_status`, `loom_expand`, `loom_fs_scan`, and `loom_record_decision`.

---

## Core Concepts

### Entries: The Atoms of Context

Everything in LOOM is an **Entry**. There are 7 types:

| Type | Purpose |
|------|---------|
| **Rule** | Hard constraints (e.g. "All JWT auth must go through middleware") |
| **Pattern** | Reusable code or design patterns |
| **Memory** | General project knowledge |
| **Skill** | Reusable capability descriptions |
| **Artifact** | Files, code, configs—with filesystem metadata |
| **Task** | Active goals, progress, and working sets |
| **Decision** | Recorded architecture choices |

Every Entry shares the same base schema:

```yaml
id: string
type: Rule | Memory | Skill | Pattern | Artifact | Task | Decision
version: number
namespace: project | user | auto | team | local

content:
  l1_5: string           # Micro-summary, ~20 chars
  l2: string             # One-line summary, ~100 chars
  l3: string | file:path # Full content or file reference

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
  paths: string[]        # File paths that activate this entry
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

### Bindings: The Connective Tissue

A **Binding** is a persistent, typed relationship between two Entries. Unlike simple tags, Bindings carry confidence scores, evidence, decay models, and invalidation tracking.

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

This means you can ask `loom why art-auth-middleware` and get a precise causal chain: *"It's in the current task's working set, governed by rule-auth-style, and actively being edited."*

### Artifact: Files with Intelligence

Artifacts in LOOM are not just file paths. They understand the file system:

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

  # Filesystem awareness
  fs:
    last_modified_at: ISO timestamp
    last_seen_at: ISO timestamp
    size_bytes: number
    exists: boolean

  deps:
    imports: string[]       # Files this artifact imports
    imported_by: string[]   # Files that import this artifact

  health:
    status: healthy | stale | orphan | legacy | redundant | missing
    score: 0..1
    reasons: string[]
    suggested_action: keep | archive | delete | review
```

---

## Slot-Based Prompt Orchestration

LOOM doesn't dump text into the context window. It generates a structured XML prompt with slots arranged by stability to maximize LLM KV-cache hits.

```xml
<loom_context>
  <protocol>
    You have a persistent semantic memory system.
    If a ↣id might be important but you are unsure, call loom_expand(id, level).
    Before modifying an artifact, check governance / risks / decisions.
    If you reach a stable conclusion, propose creating a Task / Decision / Rule / Memory.
  </protocol>

  <governance>
    ↣rule-auth-style: JWT+RBAC auth must go through middleware
  </governance>

  <decisions>
    ↣decision-rbac-over-abac: Choose RBAC, not ABAC
  </decisions>

  <dictionary>
    ↣pattern-error-envelope: Unified error return structure
    ↣task-auth-refactor: Refactor auth middleware and keep tests passing
  </dictionary>

  <task id="task-auth-refactor" status="active">
    Goal: Refactor auth middleware and keep tests passing
    Current: Fix RBAC permission logic in middleware
    Open: Whether to keep old session fallback
  </task>

  <working_set>
    ↣art-auth-middleware: src/auth/middleware.ts
    ↣art-auth-test: src/auth/middleware.test.ts
  </working_set>

  <risks>
    ↣art-auth-test: Summary not yet verified after user edit
  </risks>

  <recovery>
    Last checkpoint: Completed middleware主体重构, next step fix test fixtures
  </recovery>

  <recent_files>
    ↣art-auth-test: src/auth/middleware.test.ts (modified 2026/4/14)
  </recent_files>

  <fs_health>
    ↣art-legacy-adapter: src/auth/legacy_adapter.ts is legacy (action: review)
  </fs_health>
</loom_context>
```

### Why This Order?

The slots are ordered from **most stable** to **most volatile**:

1. **Static layer** (`protocol` → `governance` → `decisions` → `dictionary`): Changes very slowly. Placed first so the LLM can cache it across sessions.
2. **Dynamic layer** (`task` → `working_set` → `risks` → `recovery` → `recent_files` → `fs_health`): Changes every session. Placed last so changes don't invalidate the cached prefix.

All list slots are internally sorted by `id` to prevent order jitter from breaking cache hits.

### Budget Awareness

| Slot | Approx. Tokens |
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
| expanded (on demand) | ~3000 |

Fixed slots target 1500-2100 tokens. Total injected context should stay under 8-15% of the model's context window.

---

## Filesystem Awareness

LOOM understands your project's files not just as text, but as a living system.

### Core Capabilities

| Capability | Description | Trigger |
|------------|-------------|---------|
| **Freshness Tracking** | Tracks `mtime`, `size_bytes`, and `exists` for every artifact | Auto / `loom fs scan` |
| **Dependency Graph** | Parses imports across JS/TS/Python/Go/Rust/Java/etc. | Auto / `loom fs deps <path>` |
| **Health Analysis** | Detects stale, orphan, legacy, redundant, and missing files | Auto / `loom fs health` |
| **Trash & Clean** | Suggests and executes archiving to `.loom/trash/` or deletion | `loom fs trash` / `loom fs clean` |

### Auto-Trigger Behavior

You don't need to remember to run scans:

1. **On `loom status`** — If more than 5 minutes have passed since the last scan, LOOM automatically runs a lightweight filesystem scan (metadata + dependency graph + health analysis) before generating the prompt.
2. **On Watch Daemon flush** — After the daemon processes a batch of file changes, it auto-triggers an incremental scan.

### Health Statuses

| Status | Condition | Suggested Action |
|--------|-----------|------------------|
| `healthy` | Normal, active file | keep |
| `stale` | Not modified in >90 days | review |
| `orphan` | No bindings or references | review |
| `legacy` | Filename contains old/backup/deprecated/etc. | review |
| `redundant` | Identical content hash to another file | archive |
| `missing` | No longer exists on disk | delete |

---

## Three Execution Layers

LOOM is designed with cost consciousness at its core.

### Layer 1: Pre-computation (Zero LLM Cost)

Runs before the session starts:
- Load all entries, bindings, and WAL
- Rebuild manifest cache, hot entries, working set cache
- Restore active task
- Run filesystem scan and health analysis
- Compute risks and stale/dirty markers

**Target:** <100ms for small-to-medium projects.

### Layer 2: Hooks (Very Low Cost)

Runs synchronously after file writes/edits:
- Register new Artifacts
- Create low-cost immediate bindings (path match, keyword match)
- Mark summaries as stale
- Append to WAL
- Trigger dirty-set updates

**Target:** <50ms per hook.

### Layer 3: LLM Protocol (Token Cost, but Controlled)

The LLM decides:
- Whether to expand L2/L3 details
- What the next action should be
- When to record a Decision
- When to propose a new Rule/Memory/Pattern
- Whether a risk needs verification

The LLM is constrained by the system prompt and uses tools like `loom_expand`, `loom_record_decision`, and `loom_verify` to interact.

---

## CLI & MCP Tools

### Shell CLI

| Command | Purpose |
|---------|---------|
| `./loom init <name>` | Initialize `.loom/` workspace |
| `./loom status` | Show slot-based prompt context |
| `./loom expand <id> [l2\|l3]` | Expand an entry |
| `./loom explain <id>` | Show metadata and bindings |
| `./loom why <id>` | Explain relevance to current context |
| `./loom task` | List tasks |
| `./loom task set <id>` | Activate task |
| `./loom task create <title>` | Create new task |
| `./loom watch [dirs...]` | Start file watcher daemon |
| `./loom watch stop` | Stop watcher |
| `./loom fs scan [dirs...]` | Scan files, update metadata, rebuild deps |
| `./loom fs deps <path>` | Show imports and imported-by |
| `./loom fs health` | Show health report |
| `./loom fs trash` | List trash candidates |
| `./loom fs clean` | Archive/delete unhealthy files |

### MCP Tools

| Tool | Purpose |
|------|---------|
| `loom_status` | Get current context prompt |
| `loom_read_prompt` | Read cached prompt directly |
| `loom_expand` | Expand entry details |
| `loom_explain` | Explain entry metadata |
| `loom_why` | Explain entry relevance |
| `loom_task_set` | Switch active task |
| `loom_task_create` | Create new task |
| `loom_record_decision` | Record architecture decision |
| `loom_watch_start` | Start watcher daemon |
| `loom_watch_stop` | Stop watcher daemon |
| `loom_watch_status` | Check watcher status |
| `loom_fs_scan` | Trigger filesystem scan |
| `loom_fs_deps` | Show file dependencies |
| `loom_fs_health` | Show health report |
| `loom_fs_trash` | Show cleanup candidates |

---

## Directory Structure

```
.loom/                         # Source of truth
├── entries/
│   ├── rules/
│   ├── memories/
│   ├── skills/
│   ├── patterns/
│   ├── artifacts/
│   ├── tasks/
│   └── decisions/
├── bindings/                  # *.yml relationship files
├── events/
│   └── wal.jsonl              # Append-only event log
├── cache/
│   ├── active-prompt.txt      # Injected into agent sessions
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

**Important:** `.loom/` is the source of truth. Cache files can be rebuilt from entries + bindings + WAL.

---

## Design Principles

```yaml
P1_llm_is_the_engine:
  statement: "The LLM is the center of understanding and decision-making."
  implication: "External systems only provide data and light automation."

P2_cost_aware:
  statement: "Every capability must be aware of time and token cost."
  implication: "Prefer path matching over AST, AST over model inference."

P3_truth_is_distributed:
  statement: "Entries + Bindings + Event Log are the source of truth."
  implication: "Manifests and caches are derived and can be rebuilt."

P4_trust_is_earned:
  statement: "Memory is not fact. All entries and bindings must earn trust."
  implication: "Inferred, old, and external content must be downranked and invalidate-able."

P5_task_over_reference:
  statement: "Context is organized around the current task, not general similarity."
  implication: "Task / Working Set / Decision matter more than pure semantic matching."

P6_structured_context_over_text_dump:
  statement: "Inject responsibility-based context, not text dumps."
  implication: "Use slot-based orchestration, not flat L1/L2/L3 concatenation."
```

---

## Roadmap

### Phase 1: Skeleton
- WAL + entries + cache
- L1.5 micro-summaries
- Task / Decision
- Slot-based prompt
- `loom_expand`

### Phase 2: Task Continuity & Governance
- Working set cache
- Level 0 instant bindings
- Risks slot
- `loom status`, `loom explain`, `loom why`

### Phase 3: Decay & Verification
- Decay engine
- Verifier layer
- Binding invalidation
- `loom audit`, `loom verify`

### Phase 4: High-Precision Enhancement
- AST / LSP integration
- Symbol/span artifacts
- Embedding retrieval
- Co-evolution analysis

---

## License

MIT
