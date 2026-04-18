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
const child_process_1 = require("child_process");
const path = __importStar(require("path"));
const fs = __importStar(require("fs"));
const treeView_1 = require("./treeView");
let statusBarItem;
let pollTimer;
function activate(context) {
    const config = vscode.workspace.getConfiguration('loom');
    const autoRegister = config.get('autoRegisterMcp', true);
    if (autoRegister) {
        registerMcpServer(context).catch(() => { });
    }
    // Set context for view visibility based on LOOM initialization
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (workspaceFolders && workspaceFolders.length > 0) {
        const rootPath = workspaceFolders[0].uri.fsPath;
        const hasLoom = fs.existsSync(`${rootPath}/.loom/config.yml`);
        vscode.commands.executeCommand('setContext', 'loom.workspaceInitialized', hasLoom);
    }
    else {
        vscode.commands.executeCommand('setContext', 'loom.workspaceInitialized', false);
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
        const registered = await registerMcpServer(context);
        if (registered.length > 0) {
            vscode.window.showInformationMessage(`LOOM MCP registered for: ${registered.join(', ')}. Please reload the window.`);
        }
        else {
            vscode.window.showWarningMessage('LOOM MCP could not be registered. Ensure loom-mcp is available.');
        }
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
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (workspaceFolders && workspaceFolders.length > 0) {
            const rootPath = workspaceFolders[0].uri.fsPath;
            const hasLoom = fs.existsSync(`${rootPath}/.loom/config.yml`);
            vscode.commands.executeCommand('setContext', 'loom.workspaceInitialized', hasLoom);
        }
        else {
            vscode.commands.executeCommand('setContext', 'loom.workspaceInitialized', false);
        }
        treeProvider.refresh();
    });
    // Initial refresh
    treeProvider.refresh();
    // ─── Status Bar + Watch Daemon Polling ───
    statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    statusBarItem.command = 'loom.runStatus';
    context.subscriptions.push(statusBarItem);
    updateStatusBar();
    pollTimer = setInterval(updateStatusBar, 5000);
    context.subscriptions.push({ dispose: () => clearInterval(pollTimer) });
}
function isProcessRunning(pid) {
    try {
        process.kill(pid, 0);
        return true;
    }
    catch {
        return false;
    }
}
function getWorkspaceRoot() {
    const folders = vscode.workspace.workspaceFolders;
    return folders && folders.length > 0 ? folders[0].uri.fsPath : undefined;
}
function getLoomHealth(rootPath) {
    const result = { running: false, pid: undefined, memoryMB: undefined };
    const pidFile = path.join(rootPath, '.loom', 'cache', 'watch-pid.txt');
    if (fs.existsSync(pidFile)) {
        try {
            const pid = parseInt(fs.readFileSync(pidFile, 'utf-8').trim(), 10);
            if (!isNaN(pid) && isProcessRunning(pid)) {
                result.running = true;
                result.pid = pid;
            }
        }
        catch { /* ignore */ }
    }
    const healthFile = path.join(rootPath, '.loom', 'cache', 'watch-health.json');
    if (fs.existsSync(healthFile)) {
        try {
            const health = JSON.parse(fs.readFileSync(healthFile, 'utf-8'));
            if (health.pid && isProcessRunning(health.pid)) {
                result.running = true;
                result.pid = health.pid;
                result.memoryMB = health.memoryMB;
            }
        }
        catch { /* ignore */ }
    }
    return result;
}
function updateStatusBar() {
    if (!statusBarItem)
        return;
    const root = getWorkspaceRoot();
    if (!root) {
        statusBarItem.hide();
        return;
    }
    const initialized = fs.existsSync(path.join(root, '.loom', 'config.yml'));
    if (!initialized) {
        statusBarItem.text = '$(database) LOOM $(question)';
        statusBarItem.tooltip = 'LOOM not initialized. Click to run loom status.';
        statusBarItem.show();
        return;
    }
    const health = getLoomHealth(root);
    if (health.running) {
        statusBarItem.text = '$(database) LOOM $(play)';
        statusBarItem.tooltip = `LOOM Watch Daemon running (PID ${health.pid}${health.memoryMB ? `, ${health.memoryMB}MB` : ''}). Click for status.`;
    }
    else {
        statusBarItem.text = '$(database) LOOM';
        statusBarItem.tooltip = 'LOOM initialized. Watch Daemon stopped. Click for status.';
    }
    statusBarItem.show();
}
function resolveMcpEntry(context) {
    // 1. Resolve node absolute path
    let nodePath;
    try {
        const isWin = process.platform === 'win32';
        const cmd = isWin ? 'where.exe node' : 'which node';
        nodePath = (0, child_process_1.execSync)(cmd, { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'ignore'] })
            .trim()
            .split('\n')[0];
    }
    catch {
        nodePath = process.execPath;
    }
    // 2. PRIORITY: bundled loom-mcp inside the extension
    if (context) {
        const bundled = path.join(context.extensionPath, 'node_modules', 'loom-mcp', 'dist', 'mcp.js');
        if (fs.existsSync(bundled)) {
            return { command: nodePath, args: [bundled] };
        }
    }
    // Also try relative to extension source (development mode)
    const devBundled = path.join(__dirname, '..', 'node_modules', 'loom-mcp', 'dist', 'mcp.js');
    if (fs.existsSync(devBundled)) {
        return { command: nodePath, args: [devBundled] };
    }
    // 3. Resolve mcp.js absolute path via global loom-mcp CLI
    let mcpJsPath;
    let loomMcpBin;
    try {
        const isWin = process.platform === 'win32';
        const cmd = isWin ? 'where.exe loom-mcp' : 'which loom-mcp';
        loomMcpBin = (0, child_process_1.execSync)(cmd, { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'ignore'] })
            .trim()
            .split('\n')[0];
    }
    catch {
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
        }
        catch { }
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
    // 4. Fallback: if extension is running inside the loom repo
    if (!mcpJsPath) {
        const extDir = path.dirname(__dirname);
        const localCandidate = path.join(extDir, '..', '..', 'packages', 'loom', 'dist', 'mcp.js');
        if (fs.existsSync(localCandidate)) {
            mcpJsPath = localCandidate;
        }
    }
    if (nodePath && mcpJsPath) {
        return { command: nodePath, args: [mcpJsPath] };
    }
    // 5. Last resort: use loom-mcp wrapper directly
    if (loomMcpBin) {
        return { command: loomMcpBin, args: [] };
    }
    return undefined;
}
async function registerMcpServer(context) {
    const entry = resolveMcpEntry(context);
    if (!entry) {
        console.error('[LOOM VSCode] loom-mcp not found.');
        return [];
    }
    const registered = [];
    // Register to generic VS Code MCP (e.g., GitHub Copilot, other clients)
    try {
        const config = vscode.workspace.getConfiguration();
        const mcpServers = config.get('mcpServers', {});
        if (!mcpServers.loom) {
            await config.update('mcpServers', { ...mcpServers, loom: entry }, true);
            registered.push('VS Code (mcpServers)');
        }
        else {
            registered.push('VS Code (mcpServers) [already registered]');
        }
    }
    catch (err) {
        console.error('[LOOM VSCode] Failed to register generic MCP server:', err);
    }
    // Register to Kimi Code Extension (kimi.mcpServers)
    try {
        const kimiConfig = vscode.workspace.getConfiguration('kimi');
        const kimiMcpServers = kimiConfig.get('mcpServers', {});
        if (!kimiMcpServers.loom) {
            await kimiConfig.update('mcpServers', { ...kimiMcpServers, loom: entry }, true);
            registered.push('Kimi Code Extension');
        }
        else {
            registered.push('Kimi Code Extension [already registered]');
        }
    }
    catch (err) {
        console.error('[LOOM VSCode] Failed to register Kimi MCP server:', err);
    }
    return registered;
}
function deactivate() {
    if (pollTimer) {
        clearInterval(pollTimer);
    }
    statusBarItem?.dispose();
}
//# sourceMappingURL=extension.js.map