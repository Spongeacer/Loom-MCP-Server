import { spawn } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { findLoomRoot } from '@spongeacer/loom-core';

/**
 * Start the loom-mcp server with automatic project discovery.
 *
 * This is the unified entry point for all MCP clients.
 * It resolves the project root before starting the actual MCP server,
 * so GUI clients (VS Code, Claude Desktop, etc.) don't need to worry about cwd.
 *
 * Usage:
 *   loom mcp                    # Auto-discover project from cwd
 *   loom mcp --project <dir>    # Explicit project directory
 */
export async function runMcpServer(args: string[]): Promise<void> {
  let projectDir: string | null = null;

  const projectFlag = args.indexOf('--project');
  if (projectFlag >= 0 && args[projectFlag + 1]) {
    projectDir = path.resolve(args[projectFlag + 1]);
  } else {
    projectDir = findLoomRoot(process.cwd());
  }

  if (!projectDir) {
    console.error('[LOOM] No LOOM workspace found. Run `loom init <project-name>` in your project root.');
    process.exit(1);
  }

  // Resolve loom-mcp server.js path
  const scriptPath = fileURLToPath(import.meta.url);
  const cliDir = path.dirname(scriptPath);
  const serverJs = path.resolve(cliDir, '../../../loom-mcp/dist/server.js');

  if (!fs.existsSync(serverJs)) {
    console.error(`[LOOM] MCP server not found at: ${serverJs}`);
    process.exit(1);
  }

  // Set LOOM_PROJECT_ROOT so the MCP server knows which project to serve
  process.env.LOOM_PROJECT_ROOT = projectDir;

  console.error(`[LOOM MCP] Project: ${projectDir}`);

  // Spawn the actual MCP server and pipe stdio
  const child = spawn(process.execPath, [serverJs], {
    stdio: ['inherit', 'inherit', 'inherit'],
    env: process.env,
  });

  child.on('exit', (code) => {
    process.exit(code ?? 0);
  });
}
