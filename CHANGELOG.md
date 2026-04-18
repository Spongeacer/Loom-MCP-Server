# Changelog

All notable changes to this project will be documented in this file.

## [0.3.0] - 2026-04-18

### Monorepo Architecture Refactor

The entire codebase has been restructured from a single package (`packages/loom/`) into a proper npm workspace monorepo with 5 focused packages:

- **`@loom/core`** — Types, StoreAdapter (FS + Memory), WAL queue, dependency graph, health analyzer, prompt builder, file tracking, watch daemon, session recall, skill extraction, diary generator
- **`@loom/cli`** — Command-line interface (human-facing text formatting)
- **`@loom/mcp`** — MCP Server with 15+ tools via stdio JSON-RPC
- **`@loom/cloud`** — Cloud sync, Ed25519 device identity, license validation, conflict resolution
- **`loom-vscode`** — VS Code extension

### Business Logic Layering

All command business logic has been下沉 (sunk) into `@loom/core/src/commands/`:
- `runDoctor()` — Self-diagnostic checks returning structured `DoctorReport`
- `runSession()` — Session recall (summary / recent WAL events)
- `runSkillList()` / `runSkillExtract()` — Skill management
- `runDiary()` — Daily diary generation
- `runFsHealth()` / `runFsDeps()` / `runFsTrash()` / `runFsClean()` — File system operations

Both `@loom/cli` and `@loom/mcp` now consume these shared functions. CLI handles argv parsing + human-readable text formatting. MCP wraps results in `ToolResult` JSON.

### Build & Quality

- Full ESM (`"type": "module"`) with TypeScript `Node16` module resolution
- `exports` field in `@loom/core` package.json with `types` conditions for proper cross-package type resolution
- 52 tests, 0 failures across 15 suites (`@loom/core`: 35, `@loom/cli`: 6, `@loom/cloud`: 11)

### Security Fix

- Removed fake Ed25519 fallback (deterministic SHA-512 seed). Zero fallback — crypto failure now throws.
- Fixed `createPrivateKey` PEM handling for Ed25519 keys in ESM context.

### Breaking Changes

- `loom install-mcp` command removed. MCP registration is now manual or handled by the VS Code extension.
- Package name changed from `loom-mcp` (npm global) to `@loom/cli` / `@loom/mcp` (workspace packages).
- Old `packages/loom/`, `packages/loom-cloud/` (v0.2.x), and `src/` directories removed. Archive tagged `v0.2.x-dead`.

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
