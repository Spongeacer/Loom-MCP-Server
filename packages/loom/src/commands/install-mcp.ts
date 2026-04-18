import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { ensureDir } from '../core/fs-utils.js';
import { getNodePath, getLoomMcpPath, getSupportedClients } from '../core/mcp-utils.js';

export function registerClient(configPath: string, loomEntry: unknown): boolean {
  try {
    const dir = path.dirname(configPath);
    if (!fs.existsSync(dir)) {
      return false; // Client not installed, skip silently
    }

    let data: Record<string, unknown> = {};
    if (fs.existsSync(configPath)) {
      data = JSON.parse(fs.readFileSync(configPath, 'utf-8')) as Record<string, unknown>;
    }
    const mcpServers = (data.mcpServers as Record<string, unknown>) || {};
    mcpServers.loom = loomEntry;
    data.mcpServers = mcpServers;
    ensureDir(dir);
    fs.writeFileSync(configPath, JSON.stringify(data, null, 2) + '\n');
    return true;
  } catch (err) {
    console.error(`  ✗ Failed to update ${configPath}:`, err);
    return false;
  }
}

export function registerKimiCodeExtension(loomEntry: unknown): boolean {
  try {
    // VS Code settings.json
    const home = os.homedir();
    let settingsPath: string;
    if (process.platform === 'darwin') {
      settingsPath = path.join(home, 'Library', 'Application Support', 'Code', 'User', 'settings.json');
    } else if (process.platform === 'win32') {
      settingsPath = path.join(process.env.APPDATA || '', 'Code', 'User', 'settings.json');
    } else {
      settingsPath = path.join(home, '.config', 'Code', 'User', 'settings.json');
    }

    if (!fs.existsSync(settingsPath)) {
      return false;
    }

    const raw = fs.readFileSync(settingsPath, 'utf-8');
    const data = JSON.parse(raw) as Record<string, unknown>;
    const kimiMcpServers = ((data['kimi.mcpServers'] as Record<string, unknown>) || {});
    kimiMcpServers.loom = loomEntry;
    data['kimi.mcpServers'] = kimiMcpServers;
    fs.writeFileSync(settingsPath, JSON.stringify(data, null, 2) + '\n');
    return true;
  } catch (err) {
    console.error('  ✗ Failed to update VS Code settings for Kimi Code Extension:', err);
    return false;
  }
}

export function runInstallMcp(): string {
  const nodePath = getNodePath();
  let loomMcpPath: string;
  try {
    loomMcpPath = getLoomMcpPath();
  } catch (err) {
    return `Error: ${err}\nPlease ensure loom-mcp is properly installed.`;
  }

  const loomEntry = { command: nodePath, args: [loomMcpPath] };
  const clients = getSupportedClients();
  const registered: string[] = [];
  const skipped: string[] = [];

  for (const client of clients) {
    if (registerClient(client.path, loomEntry)) {
      registered.push(client.name);
    } else {
      skipped.push(client.name);
    }
  }

  if (registerKimiCodeExtension(loomEntry)) {
    registered.push('Kimi Code Extension (VS Code)');
  } else {
    skipped.push('Kimi Code Extension (VS Code)');
  }

  let output = 'LOOM MCP Auto-Configuration\n\n';
  if (registered.length) {
    output += `✓ Registered for:\n${registered.map((n) => `  - ${n}`).join('\n')}\n`;
  }
  if (skipped.length) {
    output += `\n○ Skipped (not installed or not found):\n${skipped.map((n) => `  - ${n}`).join('\n')}\n`;
  }

  output += `\nNode: ${nodePath}\nMCP:  ${loomMcpPath}\n`;
  output += `\nNote: Please reload/restart your MCP clients to apply changes.\n`;
  output += `For Kimi Code Extension in VS Code, run: Developer: Reload Window\n`;

  return output;
}
