import { describe, it } from 'node:test';
import assert from 'node:assert';
import { spawn, type ChildProcess } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const SERVER_PATH = join(dirname(fileURLToPath(import.meta.url)), '../server.js');

interface JsonRpcRequest {
  jsonrpc: '2.0';
  id: number;
  method: string;
  params?: Record<string, unknown>;
}

interface JsonRpcResponse {
  jsonrpc: '2.0';
  id?: number | string;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}

interface ServerProcess {
  proc: ChildProcess;
  send(req: JsonRpcRequest): void;
  nextResponse(timeoutMs?: number): Promise<JsonRpcResponse>;
  shutdown(timeoutMs?: number): Promise<void>;
}

function startServer(): ServerProcess {
  const proc = spawn('node', [SERVER_PATH], {
    stdio: ['pipe', 'pipe', 'pipe'],
  });

  const lines: JsonRpcResponse[] = [];
  const resolvers: Array<(value: JsonRpcResponse) => void> = [];
  let buffer = '';

  proc.stdout!.on('data', (chunk: Buffer) => {
    buffer += chunk.toString('utf-8');
    let idx: number;
    while ((idx = buffer.indexOf('\n')) !== -1) {
      const line = buffer.slice(0, idx).trim();
      buffer = buffer.slice(idx + 1);
      if (!line) continue;
      try {
        const parsed = JSON.parse(line) as JsonRpcResponse;
        const resolver = resolvers.shift();
        if (resolver) {
          resolver(parsed);
        } else {
          lines.push(parsed);
        }
      } catch {
        // ignore non-JSON stdout lines
      }
    }
  });

  function send(req: JsonRpcRequest): void {
    proc.stdin!.write(JSON.stringify(req) + '\n');
  }

  function nextResponse(timeoutMs = 5000): Promise<JsonRpcResponse> {
    if (lines.length > 0) {
      return Promise.resolve(lines.shift()!);
    }
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`Timeout waiting for response after ${timeoutMs}ms`));
      }, timeoutMs);
      resolvers.push((value) => {
        clearTimeout(timer);
        resolve(value);
      });
    });
  }

  async function shutdown(timeoutMs = 5000): Promise<void> {
    proc.stdin!.end();
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`Timeout waiting for process to exit after ${timeoutMs}ms`));
      }, timeoutMs);
      proc.on('exit', () => {
        clearTimeout(timer);
        resolve();
      });
    });
  }

  return { proc, send, nextResponse, shutdown };
}

describe('MCP stdio server', () => {
  it(
    'initialize returns correct protocol version, server name, and version',
    { timeout: 5000 },
    async () => {
      const { send, nextResponse, shutdown } = startServer();
      send({ jsonrpc: '2.0', id: 1, method: 'initialize' });
      const res = await nextResponse();
      assert.strictEqual(res.error, undefined);
      assert.strictEqual((res.result as any).protocolVersion, '2024-11-05');
      assert.strictEqual((res.result as any).serverInfo.name, 'loom-mcp');
      assert.strictEqual((res.result as any).serverInfo.version, '0.4.0');
      await shutdown();
    }
  );

  it(
    'tools/list returns a non-empty array of tools with name, description, inputSchema',
    { timeout: 5000 },
    async () => {
      const { send, nextResponse, shutdown } = startServer();
      send({ jsonrpc: '2.0', id: 0, method: 'initialize' });
      await nextResponse();

      send({ jsonrpc: '2.0', id: 1, method: 'tools/list' });
      const res = await nextResponse();
      assert.strictEqual(res.error, undefined);
      const tools = (res.result as any).tools;
      assert.ok(Array.isArray(tools));
      assert.ok(tools.length > 0);
      for (const t of tools) {
        assert.ok(typeof t.name === 'string' && t.name.length > 0);
        assert.ok(typeof t.description === 'string');
        assert.ok(typeof t.inputSchema === 'object' && t.inputSchema !== null);
      }
      await shutdown();
    }
  );

  it(
    'tools/call with loom_ping returns pong',
    { timeout: 5000 },
    async () => {
      const { send, nextResponse, shutdown } = startServer();
      send({ jsonrpc: '2.0', id: 0, method: 'initialize' });
      await nextResponse();

      send({
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: { name: 'loom_ping', arguments: {} },
      });
      const res = await nextResponse();
      assert.strictEqual(res.error, undefined);
      assert.deepStrictEqual(res.result, {
        content: [{ type: 'text', text: 'pong' }],
      });
      await shutdown();
    }
  );

  it(
    'tools/call with unknown tool returns isError: true',
    { timeout: 5000 },
    async () => {
      const { send, nextResponse, shutdown } = startServer();
      send({ jsonrpc: '2.0', id: 0, method: 'initialize' });
      await nextResponse();

      send({
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: { name: 'loom_unknown_xyz', arguments: {} },
      });
      const res = await nextResponse();
      assert.strictEqual(res.error, undefined);
      assert.strictEqual((res.result as any).isError, true);
      await shutdown();
    }
  );

  it(
    'request before initialize returns error -32002',
    { timeout: 5000 },
    async () => {
      const { send, nextResponse, shutdown } = startServer();
      send({ jsonrpc: '2.0', id: 1, method: 'tools/list' });
      const res = await nextResponse();
      assert.strictEqual(res.error?.code, -32002);
      await shutdown();
    }
  );

  it(
    'unknown method returns error -32601',
    { timeout: 5000 },
    async () => {
      const { send, nextResponse, shutdown } = startServer();
      send({ jsonrpc: '2.0', id: 0, method: 'initialize' });
      await nextResponse();

      send({ jsonrpc: '2.0', id: 1, method: 'foo/bar' });
      const res = await nextResponse();
      assert.strictEqual(res.error?.code, -32601);
      await shutdown();
    }
  );

  it(
    'malformed JSON on stdin is handled gracefully',
    { timeout: 5000 },
    async () => {
      const { proc, send, nextResponse, shutdown } = startServer();
      proc.stdin!.write('this is not json\n');

      send({ jsonrpc: '2.0', id: 1, method: 'initialize' });
      const res = await nextResponse();
      assert.strictEqual(res.error, undefined);
      assert.strictEqual((res.result as any).protocolVersion, '2024-11-05');
      await shutdown();
    }
  );
});
