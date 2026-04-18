import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import node_assert_1 from 'node:assert';
import * as node_test_1 from 'node:test';
import * as mcp_registry_js_1 from '../core/mcp-registry.js';

var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
(0, node_test_1.describe)('mcp-registry', () => {
    let tmpDir;
    (0, node_test_1.before)(() => {
        tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'loom-mcp-registry-'));
    });
    (0, node_test_1.after)(() => {
        fs.rmSync(tmpDir, { recursive: true, force: true });
    });
    (0, node_test_1.it)('JsonMcpClientRegistry creates file when missing', () => {
        const configPath = path.join(tmpDir, 'json-client', 'mcp.json');
        fs.mkdirSync(path.dirname(configPath), { recursive: true });
        const registry = new mcp_registry_js_1.JsonMcpClientRegistry({
            name: 'Test JSON',
            configPath,
        });
        const ok = registry.register({ command: 'node', args: ['/test/mcp.js'] });
        node_assert_1.default.strictEqual(ok, true);
        (0, node_assert_1.default)(fs.existsSync(configPath));
        const data = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
        node_assert_1.default.strictEqual(data.mcpServers.loom.command, 'node');
    });
    (0, node_test_1.it)('JsonMcpClientRegistry updates existing file', () => {
        const configPath = path.join(tmpDir, 'json-client2', 'mcp.json');
        fs.mkdirSync(path.dirname(configPath), { recursive: true });
        fs.writeFileSync(configPath, JSON.stringify({ other: true }));
        const registry = new mcp_registry_js_1.JsonMcpClientRegistry({
            name: 'Test JSON 2',
            configPath,
        });
        const ok = registry.register({ command: 'node', args: ['/test/mcp.js'] });
        node_assert_1.default.strictEqual(ok, true);
        const data = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
        node_assert_1.default.strictEqual(data.other, true);
        node_assert_1.default.strictEqual(data.mcpServers.loom.command, 'node');
    });
    (0, node_test_1.it)('JsonMcpClientRegistry returns false when parent dir missing', () => {
        const configPath = path.join(tmpDir, 'nonexistent', 'deep', 'mcp.json');
        const registry = new mcp_registry_js_1.JsonMcpClientRegistry({
            name: 'Test JSON Missing',
            configPath,
        });
        const ok = registry.register({ command: 'node', args: ['/test/mcp.js'] });
        node_assert_1.default.strictEqual(ok, false);
    });
    (0, node_test_1.it)('NestedJsonRegistry updates existing nested key', () => {
        const configPath = path.join(tmpDir, 'nested-client', 'settings.json');
        fs.mkdirSync(path.dirname(configPath), { recursive: true });
        fs.writeFileSync(configPath, JSON.stringify({ kimi: { model: 'gpt-4' } }));
        const registry = new mcp_registry_js_1.NestedJsonRegistry({
            name: 'Test Nested',
            configPath,
            nestedKey: 'kimi.mcpServers',
        });
        const ok = registry.register({ command: 'node', args: ['/test/mcp.js'] });
        node_assert_1.default.strictEqual(ok, true);
        const data = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
        node_assert_1.default.strictEqual(data.kimi.model, 'gpt-4');
        node_assert_1.default.strictEqual(data.kimi.mcpServers.loom.command, 'node');
    });
    (0, node_test_1.it)('NestedJsonRegistry returns false when file missing', () => {
        const configPath = path.join(tmpDir, 'nested-missing', 'settings.json');
        const registry = new mcp_registry_js_1.NestedJsonRegistry({
            name: 'Test Nested Missing',
            configPath,
            nestedKey: 'kimi.mcpServers',
        });
        const ok = registry.register({ command: 'node', args: ['/test/mcp.js'] });
        node_assert_1.default.strictEqual(ok, false);
    });
    (0, node_test_1.it)('TomlMcpClientRegistry creates TOML file', () => {
        const configPath = path.join(tmpDir, 'toml-client', 'config.toml');
        fs.mkdirSync(path.dirname(configPath), { recursive: true });
        const registry = new mcp_registry_js_1.TomlMcpClientRegistry({
            name: 'Test TOML',
            configPath,
            sectionPath: (n) => `mcp_servers.${n}`,
        });
        const ok = registry.register({ command: 'node', args: ['/test/mcp.js'] });
        node_assert_1.default.strictEqual(ok, true);
        const content = fs.readFileSync(configPath, 'utf-8');
        (0, node_assert_1.default)(content.includes('[mcp_servers.loom]'));
        (0, node_assert_1.default)(content.includes('command = "node"'));
        (0, node_assert_1.default)(content.includes('args = ["/test/mcp.js"]'));
    });
    (0, node_test_1.it)('TomlMcpClientRegistry updates existing TOML file', () => {
        const configPath = path.join(tmpDir, 'toml-client2', 'config.toml');
        fs.mkdirSync(path.dirname(configPath), { recursive: true });
        fs.writeFileSync(configPath, '[core]\nmodel = "gpt-4"\n\n[mcp_servers.other]\ncommand = "echo"\n');
        const registry = new mcp_registry_js_1.TomlMcpClientRegistry({
            name: 'Test TOML 2',
            configPath,
            sectionPath: (n) => `mcp_servers.${n}`,
        });
        const ok = registry.register({ command: 'node', args: ['/test/mcp.js'] });
        node_assert_1.default.strictEqual(ok, true);
        const content = fs.readFileSync(configPath, 'utf-8');
        (0, node_assert_1.default)(content.includes('model = "gpt-4"'));
        (0, node_assert_1.default)(content.includes('[mcp_servers.other]'));
        (0, node_assert_1.default)(content.includes('[mcp_servers.loom]'));
        (0, node_assert_1.default)(content.includes('command = "node"'));
    });
    (0, node_test_1.it)('getClientRegistries returns a non-empty list', () => {
        const registries = (0, mcp_registry_js_1.getClientRegistries)();
        (0, node_assert_1.default)(registries.length > 0);
        (0, node_assert_1.default)(registries.some((r) => r.name === 'Kimi Code CLI'));
        (0, node_assert_1.default)(registries.some((r) => r.name === 'Claude Desktop'));
        (0, node_assert_1.default)(registries.some((r) => r.name === 'Kimi Code Extension (VS Code)'));
        (0, node_assert_1.default)(registries.some((r) => r.name === 'Codex'));
    });
});
//# sourceMappingURL=mcp-registry.test.js.map