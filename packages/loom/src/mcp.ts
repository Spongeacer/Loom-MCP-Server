#!/usr/bin/env node

import * as fs from 'node:fs';
import * as path from 'node:path';

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
    // Cast required because SDK CallToolResult type includes experimental fields
    // (e.g. task) that we intentionally don't model in ToolResult.
    return result as any;
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
    } as any;
  }
});

let shuttingDown = false;

async function shutdown(code = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.error('[LOOM MCP] Shutting down gracefully...');
  try {
    await server.close();
  } catch {
    // ignore
  }
  await drainWalAsync().catch(() => {});
  process.exit(code);
}

process.on('SIGINT', () => { void shutdown(0); });
process.on('SIGTERM', () => { void shutdown(0); });

async function main() {
  console.error('[LOOM MCP] Starting stdio transport...');
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('[LOOM MCP] Connected.');
}

main().catch((e) => {
  console.error('MCP Server error:', e);
  process.exit(1);
});
