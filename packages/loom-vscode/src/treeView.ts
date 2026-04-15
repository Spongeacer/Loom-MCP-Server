import * as vscode from 'vscode';
import { execSync } from 'child_process';
import { LoomStatus, parseStatus } from './statusParser';

export class LoomTreeItem extends vscode.TreeItem {
  constructor(
    public readonly label: string,
    public readonly collapsibleState: vscode.TreeItemCollapsibleState,
    public readonly contextValue: string,
    public readonly id?: string,
    public readonly tooltip?: string
  ) {
    super(label, collapsibleState);
    this.tooltip = tooltip || label;
    if (id) {
      this.command = {
        command: 'loom.expandEntry',
        title: 'Expand',
        arguments: [id],
      };
    }
  }
}

export class LoomTreeDataProvider implements vscode.TreeDataProvider<LoomTreeItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<LoomTreeItem | undefined | void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private cache: LoomStatus | null = null;
  private hasWorkspace = false;

  refresh(): void {
    this.cache = null;
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element: LoomTreeItem): vscode.TreeItem {
    return element;
  }

  getChildren(element?: LoomTreeItem): Thenable<LoomTreeItem[]> {
    if (!element) {
      return this.getRootItems();
    }

    if (element.contextValue === 'decisions') {
      return Promise.resolve(
        (this.cache?.decisions || []).map(
          (d) =>
            new LoomTreeItem(
              d.title,
              vscode.TreeItemCollapsibleState.None,
              'decision',
              d.id,
              d.id
            )
        )
      );
    }

    if (element.contextValue === 'risks') {
      return Promise.resolve(
        (this.cache?.risks || []).map(
          (r, i) =>
            new LoomTreeItem(
              r,
              vscode.TreeItemCollapsibleState.None,
              'risk',
              undefined,
              `Risk ${i + 1}`
            )
        )
      );
    }

    if (element.contextValue === 'fsHealth') {
      return Promise.resolve(
        (this.cache?.fsHealth || []).map(
          (h, i) =>
            new LoomTreeItem(
              h,
              vscode.TreeItemCollapsibleState.None,
              'fsHealthItem',
              undefined,
              `Health ${i + 1}`
            )
        )
      );
    }

    return Promise.resolve([]);
  }

  private async getRootItems(): Promise<LoomTreeItem[]> {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) {
      this.hasWorkspace = false;
      return [];
    }

    const rootPath = workspaceFolders[0].uri.fsPath;
    const loomPath = vscode.workspace.getConfiguration('loom').get<string>('path', 'loom');

    // Check if initialized
    const fs = await import('fs');
    this.hasWorkspace = fs.existsSync(`${rootPath}/.loom/config.yml`);

    if (!this.hasWorkspace) {
      return [
        new LoomTreeItem(
          'LOOM not initialized. Click to run loom status.',
          vscode.TreeItemCollapsibleState.None,
          'init',
          undefined,
          'Run loom status in terminal'
        ),
      ];
    }

    try {
      const stdout = execSync(`${loomPath} status`, {
        cwd: rootPath,
        encoding: 'utf-8',
        timeout: 15000,
      });
      this.cache = parseStatus(stdout);
    } catch (err) {
      console.error('[LOOM VSCode] Failed to run loom status:', err);
      this.cache = { decisions: [], risks: [], fsHealth: [] };
    }

    const items: LoomTreeItem[] = [];

    if (this.cache?.activeTask) {
      const t = this.cache.activeTask;
      items.push(
        new LoomTreeItem(
          `Task: ${t.title}`,
          vscode.TreeItemCollapsibleState.None,
          'task',
          t.id,
          t.current ? `Current: ${t.current}` : t.title
        )
      );
    }

    items.push(
      new LoomTreeItem(
        `Decisions (${this.cache?.decisions.length || 0})`,
        vscode.TreeItemCollapsibleState.Collapsed,
        'decisions'
      )
    );

    if (this.cache?.risks.length) {
      items.push(
        new LoomTreeItem(
          `Risks (${this.cache.risks.length})`,
          vscode.TreeItemCollapsibleState.Collapsed,
          'risks'
        )
      );
    }

    if (this.cache?.fsHealth.length) {
      items.push(
        new LoomTreeItem(
          `File Health (${this.cache.fsHealth.length})`,
          vscode.TreeItemCollapsibleState.Collapsed,
          'fsHealth'
        )
      );
    }

    return items;
  }
}
