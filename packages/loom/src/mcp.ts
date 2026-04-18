#!/usr/bin/env node

import * as fs from 'node:fs';
import * as path from 'node:path';
import { LOOM_DIR_NAME } from './core/constants.js';

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { getVisibleTools, dispatch } from './mcp-router.js';
import { drainWalAsync } from './core/wal-queue.js';

const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '../package.json'), 'utf-8')) as { version: string };

const server = new Server(
  {
    name: 'loom-mcp',
    version: pkg.version,
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

server.setRequestHandler(ListToolsRequestSchema, async () => {
  const tools = getVisibleTools();
  return {
    tools: tools.map((t) => ({
      name: t.name,
      description: t.description,
      inputSchema: t.inputSchema,
    })),
  };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args, _meta } = request.params;
  const requestId = _meta?.progressToken ?? `req-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const start = Date.now();
  try {
    const result = await dispatch(name, args, { requestId });
    const duration = Date.now() - start;
    console.error(
      JSON.stringify({
        t: new Date().toISOString(),
        level: result.isError ? 'warn' : 'info',
        tool: name,
        request_id: requestId,
        duration_ms: duration,
        status: result.isError ? 'error' : 'ok',
        error: result.isError ? result.content[0]?.text : undefined,
      })
    );
    // Cast via unknown because SDK CallToolResult includes experimental fields
    // (e.g. task) that we intentionally don't model in ToolResult.
    return result as unknown as import('@modelcontextprotocol/sdk/types.js').CallToolResult;
  } catch (err) {
    const duration = Date.now() - start;
    console.error(
      JSON.stringify({
        t: new Date().toISOString(),
        level: 'error',
        tool: name,
        request_id: requestId,
        duration_ms: duration,
        status: 'exception',
        error: String(err),
      })
    );
    return {
      content: [{ type: 'text', text: `Unhandled exception in ${name}: ${err}` }],
      isError: true,
    } as unknown as import('@modelcontextprotocol/sdk/types.js').CallToolResult;
  }
});

let shuttingDown = false;

async function shutdown(code = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.error('[LOOM MCP] Shutting down gracefully...');
  const withTimeout = <T>(promise: Promise<T>, ms: number, label: string): Promise<T> => {
    return Promise.race([
      promise,
      new Promise<T>((_, reject) =>
        setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms)
      ),
    ]);
  };
  try {
    await withTimeout(server.close(), 5000, 'server.close');
  } catch {
    // ignore
  }
  try {
    await withTimeout(drainWalAsync(), 5000, 'drainWalAsync');
  } catch {
    // ignore
  }
  process.exit(code);
}

process.on('SIGINT', () => { void shutdown(0); });
process.on('SIGTERM', () => { void shutdown(0); });

process.on('uncaughtException', (err) => {
  console.error(JSON.stringify({ t: new Date().toISOString(), level: 'fatal', event: 'uncaughtException', error: String(err) }));
  void shutdown(1);
});

process.on('unhandledRejection', (reason) => {
  console.error(JSON.stringify({ t: new Date().toISOString(), level: 'fatal', event: 'unhandledRejection', error: String(reason) }));
  void shutdown(1);
});

async function main() {
  // Auto-detect LOOM project root and expose it via LOOM_PROJECT_ROOT.
  // VS Code (and other hosts) may start the MCP server with a cwd
  // that is not the actual workspace root. We avoid process.chdir()
  // because it mutates global mutable state and can break concurrent
  // assumptions in other modules.
  const start = process.cwd();
  let current = path.resolve(start);
  while (current !== path.dirname(current)) {
    if (fs.existsSync(path.join(current, LOOM_DIR_NAME, 'config.yml'))) {
      if (current !== start) {
        process.env.LOOM_PROJECT_ROOT = current;
        console.error(`[LOOM MCP] Auto-detected project root: ${current}`);
      }
      break;
    }
    current = path.dirname(current);
  }

  console.error('[LOOM MCP] Starting stdio transport...');
  const transport = new StdioServerTransport();

  // Workaround: StdioServerTransport does not listen for stdin 'end'.
  // When the MCP client disconnects, stdin closes and we must exit
  // gracefully to avoid becoming a zombie/orphan process.
  process.stdin.on('end', () => {
    console.error('[LOOM MCP] stdin ended (client disconnected), shutting down...');
    void shutdown(0);
  });
  process.stdin.on('close', () => {
    console.error('[LOOM MCP] stdin closed (client disconnected), shutting down...');
    void shutdown(0);
  });
  process.stdout.on('error', (err) => {
    console.error('[LOOM MCP] stdout error:', err);
    void shutdown(0);
  });

  await server.connect(transport);
  console.error('[LOOM MCP] Connected.');
}

main().catch((e) => {
  console.error('MCP Server error:', e);
  process.exit(1);
});
