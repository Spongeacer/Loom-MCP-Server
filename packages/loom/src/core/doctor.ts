import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { getPaths } from './paths.js';
import { getConfig } from './store.js';
import { getLoomPackageRoot } from './constants.js';
import { getNodePath, getLoomMcpPath, getSupportedClients } from '../commands/install-mcp.js';

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

  // 1. MCP config drift across known clients
  const loomPackageRoot = getLoomPackageRoot();
  const currentNodePath = getNodePath();
  let currentLoomMcpPath: string | undefined;
  try {
    currentLoomMcpPath = getLoomMcpPath();
  } catch {
    currentLoomMcpPath = undefined;
  }

  interface McpClientConfig {
    name: string;
    path: string;
    optional: boolean;
  }
  const mcpClients: McpClientConfig[] = [
    { name: 'Kimi Code CLI', path: path.join(os.homedir(), '.kimi', 'mcp.json'), optional: true },
    { name: 'Claude Desktop', path: path.join(os.homedir(), 'Library', 'Application Support', 'Claude', 'claude_desktop_config.json'), optional: true },
    { name: 'Cursor', path: path.join(os.homedir(), '.cursor', 'mcp.json'), optional: true },
    { name: 'Cline', path: path.join(os.homedir(), '.cline', 'data', 'settings', 'cline_mcp_settings.json'), optional: true },
    { name: 'Windsurf', path: path.join(os.homedir(), '.codeium', 'windsurf', 'mcp_config.json'), optional: true },
  ];

  // VS Code Kimi Extension
  let vscodeSettingsPath = '';
  if (process.platform === 'darwin') {
    vscodeSettingsPath = path.join(os.homedir(), 'Library', 'Application Support', 'Code', 'User', 'settings.json');
  } else if (process.platform === 'win32') {
    vscodeSettingsPath = path.join(process.env.APPDATA || '', 'Code', 'User', 'settings.json');
  } else {
    vscodeSettingsPath = path.join(os.homedir(), '.config', 'Code', 'User', 'settings.json');
  }

  function checkMcpConfig(client: McpClientConfig): DoctorResult[] {
    const out: DoctorResult[] = [];
    if (!fs.existsSync(client.path)) return out;
    try {
      const mcpConfig = JSON.parse(fs.readFileSync(client.path, 'utf-8')) as {
        mcpServers?: Record<string, { command?: string; args?: string[] }>;
      };
      const loomServers = Object.entries(mcpConfig.mcpServers || {}).filter(
        ([, s]) =>
          s.command === 'loom-mcp' ||
          (s.command && path.basename(s.command) === 'loom-mcp') ||
          s.args?.some((a) => a.includes('loom/dist/mcp.js') || a.includes('sdp/dist/mcp.js'))
      );
      if (loomServers.length === 0) {
        out.push({ level: client.optional ? 'ok' : 'warning', message: `${client.name} MCP config has no LOOM server registered` });
      } else {
        for (const [name, server] of loomServers) {
          if (server.command === 'loom-mcp' || (server.command && path.basename(server.command) === 'loom-mcp')) {
            out.push({ level: 'ok', message: `${client.name} MCP server "${name}" uses loom-mcp command` });
            continue;
          }

          // Path existence checks (drift detection)
          const commandPath = server.command || '';
          const argPaths = server.args || [];
          let driftDetected = false;

          if (commandPath && !fs.existsSync(commandPath)) {
            out.push({
              level: 'critical',
              message: `${client.name} MCP server "${name}" node/binary path does not exist: ${commandPath}`,
            });
            driftDetected = true;
          }

          for (const arg of argPaths) {
            if (arg.endsWith('.js') && !fs.existsSync(arg)) {
              out.push({
                level: 'critical',
                message: `${client.name} MCP server "${name}" script path does not exist: ${arg}`,
              });
              driftDetected = true;
            }
          }

          // Also warn if the configured node/mcp.js paths differ from current environment
          if (currentNodePath && commandPath && commandPath !== 'loom-mcp' && path.basename(commandPath) !== 'loom-mcp' && commandPath !== currentNodePath) {
            out.push({
              level: 'warning',
              message: `${client.name} MCP server "${name}" uses node at ${commandPath}, but current environment resolves to ${currentNodePath}. Run \`.loom doctor --fix\` to refresh.`,
            });
          }
          if (currentLoomMcpPath) {
            const mcpArg = argPaths.find((a) => a.includes('mcp.js'));
            if (mcpArg && mcpArg !== currentLoomMcpPath) {
              out.push({
                level: 'warning',
                message: `${client.name} MCP server "${name}" points to ${mcpArg}, but current environment resolves to ${currentLoomMcpPath}. Run \`.loom doctor --fix\` to refresh.`,
              });
            }
          }

          if (!driftDetected) {
            const isLoomMcpCommand = server.command === 'loom-mcp' || (server.command && path.basename(server.command) === 'loom-mcp');
            if (isLoomMcpCommand) {
              out.push({ level: 'ok', message: `${client.name} MCP server "${name}" path is correct` });
            } else {
              const expectedPaths = loomPackageRoot
                ? [
                    path.join(loomPackageRoot, 'dist', 'mcp.js'),
                    path.join(projectRoot, 'packages', 'loom', 'dist', 'mcp.js'),
                  ]
                : [path.join(projectRoot, 'packages', 'loom', 'dist', 'mcp.js')];
              const actualJoined = argPaths.join(' ') || '';
              const matchesExpected = expectedPaths.some((p) => actualJoined.includes(p));
              if (!matchesExpected) {
                out.push({
                  level: 'critical',
                  message: `${client.name} MCP server "${name}" points to unexpected path: ${actualJoined} (expected one of: ${expectedPaths.join(', ')})`,
                });
              } else {
                out.push({ level: 'ok', message: `${client.name} MCP server "${name}" path is correct` });
              }
            }
          }
        }
      }
    } catch (err) {
      console.error(`[LOOM] Failed to parse ${client.path}:`, err);
      out.push({ level: 'warning', message: `Failed to parse ${client.name} MCP config` });
    }
    return out;
  }

  function checkVscodeKimi(): DoctorResult[] {
    const out: DoctorResult[] = [];
    if (!fs.existsSync(vscodeSettingsPath)) return out;
    try {
      const data = JSON.parse(fs.readFileSync(vscodeSettingsPath, 'utf-8')) as {
        'kimi.mcpServers'?: Record<string, { command?: string; args?: string[] }>;
      };
      const loomServer = data['kimi.mcpServers']?.loom;
      if (!loomServer) {
        out.push({ level: 'ok', message: 'Kimi Code Extension (VS Code) has no LOOM server registered' });
        return out;
      }

      const commandPath = loomServer.command || '';
      const argPaths = loomServer.args || [];
      let driftDetected = false;

      if (commandPath && !fs.existsSync(commandPath)) {
        out.push({
          level: 'critical',
          message: `Kimi Code Extension (VS Code) node/binary path does not exist: ${commandPath}`,
        });
        driftDetected = true;
      }

      for (const arg of argPaths) {
        if (arg.endsWith('.js') && !fs.existsSync(arg)) {
          out.push({
            level: 'critical',
            message: `Kimi Code Extension (VS Code) script path does not exist: ${arg}`,
          });
          driftDetected = true;
        }
      }

      if (currentNodePath && commandPath && path.basename(commandPath) !== 'loom-mcp' && commandPath !== currentNodePath) {
        out.push({
          level: 'warning',
          message: `Kimi Code Extension (VS Code) uses node at ${commandPath}, but current environment resolves to ${currentNodePath}. Run \`.loom doctor --fix\` to refresh.`,
        });
      }
      if (currentLoomMcpPath) {
        const mcpArg = argPaths.find((a) => a.includes('mcp.js'));
        if (mcpArg && mcpArg !== currentLoomMcpPath) {
          out.push({
            level: 'warning',
            message: `Kimi Code Extension (VS Code) points to ${mcpArg}, but current environment resolves to ${currentLoomMcpPath}. Run \`.loom doctor --fix\` to refresh.`,
          });
        }
      }

      if (!driftDetected) {
        out.push({ level: 'ok', message: 'Kimi Code Extension (VS Code) MCP path is correct' });
      }
    } catch (err) {
      console.error(`[LOOM] Failed to parse ${vscodeSettingsPath}:`, err);
      out.push({ level: 'warning', message: 'Failed to parse Kimi Code Extension (VS Code) settings' });
    }
    return out;
  }

  let anyClientFound = false;
  for (const client of mcpClients) {
    if (fs.existsSync(client.path)) anyClientFound = true;
    results.push(...checkMcpConfig(client));
  }
  results.push(...checkVscodeKimi());
  if (!anyClientFound && !fs.existsSync(vscodeSettingsPath)) {
    results.push({ level: 'ok', message: 'No known MCP client configs found; skipping MCP drift checks' });
  }

  // 2. Hardcoded stale paths in source (monorepo dev mode only)
  const srcDirs = new Set<string>();
  if (loomPackageRoot) {
    srcDirs.add(path.join(loomPackageRoot, 'src'));
  }
  const legacySrcDir = path.join(projectRoot, 'packages', 'loom', 'src');
  if (fs.existsSync(legacySrcDir)) {
    srcDirs.add(legacySrcDir);
  }
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
      } else if (entry.isFile() && (entry.name.endsWith('.ts') || entry.name.endsWith('.js')) && entry.name !== 'doctor.ts' && !entry.name.endsWith('.test.ts') && !entry.name.endsWith('.test.js') && !entry.name.endsWith('.spec.ts') && !entry.name.endsWith('.spec.js')) {
        const text = fs.readFileSync(full, 'utf-8');
        for (const p of rotPatterns) {
          if (p.regex.test(text)) {
            rotFiles.push(`${path.relative(projectRoot, full)} contains "${p.label}"`);
          }
        }
      }
    }
  }
  for (const dir of srcDirs) {
    scanDir(dir);
  }
  if (rotFiles.length > 0) {
    results.push({ level: 'critical', message: `Source contains stale hardcoded paths: ${rotFiles.join('; ')}` });
  } else {
    results.push({ level: 'ok', message: 'No stale hardcoded paths found in source' });
  }

  // 3. Build stale check (monorepo dev mode only)
  const srcDir = loomPackageRoot
    ? path.join(loomPackageRoot, 'src')
    : path.join(projectRoot, 'packages', 'loom', 'src');
  const distDir = loomPackageRoot
    ? path.join(loomPackageRoot, 'dist')
    : path.join(projectRoot, 'packages', 'loom', 'dist');
  if (fs.existsSync(srcDir) && fs.existsSync(distDir)) {
    const srcMtime = getLatestMtime(srcDir);
    const distMtime = getLatestMtime(distDir);
    if (srcMtime > distMtime + 1000) {
      results.push({ level: 'warning', message: 'Build output is stale (dist/ older than src/). Run `npm run build` in packages/loom/' });
    } else {
      results.push({ level: 'ok', message: 'Build output is up to date' });
    }
  } else {
    results.push({ level: 'ok', message: 'Build stale check skipped (not in monorepo dev mode)' });
  }

  // 4. Watch daemon runner exists
  const runnerCandidates = loomPackageRoot
    ? [
        path.join(loomPackageRoot, 'dist', 'core', 'watch-daemon-runner.js'),
        path.join(projectRoot, 'packages', 'loom', 'dist', 'core', 'watch-daemon-runner.js'),
      ]
    : [path.join(projectRoot, 'packages', 'loom', 'dist', 'core', 'watch-daemon-runner.js')];
  const runnerPath = runnerCandidates.find((p) => fs.existsSync(p));
  if (!runnerPath) {
    results.push({ level: 'critical', message: `Watch daemon runner missing (tried ${runnerCandidates.join(', ')})` });
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
