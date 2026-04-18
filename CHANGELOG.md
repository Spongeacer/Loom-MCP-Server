# Changelog

All notable changes to this project will be documented in this file.

## [0.3.0] - 2026-04-18

### Core (`loom-mcp`)

- **Optimistic Concurrency Control (CAS)**: `saveEntry()` now supports `expectedVersion` parameter. If another agent modified the entry since you read it, the write is rejected with a clear conflict message.
- **Auto-incrementing Versions**: Every saved entry automatically gets `version += 1` and `lifecycle.updated` refreshed.
- **Transaction IDs**: Each MCP tool invocation receives a unique `txId`. All WAL events within the same request share this `tx_id`, making multi-step operations traceable.
- **Agent Identity**: WAL events now include `agent_id` (from `LOOM_AGENT_ID` env var, defaults to `unknown`). Know *who* did *what*.
- **Transaction Protection**: `loom_task_update` is now wrapped in `withStoreTransactionAsync` with CAS, preventing lost updates during concurrent edits.

### VS Code Extension (`loom-mcp-vscode`)

- **Bundled loom-mcp**: The extension now ships with `loom-mcp` built-in. No global `npm install -g` required — install the extension and it just works.
- **Status Bar Indicator**: Real-time display of LOOM initialization state and Watch Daemon health (PID, memory usage).
- **Watch Daemon Polling**: Auto-refreshes every 5 seconds to detect if the daemon goes down.
- **Unified MCP Registration**: Automatically registers LOOM in both VS Code native `mcpServers` and Kimi Code `kimi.mcpServers` settings.
- **Priority Path Resolution**: The extension first looks for its bundled `loom-mcp`, then falls back to global installation.

---

## [0.2.5] - 2026-04-18

- Fix out-of-the-box installation issues
- Fix diagnostic false-positives in `loom doctor`

## [0.2.4] - 2026-04-17

- Fix MCP zombie processes on stdin end — graceful `SIGTERM/SIGINT` handling

## [0.2.3] - 2026-04-16

- Update Homebrew formula for v0.2.2

## [0.2.2] - 2026-04-16

- Critical agent integration fixes: `task update`, `init via MCP`, `fs clean`, atomic writes
- `loom doctor --fix`: Auto-detect and repair MCP path drift
- Zero-config MCP setup: Run `loom install-mcp` to auto-register in supported clients

## [0.2.0] - 2026-04-15

### Architecture Upgrade

- **Store Transaction Layer**: `withStoreTransaction` / `withStoreTransactionAsync` for atomic multi-step writes
- **Pure Commands**: All `commands/` refactored to pure functions, fully decoupling CLI from MCP runtime
- **MCP Hardening**: Fix `withLock` leak, async lock collapse, path traversal; add graceful shutdown and WAL drain

### Cleanup

- Remove dead code: `captureStdout`, sync `appendWal` wrapper, Git-based lazy detection
- Remove unused cache files: `manifest.yml`, `hot-entries.yml`, `binding-graph.json`, `intent-map.yml`
- Move `ToolResult` to `types/index.ts` to break circular dependency

### New Features

- Daily diary generation (`loom diary` / `loom_diary_generate`)
- Full unit test coverage: 29 suites, 107 tests
- ESLint configuration
- VS Code extension skeleton

## [0.1.1] - 2026-04-14

- Initial stable release
- Core features: WAL, entries, cache, L1.5 summaries, Task/Decision, slot-based prompt
