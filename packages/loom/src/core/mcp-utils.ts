import * as fs from 'node:fs';
import * as path from 'node:path';
import { execSync } from 'node:child_process';
import * as os from 'node:os';

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
  // __dirname in dist/core/mcp-utils.js -> dist/mcp.js
  const distDir = path.join(__dirname, '..');
  const mcpJs = path.join(distDir, 'mcp.js');
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
