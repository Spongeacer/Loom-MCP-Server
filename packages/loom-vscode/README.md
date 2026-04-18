# LOOM MCP for VS Code

Visual Studio Code extension for [LOOM](https://github.com/Spongeacer/Loom-MCP-Server) — the semantic persistent context OS for AI agents.

## Features

- **Auto-register MCP server**: On activation, the extension automatically registers `loom-mcp` in your VS Code settings so Cline / Roo Code / Kimi Code / compatible clients can use it immediately.
- **Bundled loom-mcp**: No need to install `loom-mcp` globally — the extension includes the MCP server out of the box.
- **LOOM Context sidebar**: Browse active task, decisions, risks, and file health directly in the Explorer panel.
- **One-click refresh**: Sync the sidebar with the latest `loom status` output.
- **Status bar indicator**: See at a glance whether LOOM is initialized and the Watch Daemon is running.
- **Quick commands**:
  - `LOOM: Register MCP Server`
  - `LOOM: Run loom status`
  - `LOOM: Refresh LOOM Context`

## Requirements

- Node.js >= 18
- VS Code >= 1.99.0 (for native MCP support)

## Extension Settings

| Setting | Default | Description |
|---------|---------|-------------|
| `loom.autoRegisterMcp` | `true` | Automatically register `loom-mcp` in VS Code settings on activation |
| `loom.path` | `loom` | Path to the `loom` CLI executable |

## Release Notes

### 0.2.5

- Bundle `loom-mcp` inside the extension — no global installation required.
- Add status bar with Watch Daemon health polling.
- Support both VS Code native `mcpServers` and Kimi Code `kimi.mcpServers`.

### 0.1.1

- Initial release with auto MCP registration and basic tree view.
