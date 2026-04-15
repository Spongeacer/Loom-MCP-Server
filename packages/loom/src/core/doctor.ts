import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { getPaths } from './paths.js';
import { getConfig } from './store.js';

interface DoctorResult {
  level: 'ok' | 'warning' | 'critical';
  message: string;
}

function getLatestMtime(dir: string): number {
  let max = 0;
  if (!fs.existsSync(dir)) return 0;
  const stack: string[] = [dir];
  while (stack.length > 0) {
    const current = stack.pop()!;
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(current, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(full);
      } else if (entry.isFile()) {
        max = Math.max(max, fs.statSync(full).mtimeMs);
      }
    }
  }
  return max;
}

export function runDoctor(projectRoot: string): DoctorResult[] {
  const results: DoctorResult[] = [];

  // 1. MCP config drift
  const mcpPath = path.join(os.homedir(), '.kimi', 'mcp.json');
  if (!fs.existsSync(mcpPath)) {
    results.push({ level: 'warning', message: `MCP config missing at ${mcpPath}` });
  } else {
    try {
      const mcpConfig = JSON.parse(fs.readFileSync(mcpPath, 'utf-8')) as {
        mcpServers?: Record<string, { command?: string; args?: string[] }>;
      };
      const loomServers = Object.entries(mcpConfig.mcpServers || {}).filter(
        ([, s]) => s.args?.some((a) => a.includes('loom/dist/mcp.js') || a.includes('sdp/dist/mcp.js'))
      );
      if (loomServers.length === 0) {
        results.push({ level: 'critical', message: 'MCP config has no LOOM server registered' });
      } else {
        for (const [name, server] of loomServers) {
          const expected = path.join(projectRoot, 'packages', 'loom', 'dist', 'mcp.js');
          const actual = server.args?.find((a) => a.includes('mcp.js'));
          if (actual !== expected) {
            results.push({
              level: 'critical',
              message: `MCP server "${name}" points to wrong path: ${actual} (expected: ${expected})`,
            });
          } else {
            results.push({ level: 'ok', message: `MCP server "${name}" path is correct` });
          }
        }
      }
    } catch (err) {
      console.error('[LOOM] Failed to parse ~/.kimi/mcp.json:', err);
      results.push({ level: 'warning', message: 'Failed to parse ~/.kimi/mcp.json' });
    }
  }

  // 2. Hardcoded stale paths in source
  const srcDir = path.join(projectRoot, 'packages', 'loom', 'src');
  const rotPatterns = [
    { regex: /packages\.sdp/g, label: 'packages.sdp' },
    { regex: /\.sdp\//g, label: '.sdp/' },
    { regex: /sdp-mcp/g, label: 'sdp-mcp' },
    { regex: /packages\.loom/g, label: 'packages.loom' },
  ];
  const rotFiles: string[] = [];
  function scanDir(dir: string) {
    if (!fs.existsSync(dir)) return;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        scanDir(full);
      } else if (entry.isFile() && (entry.name.endsWith('.ts') || entry.name.endsWith('.js')) && entry.name !== 'doctor.ts') {
        const text = fs.readFileSync(full, 'utf-8');
        for (const p of rotPatterns) {
          if (p.regex.test(text)) {
            rotFiles.push(`${path.relative(projectRoot, full)} contains "${p.label}"`);
          }
        }
      }
    }
  }
  scanDir(srcDir);
  if (rotFiles.length > 0) {
    results.push({ level: 'critical', message: `Source contains stale hardcoded paths: ${rotFiles.join('; ')}` });
  } else {
    results.push({ level: 'ok', message: 'No stale hardcoded paths found in source' });
  }

  // 3. Build stale check
  const srcMtime = getLatestMtime(srcDir);
  const distDir = path.join(projectRoot, 'packages', 'loom', 'dist');
  const distMtime = getLatestMtime(distDir);
  if (srcMtime > distMtime + 1000) {
    results.push({ level: 'warning', message: 'Build output is stale (dist/ older than src/). Run `npm run build` in packages/loom/' });
  } else {
    results.push({ level: 'ok', message: 'Build output is up to date' });
  }

  // 4. Watch daemon runner exists
  const runnerPath = path.join(projectRoot, 'packages', 'loom', 'dist', 'core', 'watch-daemon-runner.js');
  if (!fs.existsSync(runnerPath)) {
    results.push({ level: 'critical', message: `Watch daemon runner missing at ${runnerPath}` });
  } else {
    results.push({ level: 'ok', message: 'Watch daemon runner is present' });
  }

  // 5. Legacy entry extensions
  const loomPaths = getPaths(projectRoot);
  const legacyFiles: string[] = [];
  for (const sub of Object.values(loomPaths).filter((p): p is string => typeof p === 'string' && p.startsWith(loomPaths.root))) {
    if (!fs.existsSync(sub) || !fs.statSync(sub).isDirectory()) continue;
    for (const file of fs.readdirSync(sub)) {
      if (file.endsWith('.sdp.yml') || file.includes('.sdp.')) {
        legacyFiles.push(path.relative(projectRoot, path.join(sub, file)));
      }
    }
  }
  if (legacyFiles.length > 0) {
    results.push({ level: 'warning', message: `Legacy naming found: ${legacyFiles.slice(0, 3).join(', ')}${legacyFiles.length > 3 ? '...' : ''}` });
  } else {
    results.push({ level: 'ok', message: 'No legacy .sdp naming found' });
  }

  // 6. Config version vs package version alignment
  const pkgPath = path.join(projectRoot, 'packages', 'loom', 'package.json');
  const config = getConfig(projectRoot);
  if (fs.existsSync(pkgPath) && config) {
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8')) as { version?: string };
    if (pkg.version && pkg.version !== config.version) {
      results.push({
        level: 'warning',
        message: `Version drift: package.json is ${pkg.version} but .loom/config.yml is ${config.version}`,
      });
    } else {
      results.push({ level: 'ok', message: 'Config version matches package.json' });
    }
  }

  return results;
}
