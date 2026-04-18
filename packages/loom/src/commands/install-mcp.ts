import * as fs from 'node:fs';
import * as path from 'node:path';
import { execSync } from 'node:child_process';
import * as os from 'node:os';
import { ensureDir } from '../core/store.js';

export function getNodePath(): string {
  try {
    return execSync(process.platform === 'win32' ? 'where.exe node' : 'which node', {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'ignore'],
    })
      .trim()
      .split('\n')[0];
  } catch {
    return process.execPath;
  }
}

export function getLoomMcpPath(): string {
  // If running from global npm or local repo, derive from current module location
  // __dirname in dist/commands/install-mcp.js -> dist/mcp.js
  const distDir = __dirname;
  const mcpJs = path.join(distDir, '..', 'mcp.js');
  if (fs.existsSync(mcpJs)) {
    return mcpJs;
  }
  // Fallback to installed bin — resolve dist/mcp.js rather than shell wrapper
  try {
    const binPath = execSync(process.platform === 'win32' ? 'where.exe loom-mcp' : 'which loom-mcp', {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'ignore'],
    })
      .trim()
      .split('\n')[0];

    // Derive dist/mcp.js from the bin location (bin/loom-mcp -> ../dist/mcp.js)
    const derived = path.join(path.dirname(binPath), '..', 'dist', 'mcp.js');
    if (fs.existsSync(derived)) {
      return derived;
    }

    // Try via npm root -g
    try {
      const npmRoot = execSync('npm root -g', { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'ignore'] }).trim();
      const fromNpmRoot = path.join(npmRoot, 'loom-mcp', 'dist', 'mcp.js');
      if (fs.existsSync(fromNpmRoot)) {
        return fromNpmRoot;
      }
    } catch {
      // ignore
    }

    // Last resort: return the bin path itself (node can execute shebang scripts on Unix)
    return binPath;
  } catch {
    throw new Error('Could not find loom-mcp entry point.');
  }
}

export interface ClientConfig {
  name: string;
  path: string;
}

export function getSupportedClients(): ClientConfig[] {
  const home = os.homedir();
  const clients: ClientConfig[] = [
    { name: 'Kimi Code CLI', path: path.join(home, '.kimi', 'mcp.json') },
  ];

  if (process.platform === 'darwin') {
    clients.push({
      name: 'Claude Desktop',
      path: path.join(home, 'Library', 'Application Support', 'Claude', 'claude_desktop_config.json'),
    });
  } else if (process.platform === 'linux') {
    clients.push({
      name: 'Claude Desktop',
      path: path.join(home, '.config', 'claude', 'claude_desktop_config.json'),
    });
  } else if (process.platform === 'win32') {
    clients.push({
      name: 'Claude Desktop',
      path: path.join(process.env.APPDATA || '', 'Claude', 'claude_desktop_config.json'),
    });
  }

  clients.push(
    { name: 'Cursor', path: path.join(home, '.cursor', 'mcp.json') },
    { name: 'Cline', path: path.join(home, '.cline', 'data', 'settings', 'cline_mcp_settings.json') }
  );

  if (process.platform === 'win32') {
    clients.push({
      name: 'Windsurf',
      path: path.join(process.env.USERPROFILE || '', '.codeium', 'windsurf', 'mcp_config.json'),
    });
  } else {
    clients.push({
      name: 'Windsurf',
      path: path.join(home, '.codeium', 'windsurf', 'mcp_config.json'),
    });
  }

  return clients;
}

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
