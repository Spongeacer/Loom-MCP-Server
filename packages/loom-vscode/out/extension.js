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
exports.activate = activate;
exports.deactivate = deactivate;
const vscode = __importStar(require("vscode"));
const treeView_1 = require("./treeView");
function activate(context) {
    const config = vscode.workspace.getConfiguration('loom');
    const autoRegister = config.get('autoRegisterMcp', true);
    if (autoRegister) {
        registerMcpServer().catch(() => { });
    }
    const treeProvider = new treeView_1.LoomTreeDataProvider();
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
    const expandCmd = vscode.commands.registerCommand('loom.expandEntry', async (id) => {
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
async function registerMcpServer() {
    try {
        const config = vscode.workspace.getConfiguration();
        const mcpServers = config.get('mcpServers', {});
        const updated = {
            ...mcpServers,
            loom: {
                command: 'loom-mcp',
                args: [],
            },
        };
        await config.update('mcpServers', updated, true);
    }
    catch (err) {
        console.error('[LOOM VSCode] Failed to register MCP server:', err);
    }
}
function deactivate() { }
//# sourceMappingURL=extension.js.map