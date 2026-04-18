# LOOM MCP for VS Code

Visual Studio Code extension for [LOOM](https://github.com/Spongeacer/Loom-MCP-Server) — the semantic persistent context OS for AI agents.

## Features

- **Auto-register MCP server**: On activation, the extension automatically registers `loom-mcp` in your VS Code settings so Cline / Roo Code / compatible clients can use it immediately.
- **LOOM Context sidebar**: Browse active task, decisions, risks, and file health directly in the Explorer panel.
- **One-click refresh**: Sync the sidebar with the latest `loom status` output.
- **Quick commands**:
  - `LOOM: Register MCP Server`
  - `LOOM: Run loom status`
  - `LOOM: Refresh LOOM Context`

## Requirements

- Node.js >= 18
- `loom-mcp` CLI installed globally:
  ```bash
  npm install -g loom-mcp
  ```

## Extension Settings

| Setting | Default | Description |
|---------|---------|-------------|
| `loom.autoRegisterMcp` | `true` | Automatically register `loom-mcp` in VS Code settings on activation |
| `loom.path` | `loom` | Path to the `loom` CLI executable |

## Release Notes

### 0.1.1

- Initial release with auto MCP registration and basic tree view.
