import * as vscode from 'vscode';
import { execSync } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import { LoomTreeDataProvider } from './treeView';

export function activate(context: vscode.ExtensionContext) {
  const config = vscode.workspace.getConfiguration('loom');
  const autoRegister = config.get<boolean>('autoRegisterMcp', true);

  if (autoRegister) {
    registerMcpServer().catch(() => {});
  }

  // Set context for view visibility based on LOOM initialization
  const workspaceFolders = vscode.workspace.workspaceFolders;
  if (workspaceFolders && workspaceFolders.length > 0) {
    const rootPath = workspaceFolders[0].uri.fsPath;
    const hasLoom = fs.existsSync(`${rootPath}/.loom/config.yml`);
    vscode.commands.executeCommand('setContext', 'loom.workspaceInitialized', hasLoom);
  } else {
    vscode.commands.executeCommand('setContext', 'loom.workspaceInitialized', false);
  }

  const treeProvider = new LoomTreeDataProvider();
  const treeView = vscode.window.createTreeView('loomContext', {
    treeDataProvider: treeProvider,
    showCollapseAll: true,
  });

  context.subscriptions.push(treeView);

  const refreshCmd = vscode.commands.registerCommand('loom.refresh', () => {
    treeProvider.refresh();
  });

  const registerCmd = vscode.commands.registerCommand('loom.registerMcp', async () => {
    const registered = await registerMcpServer();
    if (registered.length > 0) {
      vscode.window.showInformationMessage(`LOOM MCP registered for: ${registered.join(', ')}. Please reload the window.`);
    } else {
      vscode.window.showWarningMessage('LOOM MCP could not be registered. Ensure loom-mcp is installed.');
    }
  });

  const statusCmd = vscode.commands.registerCommand('loom.runStatus', async () => {
    const terminal = vscode.window.createTerminal('LOOM');
    terminal.sendText('loom status');
    terminal.show();
  });

  const expandCmd = vscode.commands.registerCommand('loom.expandEntry', async (id: string) => {
    const terminal = vscode.window.createTerminal('LOOM');
    terminal.sendText(`loom expand ${id}`);
    terminal.show();
  });

  context.subscriptions.push(refreshCmd, registerCmd, statusCmd, expandCmd);

  // Auto-refresh when workspace folders change
  vscode.workspace.onDidChangeWorkspaceFolders(() => {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (workspaceFolders && workspaceFolders.length > 0) {
      const rootPath = workspaceFolders[0].uri.fsPath;
      const hasLoom = fs.existsSync(`${rootPath}/.loom/config.yml`);
      vscode.commands.executeCommand('setContext', 'loom.workspaceInitialized', hasLoom);
    } else {
      vscode.commands.executeCommand('setContext', 'loom.workspaceInitialized', false);
    }
    treeProvider.refresh();
  });

  // Initial refresh
  treeProvider.refresh();
}

function resolveMcpEntry(): { command: string; args: string[] } | undefined {
  // 1. Resolve node absolute path
  let nodePath: string | undefined;
  try {
    const isWin = process.platform === 'win32';
    const cmd = isWin ? 'where.exe node' : 'which node';
    nodePath = execSync(cmd, { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'ignore'] })
      .trim()
      .split('\n')[0];
  } catch {
    nodePath = process.execPath;
  }

  // 2. Resolve mcp.js absolute path
  let mcpJsPath: string | undefined;
  let loomMcpBin: string | undefined;

  try {
    const isWin = process.platform === 'win32';
    const cmd = isWin ? 'where.exe loom-mcp' : 'which loom-mcp';
    loomMcpBin = execSync(cmd, { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'ignore'] })
      .trim()
      .split('\n')[0];
  } catch {
    loomMcpBin = undefined;
  }

  if (loomMcpBin) {
    // Try to read wrapper script to extract actual mcp.js path
    try {
      const content = fs.readFileSync(loomMcpBin, 'utf-8');
      const match = content.match(/node\s+["']?([^"'\n\r]+mcp\.js[^"'\n\r]*)["']?/);
      if (match) {
        const scriptDir = path.dirname(loomMcpBin);
        let referenced = match[1]
          .replace(/\$SCRIPT_DIR/g, scriptDir)
          .replace(/%~dp0/g, scriptDir + path.sep);
        if (!path.isAbsolute(referenced)) {
          referenced = path.join(scriptDir, referenced);
        }
        if (fs.existsSync(referenced)) {
          mcpJsPath = referenced;
        }
      }
    } catch {}

    // If wrapper didn't reveal path, try common global npm layout
    if (!mcpJsPath) {
      const binDir = path.dirname(loomMcpBin);
      const candidates = [
        path.join(binDir, '..', 'lib', 'node_modules', 'loom-mcp', 'dist', 'mcp.js'),
        path.join(binDir, '..', 'node_modules', 'loom-mcp', 'dist', 'mcp.js'),
      ];
      for (const c of candidates) {
        if (fs.existsSync(c)) {
          mcpJsPath = c;
          break;
        }
      }
    }
  }

  // 3. Fallback: if extension is running inside the loom repo
  if (!mcpJsPath) {
    const extDir = path.dirname(__dirname);
    const localCandidate = path.join(extDir, '..', '..', 'packages', 'loom-mcp', 'dist', 'server.js');
    if (fs.existsSync(localCandidate)) {
      mcpJsPath = localCandidate;
    }
  }

  if (nodePath && mcpJsPath) {
    return { command: nodePath, args: [mcpJsPath] };
  }

  // 4. Last resort: use loom-mcp wrapper directly
  if (loomMcpBin) {
    return { command: loomMcpBin, args: [] };
  }

  return undefined;
}

async function registerMcpServer(): Promise<string[]> {
  const entry = resolveMcpEntry();
  if (!entry) {
    console.error('[LOOM VSCode] loom-mcp not found in PATH.');
    return [];
  }

  const registered: string[] = [];

  // Register to generic VS Code MCP (e.g., GitHub Copilot, other clients)
  try {
    const config = vscode.workspace.getConfiguration();
    const mcpServers = config.get<Record<string, any>>('mcpServers', {});
    if (!mcpServers.loom) {
      await config.update('mcpServers', { ...mcpServers, loom: entry }, true);
      registered.push('VS Code (mcpServers)');
    } else {
      registered.push('VS Code (mcpServers) [already registered]');
    }
  } catch (err) {
    console.error('[LOOM VSCode] Failed to register generic MCP server:', err);
  }

  // Register to Kimi Code Extension (kimi.mcpServers)
  try {
    const kimiConfig = vscode.workspace.getConfiguration('kimi');
    const kimiMcpServers = kimiConfig.get<Record<string, any>>('mcpServers', {});
    if (!kimiMcpServers.loom) {
      await kimiConfig.update('mcpServers', { ...kimiMcpServers, loom: entry }, true);
      registered.push('Kimi Code Extension');
    } else {
      registered.push('Kimi Code Extension [already registered]');
    }
  } catch (err) {
    console.error('[LOOM VSCode] Failed to register Kimi MCP server:', err);
  }

  return registered;
}

export function deactivate() {}
