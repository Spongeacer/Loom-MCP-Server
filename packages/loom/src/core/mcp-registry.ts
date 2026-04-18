import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import * as node_child_process_1 from 'node:child_process';

exports.CliCommandRegistry = exports.TomlMcpClientRegistry = exports.NestedJsonRegistry = exports.JsonMcpClientRegistry = void 0;
// ─── Utilities ───
function expandPath(p) {
    if (p.startsWith('~/')) {
        return path.join(os.homedir(), p.slice(2));
    }
    if (p.startsWith('~\\')) {
        return path.join(os.homedir(), p.slice(2));
    }
    return p;
}
function resolveConfigPath(configPath) {
    const raw = typeof configPath === 'function' ? configPath() : configPath;
    if (!raw)
        return null;
    return expandPath(raw);
}
function isCommandAvailable(cmd) {
    try {
        (0, node_child_process_1.execSync)(process.platform === 'win32' ? `where.exe ${cmd}` : `which ${cmd}`, {
            encoding: 'utf-8',
            stdio: ['pipe', 'pipe', 'ignore'],
        });
        return true;
    }
    catch {
        return false;
    }
}
function anyPathExists(paths) {
    return paths.some((p) => fs.existsSync(expandPath(p)));
}
function isProcessRunning(names) {
    for (const n of names) {
        try {
            if (process.platform === 'win32') {
                const result = (0, node_child_process_1.execSync)(`tasklist /FI "IMAGENAME eq ${n}.exe" /NH`, {
                    encoding: 'utf-8',
                    stdio: ['pipe', 'pipe', 'ignore'],
                });
                if (result.toLowerCase().includes(n.toLowerCase()))
                    return true;
            }
            else {
                (0, node_child_process_1.execSync)(`pgrep -ix "^${n}$"`, { stdio: 'ignore' });
                return true;
            }
        }
        catch {
            // process not found, try next name
        }
    }
    return false;
}
class JsonMcpClientRegistry {
    name;
    configPath;
    entryKey;
    detectPaths;
    detectCommands;
    runningProcesses;
    constructor(options) {
        this.name = options.name;
        this.configPath = options.configPath;
        this.entryKey = options.entryKey ?? 'mcpServers';
        this.detectPaths = options.detectPaths ?? [];
        this.detectCommands = options.detectCommands ?? [];
        this.runningProcesses = options.runningProcesses ?? [];
    }
    detect() {
        if (this.detectCommands.length > 0 && this.detectCommands.some(isCommandAvailable)) {
            return true;
        }
        if (this.detectPaths.length > 0 && anyPathExists(this.detectPaths)) {
            return true;
        }
        const cp = resolveConfigPath(this.configPath);
        if (cp && fs.existsSync(path.dirname(cp))) {
            return true;
        }
        return false;
    }
    register(entry) {
        const cp = resolveConfigPath(this.configPath);
        if (!cp)
            return false;
        try {
            const dir = path.dirname(cp);
            if (!fs.existsSync(dir))
                return false;
            let data = {};
            if (fs.existsSync(cp)) {
                data = JSON.parse(fs.readFileSync(cp, 'utf-8'));
            }
            const servers = data[this.entryKey] || {};
            servers.loom = entry;
            data[this.entryKey] = servers;
            fs.mkdirSync(dir, { recursive: true });
            fs.writeFileSync(cp, JSON.stringify(data, null, 2) + '\n');
            return true;
        }
        catch (err) {
            console.error(`  ✗ Failed to update ${cp}:`, err);
            return false;
        }
    }
    preview(_entry) {
        return this.detect();
    }
    isRunning() {
        if (this.runningProcesses.length === 0)
            return undefined;
        return isProcessRunning(this.runningProcesses);
    }
}
class NestedJsonRegistry {
    name;
    configPath;
    nestedKey;
    detectPaths;
    detectCommands;
    runningProcesses;
    constructor(options) {
        this.name = options.name;
        this.configPath = options.configPath;
        this.nestedKey = options.nestedKey;
        this.detectPaths = options.detectPaths ?? [];
        this.detectCommands = options.detectCommands ?? [];
        this.runningProcesses = options.runningProcesses ?? [];
    }
    detect() {
        if (this.detectCommands.length > 0 && this.detectCommands.some(isCommandAvailable)) {
            return true;
        }
        if (this.detectPaths.length > 0 && anyPathExists(this.detectPaths)) {
            return true;
        }
        const cp = resolveConfigPath(this.configPath);
        if (cp && fs.existsSync(cp)) {
            return true;
        }
        return false;
    }
    register(entry) {
        const cp = resolveConfigPath(this.configPath);
        if (!cp)
            return false;
        try {
            if (!fs.existsSync(cp))
                return false;
            const raw = fs.readFileSync(cp, 'utf-8');
            const data = JSON.parse(raw);
            setNestedValue(data, this.nestedKey, (obj) => {
                obj.loom = entry;
                return obj;
            });
            fs.writeFileSync(cp, JSON.stringify(data, null, 2) + '\n');
            return true;
        }
        catch (err) {
            console.error(`  ✗ Failed to update ${cp} for ${this.name}:`, err);
            return false;
        }
    }
    preview(_entry) {
        return this.detect();
    }
    isRunning() {
        if (this.runningProcesses.length === 0)
            return undefined;
        return isProcessRunning(this.runningProcesses);
    }
}
function setNestedValue(root, dottedKey, updater) {
    const parts = dottedKey.split('.');
    let current = root;
    for (let i = 0; i < parts.length - 1; i++) {
        const key = parts[i];
        if (!current[key] || typeof current[key] !== 'object' || Array.isArray(current[key])) {
            current[key] = {};
        }
        current = current[key];
    }
    const lastKey = parts[parts.length - 1];
    const existing = current[lastKey] || {};
    current[lastKey] = updater({ ...existing });
}
// ─── TOML Registry ───
function formatTomlValue(value) {
    if (typeof value === 'string') {
        return JSON.stringify(value);
    }
    if (Array.isArray(value)) {
        return `[${value.map(formatTomlValue).join(', ')}]`;
    }
    return String(value);
}
function updateTomlSection(content, section, data) {
    const sectionRegex = new RegExp(`^\\[${section.replace(/\./g, '\\.')}]\\s*$`, 'm');
    const lines = content.split('\n');
    if (sectionRegex.test(content)) {
        let startIdx = -1;
        let endIdx = lines.length;
        for (let i = 0; i < lines.length; i++) {
            if (sectionRegex.test(lines[i])) {
                startIdx = i;
            }
            else if (startIdx >= 0 && lines[i].trim().startsWith('[') && !lines[i].trim().startsWith('[[`')) {
                endIdx = i;
                break;
            }
        }
        if (startIdx >= 0) {
            const newLines = Object.entries(data).map(([k, v]) => `${k} = ${formatTomlValue(v)}`);
            lines.splice(startIdx + 1, Math.max(0, endIdx - startIdx - 1), ...newLines);
            return lines.join('\n');
        }
    }
    const newSection = [`\n[${section}]`, ...Object.entries(data).map(([k, v]) => `${k} = ${formatTomlValue(v)}`), ''];
    return (content.endsWith('\n') ? content : content + '\n') + newSection.join('\n') + '\n';
}
class TomlMcpClientRegistry {
    name;
    configPath;
    sectionPath;
    detectPaths;
    detectCommands;
    runningProcesses;
    constructor(options) {
        this.name = options.name;
        this.configPath = options.configPath;
        this.sectionPath = options.sectionPath;
        this.detectPaths = options.detectPaths ?? [];
        this.detectCommands = options.detectCommands ?? [];
        this.runningProcesses = options.runningProcesses ?? [];
    }
    detect() {
        if (this.detectCommands.length > 0 && this.detectCommands.some(isCommandAvailable)) {
            return true;
        }
        if (this.detectPaths.length > 0 && anyPathExists(this.detectPaths)) {
            return true;
        }
        const cp = resolveConfigPath(this.configPath);
        if (cp && fs.existsSync(path.dirname(cp))) {
            return true;
        }
        return false;
    }
    register(entry) {
        const cp = resolveConfigPath(this.configPath);
        if (!cp)
            return false;
        try {
            const dir = path.dirname(cp);
            fs.mkdirSync(dir, { recursive: true });
            let content = '';
            if (fs.existsSync(cp)) {
                content = fs.readFileSync(cp, 'utf-8');
            }
            const section = this.sectionPath('loom');
            const updated = updateTomlSection(content, section, {
                command: entry.command,
                args: entry.args,
            });
            fs.writeFileSync(cp, updated);
            return true;
        }
        catch (err) {
            console.error(`  ✗ Failed to update ${cp} for ${this.name}:`, err);
            return false;
        }
    }
    preview(_entry) {
        return this.detect();
    }
    isRunning() {
        if (this.runningProcesses.length === 0)
            return undefined;
        return isProcessRunning(this.runningProcesses);
    }
}
class CliCommandRegistry {
    name;
    commandFn;
    detectCommands;
    constructor(options) {
        this.name = options.name;
        this.commandFn = options.command;
        this.detectCommands = options.detectCommands ?? [];
    }
    detect() {
        return this.detectCommands.length > 0 && this.detectCommands.some(isCommandAvailable);
    }
    register(entry) {
        try {
            (0, node_child_process_1.execSync)(this.commandFn(entry), { stdio: ['pipe', 'pipe', 'ignore'] });
            return true;
        }
        catch (err) {
            console.error(`  ✗ Failed to run CLI command for ${this.name}:`, err);
            return false;
        }
    }
    preview(_entry) {
        return this.detect();
    }
}
// ─── Platform helpers ───
function vscodeSettingsPath() {
    if (process.platform === 'darwin') {
        return path.join(os.homedir(), 'Library', 'Application Support', 'Code', 'User', 'settings.json');
    }
    if (process.platform === 'win32') {
        return path.join(process.env.APPDATA || '', 'Code', 'User', 'settings.json');
    }
    return path.join(os.homedir(), '.config', 'Code', 'User', 'settings.json');
}
function claudeDesktopPath() {
    if (process.platform === 'darwin') {
        return path.join(os.homedir(), 'Library', 'Application Support', 'Claude', 'claude_desktop_config.json');
    }
    if (process.platform === 'linux') {
        return path.join(os.homedir(), '.config', 'claude', 'claude_desktop_config.json');
    }
    if (process.platform === 'win32') {
        return path.join(process.env.APPDATA || '', 'Claude', 'claude_desktop_config.json');
    }
    return null;
}
function windsurfPath() {
    if (process.platform === 'win32') {
        return path.join(process.env.USERPROFILE || '', '.codeium', 'windsurf', 'mcp_config.json');
    }
    return path.join(os.homedir(), '.codeium', 'windsurf', 'mcp_config.json');
}
// ─── Registry catalog ───
function getClientRegistries() {
    const registries = [
        // Standard JSON clients
        new JsonMcpClientRegistry({
            name: 'Kimi Code CLI',
            configPath: '~/.kimi/mcp.json',
            detectPaths: ['~/.kimi'],
            detectCommands: ['kimi'],
        }),
        new JsonMcpClientRegistry({
            name: 'Claude Desktop',
            configPath: claudeDesktopPath,
            detectPaths: ['~/Library/Application Support/Claude', '~/.config/claude'],
            runningProcesses: ['Claude'],
        }),
        new JsonMcpClientRegistry({
            name: 'Cursor',
            configPath: '~/.cursor/mcp.json',
            detectPaths: ['~/.cursor'],
            detectCommands: ['cursor'],
            runningProcesses: ['Cursor'],
        }),
        new JsonMcpClientRegistry({
            name: 'Cline',
            configPath: '~/.cline/data/settings/cline_mcp_settings.json',
            detectPaths: ['~/.cline'],
        }),
        new JsonMcpClientRegistry({
            name: 'Windsurf',
            configPath: windsurfPath,
            detectPaths: ['~/.codeium'],
            detectCommands: ['windsurf'],
            runningProcesses: ['Windsurf'],
        }),
        // Nested JSON (VS Code Extension)
        new NestedJsonRegistry({
            name: 'Kimi Code Extension (VS Code)',
            configPath: vscodeSettingsPath,
            nestedKey: 'kimi.mcpServers',
            detectPaths: ['~/Library/Application Support/Code', '~/.config/Code'],
            detectCommands: ['code'],
        }),
        // TOML client
        new TomlMcpClientRegistry({
            name: 'Codex',
            configPath: '~/.codex/config.toml',
            sectionPath: (n) => `mcp_servers.${n}`,
            detectPaths: ['~/.codex'],
            detectCommands: ['codex'],
            runningProcesses: ['codex'],
        }),
        // CLI command clients (examples for future)
        new CliCommandRegistry({
            name: 'Claude Code CLI',
            command: (entry) => `claude mcp add --transport stdio loom -- ${entry.command} ${entry.args.join(' ')}`,
            detectCommands: ['claude'],
        }),
    ];
    return registries;
}
//# sourceMappingURL=mcp-registry.js.map
export { getClientRegistries, JsonMcpClientRegistry, NestedJsonRegistry, TomlMcpClientRegistry, CliCommandRegistry };
