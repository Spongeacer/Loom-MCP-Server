#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { installSignalHandlers, gracefulShutdown, LOOM_VERSION } from '@spongeacer/loom-core';
import { getVisibleTools, dispatch } from './router.js';

const server = new Server(
  { name: 'loom-mcp', version: LOOM_VERSION },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => {
  const tools = getVisibleTools();
  return { tools: tools.map((t) => ({ name: t.name, description: t.description, inputSchema: t.inputSchema })) };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  const start = Date.now();
  try {
    const result = await dispatch(name, args ?? {});
    const duration = Date.now() - start;
    console.error(JSON.stringify({ t: new Date().toISOString(), level: result.isError ? 'warn' : 'info', tool: name, duration_ms: duration, status: result.isError ? 'error' : 'ok' }));
    return result as any;
  } catch (err) {
    const duration = Date.now() - start;
    console.error(JSON.stringify({ t: new Date().toISOString(), level: 'error', tool: name, duration_ms: duration, status: 'exception', error: String(err) }));
    return { content: [{ type: 'text', text: `Unhandled exception in ${name}: ${err}` }], isError: true } as any;
  }
});

installSignalHandlers();

async function main() {
  console.error('[LOOM MCP] Starting stdio transport...');
  const transport = new StdioServerTransport();

  process.stdin.on('end', () => { console.error('[LOOM MCP] stdin ended'); void gracefulShutdown(0); });
  process.stdin.on('close', () => { console.error('[LOOM MCP] stdin closed'); void gracefulShutdown(0); });
  process.stdout.on('error', () => { void gracefulShutdown(0); });

  await server.connect(transport);
  console.error('[LOOM MCP] Connected.');
}

main().catch((e) => {
  console.error('MCP Server error:', e);
  process.exit(1);
});
