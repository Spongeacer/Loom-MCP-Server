import * as vscode from 'vscode';
import { execSync } from 'child_process';

interface LoomStatus {
  activeTask?: { id: string; title: string; current?: string };
  decisions: { id: string; title: string }[];
  risks: string[];
  fsHealth: string[];
  workingSet: { pinned: string[]; hot: string[] };
  artifacts: { id: string; path: string; status: string }[];
  skills: { id: string; title: string }[];
  memories: { id: string; title: string }[];
  bindings: { source: string; target: string; rel: string }[];
}

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

    if (element.contextValue === 'workingSet') {
      const items: LoomTreeItem[] = [];
      for (const id of this.cache?.workingSet.pinned || []) {
        items.push(
          new LoomTreeItem(
            `📌 ${id}`,
            vscode.TreeItemCollapsibleState.None,
            'pinned',
            id,
            `Pinned: ${id}`
          )
        );
      }
      for (const id of this.cache?.workingSet.hot || []) {
        items.push(
          new LoomTreeItem(
            `🔥 ${id}`,
            vscode.TreeItemCollapsibleState.None,
            'hot',
            id,
            `Hot: ${id}`
          )
        );
      }
      return Promise.resolve(items);
    }

    if (element.contextValue === 'artifacts') {
      return Promise.resolve(
        (this.cache?.artifacts || []).map((a) =>
          new LoomTreeItem(
            `${a.path} (${a.status})`,
            vscode.TreeItemCollapsibleState.None,
            'artifact',
            a.id,
            `${a.path}: ${a.status}`
          )
        )
      );
    }

    if (element.contextValue === 'skills') {
      return Promise.resolve(
        (this.cache?.skills || []).map((s) =>
          new LoomTreeItem(
            s.title,
            vscode.TreeItemCollapsibleState.None,
            'skill',
            s.id,
            s.id
          )
        )
      );
    }

    if (element.contextValue === 'memories') {
      return Promise.resolve(
        (this.cache?.memories || []).map((m) =>
          new LoomTreeItem(
            m.title,
            vscode.TreeItemCollapsibleState.None,
            'memory',
            m.id,
            m.id
          )
        )
      );
    }

    if (element.contextValue === 'bindings') {
      return Promise.resolve(
        (this.cache?.bindings || []).map((b) =>
          new LoomTreeItem(
            `${b.source} → ${b.target} (${b.rel})`,
            vscode.TreeItemCollapsibleState.None,
            'binding',
            undefined,
            `${b.source} ${b.rel} ${b.target}`
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
      const stdout = execSync(`${loomPath} status --json`, {
        cwd: rootPath,
        encoding: 'utf-8',
        timeout: 15000,
      });
      this.cache = JSON.parse(stdout) as LoomStatus;
    } catch (err) {
      console.error('[LOOM VSCode] Failed to run loom status:', err);
      this.cache = {
        decisions: [],
        risks: [],
        fsHealth: [],
        workingSet: { pinned: [], hot: [] },
        artifacts: [],
        skills: [],
        memories: [],
        bindings: [],
      };
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

    const wsPinned = this.cache?.workingSet.pinned.length || 0;
    const wsHot = this.cache?.workingSet.hot.length || 0;
    if (wsPinned > 0 || wsHot > 0) {
      items.push(
        new LoomTreeItem(
          `Working Set (${wsPinned} pinned, ${wsHot} hot)`,
          vscode.TreeItemCollapsibleState.Collapsed,
          'workingSet'
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

    if (this.cache?.artifacts.length) {
      items.push(
        new LoomTreeItem(
          `Artifacts (${this.cache.artifacts.length})`,
          vscode.TreeItemCollapsibleState.Collapsed,
          'artifacts'
        )
      );
    }

    if (this.cache?.skills.length) {
      items.push(
        new LoomTreeItem(
          `Skills (${this.cache.skills.length})`,
          vscode.TreeItemCollapsibleState.Collapsed,
          'skills'
        )
      );
    }

    if (this.cache?.memories.length) {
      items.push(
        new LoomTreeItem(
          `Memories (${this.cache.memories.length})`,
          vscode.TreeItemCollapsibleState.Collapsed,
          'memories'
        )
      );
    }

    if (this.cache?.bindings.length) {
      items.push(
        new LoomTreeItem(
          `Bindings (${this.cache.bindings.length})`,
          vscode.TreeItemCollapsibleState.Collapsed,
          'bindings'
        )
      );
    }

    return items;
  }
}
