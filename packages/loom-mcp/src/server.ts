#!/usr/bin/env node

import { installSignalHandlers, gracefulShutdown, LOOM_VERSION } from '@spongeacer/loom-core';
import type { ToolResult } from '@spongeacer/loom-core';
import { getVisibleTools, dispatch } from './router.js';

interface JsonRpcRequest {
  jsonrpc: '2.0';
  id?: number | string;
  method: string;
  params?: Record<string, unknown>;
}

interface JsonRpcResponse {
  jsonrpc: '2.0';
  id?: number | string;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}

let initialized = false;

function sendResponse(response: JsonRpcResponse): void {
  try {
    const json = JSON.stringify(response);
    process.stdout.write(json + '\n');
  } catch {
    // stdout pipe broken — nothing we can do
  }
}

function sendError(id: number | string | undefined, code: number, message: string): void {
  if (id === undefined) return;
  sendResponse({ jsonrpc: '2.0', id, error: { code, message } });
}

async function handleInitialize(id: number | string | undefined): Promise<void> {
  initialized = true;
  sendResponse({
    jsonrpc: '2.0',
    id,
    result: {
      protocolVersion: '2024-11-05',
      capabilities: { tools: {} },
      serverInfo: { name: 'loom-mcp', version: LOOM_VERSION },
    },
  });
}

async function handleToolsList(id: number | string | undefined): Promise<void> {
  const tools = getVisibleTools();
  sendResponse({
    jsonrpc: '2.0',
    id,
    result: {
      tools: tools.map((t) => ({
        name: t.name,
        description: t.description,
        inputSchema: t.inputSchema,
      })),
    },
  });
}

async function handleToolsCall(id: number | string | undefined, params: Record<string, unknown>): Promise<void> {
  const name = String(params.name ?? '');
  const args = (params.arguments ?? {}) as Record<string, unknown>;
  const start = Date.now();

  try {
    const result: ToolResult = await dispatch(name, args);
    const duration = Date.now() - start;
    try {
      console.error(
        JSON.stringify({
          t: new Date().toISOString(),
          level: result.isError ? 'warn' : 'info',
          tool: name,
          duration_ms: duration,
          status: result.isError ? 'error' : 'ok',
        })
      );
    } catch {
      // stderr may be broken; continue to send response
    }
    sendResponse({ jsonrpc: '2.0', id, result });
  } catch (err) {
    const duration = Date.now() - start;
    try {
      console.error(
        JSON.stringify({
          t: new Date().toISOString(),
          level: 'error',
          tool: name,
          duration_ms: duration,
          status: 'exception',
          error: String(err),
        })
      );
    } catch {
      // stderr may be broken; continue to send error response
    }
    sendResponse({
      jsonrpc: '2.0',
      id,
      result: {
        content: [{ type: 'text', text: `Unhandled exception in ${name}: ${err}` }],
        isError: true,
      } as ToolResult,
    });
  }
}

async function handleRequest(request: JsonRpcRequest): Promise<void> {
  const { id, method, params } = request;

  if (method === 'initialize') {
    await handleInitialize(id);
    return;
  }

  if (!initialized) {
    sendError(id, -32002, 'Server not initialized');
    return;
  }

  if (method === 'tools/list') {
    await handleToolsList(id);
    return;
  }

  if (method === 'tools/call') {
    await handleToolsCall(id, params ?? {});
    return;
  }

  // Silently ignore notifications we don't need to respond to
  if (method.startsWith('notifications/')) {
    return;
  }

  sendError(id, -32601, `Method not found: ${method}`);
}

function main(): void {
  console.error('[LOOM MCP] Starting stdio transport...');

  let buffer = '';

  process.stdin.setEncoding('utf-8');
  process.stdin.on('data', (chunk: string) => {
    buffer += chunk;
    let idx: number;
    while ((idx = buffer.indexOf('\n')) !== -1) {
      const line = buffer.slice(0, idx).trim();
      buffer = buffer.slice(idx + 1);
      if (!line) continue;

      try {
        const request = JSON.parse(line) as JsonRpcRequest;
        handleRequest(request).catch((err) => {
          console.error('[LOOM MCP] Handler error:', err);
        });
      } catch (parseErr) {
        console.error('[LOOM MCP] JSON parse error:', parseErr);
      }
    }
  });

  process.stdin.on('end', () => {
    console.error('[LOOM MCP] stdin ended');
    void gracefulShutdown(0);
  });

  process.stdin.on('close', () => {
    console.error('[LOOM MCP] stdin closed');
    void gracefulShutdown(0);
  });

  process.stdout.on('error', () => {
    void gracefulShutdown(0);
  });

  console.error('[LOOM MCP] Connected.');
}

installSignalHandlers();
main();
