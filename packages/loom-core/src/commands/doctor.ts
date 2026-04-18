import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import type { StoreAdapter } from '../store/adapter.js';
import { getPaths } from '../paths.js';
import { LOOM_VERSION } from '../constants.js';

export interface DoctorCheck {
  level: 'ok' | 'warning' | 'critical';
  message: string;
}

export interface DoctorReport {
  ok: DoctorCheck[];
  warnings: DoctorCheck[];
  critical: DoctorCheck[];
}

export function runDoctor(store: StoreAdapter): DoctorReport {
  const ok: DoctorCheck[] = [];
  const warnings: DoctorCheck[] = [];
  const critical: DoctorCheck[] = [];

  // 1. Check .loom/ exists
  if (!store.isInitialized()) {
    critical.push({ level: 'critical', message: 'LOOM workspace not initialized. Run: loom init <project-name>' });
  } else {
    ok.push({ level: 'ok', message: 'LOOM workspace initialized' });
  }

  // 2. Check MCP configs
  const mcpClients = [
    { name: 'Kimi Code CLI', path: path.join(os.homedir(), '.kimi', 'mcp.json'), optional: true },
    { name: 'Claude Desktop', path: path.join(os.homedir(), 'Library', 'Application Support', 'Claude', 'claude_desktop_config.json'), optional: true },
    { name: 'Cursor', path: path.join(os.homedir(), '.cursor', 'mcp.json'), optional: true },
  ];

  let anyClientFound = false;
  for (const client of mcpClients) {
    if (!fs.existsSync(client.path)) continue;
    anyClientFound = true;
    try {
      const data = JSON.parse(fs.readFileSync(client.path, 'utf-8')) as { mcpServers?: Record<string, { command?: string }> };
      const hasLoom = Object.values(data.mcpServers || {}).some((s) => s.command?.includes('loom'));
      if (hasLoom) {
        ok.push({ level: 'ok', message: `${client.name} has LOOM MCP server registered` });
      } else {
        ok.push({ level: client.optional ? 'ok' : 'warning', message: `${client.name} has no LOOM server registered` });
      }
    } catch {
      warnings.push({ level: 'warning', message: `Failed to parse ${client.name} MCP config` });
    }
  }
  if (!anyClientFound) {
    ok.push({ level: 'ok', message: 'No known MCP client configs found; skipping MCP checks' });
  }

  // 3. Check watch daemon runner
  const paths = getPaths(process.cwd());
  const runnerPath = path.join(paths.root, '..', 'packages', 'loom-cli', 'bin', 'loom');
  if (!fs.existsSync(runnerPath)) {
    warnings.push({ level: 'warning', message: 'loom CLI wrapper not found in expected path' });
  } else {
    ok.push({ level: 'ok', message: 'loom CLI wrapper is present' });
  }

  // 4. Check config version
  const config = store.getConfig();
  if (config) {
    if (config.version === LOOM_VERSION) {
      ok.push({ level: 'ok', message: `Config version matches ${LOOM_VERSION}` });
    } else {
      warnings.push({ level: 'warning', message: `Config version is ${config.version}, expected ${LOOM_VERSION}` });
    }
  }

  return { ok, warnings, critical };
}
