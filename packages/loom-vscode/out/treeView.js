"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.LoomTreeDataProvider = exports.LoomTreeItem = void 0;
const vscode = __importStar(require("vscode"));
const child_process_1 = require("child_process");
const statusParser_1 = require("./statusParser");
class LoomTreeItem extends vscode.TreeItem {
    constructor(label, collapsibleState, contextValue, id, tooltip) {
        super(label, collapsibleState);
        this.label = label;
        this.collapsibleState = collapsibleState;
        this.contextValue = contextValue;
        this.id = id;
        this.tooltip = tooltip;
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
exports.LoomTreeItem = LoomTreeItem;
class LoomTreeDataProvider {
    constructor() {
        this._onDidChangeTreeData = new vscode.EventEmitter();
        this.onDidChangeTreeData = this._onDidChangeTreeData.event;
        this.cache = null;
        this.hasWorkspace = false;
    }
    refresh() {
        this.cache = null;
        this._onDidChangeTreeData.fire();
    }
    getTreeItem(element) {
        return element;
    }
    getChildren(element) {
        if (!element) {
            return this.getRootItems();
        }
        if (element.contextValue === 'decisions') {
            return Promise.resolve((this.cache?.decisions || []).map((d) => new LoomTreeItem(d.title, vscode.TreeItemCollapsibleState.None, 'decision', d.id, d.id)));
        }
        if (element.contextValue === 'risks') {
            return Promise.resolve((this.cache?.risks || []).map((r, i) => new LoomTreeItem(r, vscode.TreeItemCollapsibleState.None, 'risk', undefined, `Risk ${i + 1}`)));
        }
        if (element.contextValue === 'fsHealth') {
            return Promise.resolve((this.cache?.fsHealth || []).map((h, i) => new LoomTreeItem(h, vscode.TreeItemCollapsibleState.None, 'fsHealthItem', undefined, `Health ${i + 1}`)));
        }
        return Promise.resolve([]);
    }
    async getRootItems() {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders || workspaceFolders.length === 0) {
            this.hasWorkspace = false;
            return [];
        }
        const rootPath = workspaceFolders[0].uri.fsPath;
        const loomPath = vscode.workspace.getConfiguration('loom').get('path', 'loom');
        // Check if initialized
        const fs = await Promise.resolve().then(() => __importStar(require('fs')));
        this.hasWorkspace = fs.existsSync(`${rootPath}/.loom/config.yml`);
        if (!this.hasWorkspace) {
            return [
                new LoomTreeItem('LOOM not initialized. Click to run loom status.', vscode.TreeItemCollapsibleState.None, 'init', undefined, 'Run loom status in terminal'),
            ];
        }
        try {
            const stdout = (0, child_process_1.execSync)(`${loomPath} status`, {
                cwd: rootPath,
                encoding: 'utf-8',
                timeout: 15000,
            });
            this.cache = (0, statusParser_1.parseStatus)(stdout);
        }
        catch (err) {
            console.error('[LOOM VSCode] Failed to run loom status:', err);
            this.cache = { decisions: [], risks: [], fsHealth: [] };
        }
        const items = [];
        if (this.cache?.activeTask) {
            const t = this.cache.activeTask;
            items.push(new LoomTreeItem(`Task: ${t.title}`, vscode.TreeItemCollapsibleState.None, 'task', t.id, t.current ? `Current: ${t.current}` : t.title));
        }
        items.push(new LoomTreeItem(`Decisions (${this.cache?.decisions.length || 0})`, vscode.TreeItemCollapsibleState.Collapsed, 'decisions'));
        if (this.cache?.risks.length) {
            items.push(new LoomTreeItem(`Risks (${this.cache.risks.length})`, vscode.TreeItemCollapsibleState.Collapsed, 'risks'));
        }
        if (this.cache?.fsHealth.length) {
            items.push(new LoomTreeItem(`File Health (${this.cache.fsHealth.length})`, vscode.TreeItemCollapsibleState.Collapsed, 'fsHealth'));
        }
        return items;
    }
}
exports.LoomTreeDataProvider = LoomTreeDataProvider;
//# sourceMappingURL=treeView.js.map