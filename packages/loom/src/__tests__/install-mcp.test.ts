import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { registerClient, runInstallMcp } from '../commands/install-mcp.js';
import { getSupportedClients } from '../core/mcp-utils.js';

describe('install-mcp', () => {
  let tmpDir: string;

  before(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'loom-install-mcp-'));
  });

  after(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('registerClient creates file when missing', () => {
    const clientDir = path.join(tmpDir, 'client');
    fs.mkdirSync(clientDir, { recursive: true });
    const configPath = path.join(clientDir, 'mcp.json');
    const ok = registerClient(configPath, { command: 'node', args: ['/test/mcp.js'] });
    assert.strictEqual(ok, true);
    assert(fs.existsSync(configPath));
    const data = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    assert.strictEqual(data.mcpServers.loom.command, 'node');
  });

  it('registerClient updates existing file', () => {
    const configPath = path.join(tmpDir, 'client2', 'mcp.json');
    fs.mkdirSync(path.dirname(configPath), { recursive: true });
    fs.writeFileSync(configPath, JSON.stringify({ other: true }));
    const ok = registerClient(configPath, { command: 'node', args: ['/test/mcp.js'] });
    assert.strictEqual(ok, true);
    const data = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    assert.strictEqual(data.other, true);
    assert.strictEqual(data.mcpServers.loom.command, 'node');
  });

  it('registerClient returns false when parent dir missing', () => {
    const configPath = path.join(tmpDir, 'nonexistent', 'deep', 'mcp.json');
    const ok = registerClient(configPath, { command: 'node', args: ['/test/mcp.js'] });
    assert.strictEqual(ok, false);
  });

  it('getSupportedClients returns a non-empty list', () => {
    const clients = getSupportedClients();
    assert(clients.length > 0);
    assert(clients.some((c) => c.name === 'Kimi Code CLI'));
  });

  it('runInstallMcp returns a formatted report', () => {
    const output = runInstallMcp();
    assert(output.includes('LOOM MCP Auto-Configuration'));
    assert(output.includes('Node:'));
    assert(output.includes('MCP:'));
  });
});
