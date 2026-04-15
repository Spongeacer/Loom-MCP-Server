import * as vscode from 'vscode';
import { execSync } from 'child_process';
import { LoomTreeDataProvider } from './treeView';

export function activate(context: vscode.ExtensionContext) {
  const config = vscode.workspace.getConfiguration('loom');
  const autoRegister = config.get<boolean>('autoRegisterMcp', true);

  if (autoRegister) {
    registerMcpServer().catch(() => {});
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
    await registerMcpServer();
    vscode.window.showInformationMessage('LOOM MCP server registered in VS Code settings.');
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
    treeProvider.refresh();
  });

  // Initial refresh
  treeProvider.refresh();
}

async function registerMcpServer(): Promise<void> {
  try {
    const config = vscode.workspace.getConfiguration();
    const mcpServers = config.get<Record<string, any>>('mcpServers', {});

    const updated = {
      ...mcpServers,
      loom: {
        command: 'loom-mcp',
        args: [],
      },
    };

    await config.update('mcpServers', updated, true);
  } catch (err) {
    console.error('[LOOM VSCode] Failed to register MCP server:', err);
  }
}

export function deactivate() {}
