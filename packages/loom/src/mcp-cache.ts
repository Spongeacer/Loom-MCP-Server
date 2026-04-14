import type { ToolResult } from './mcp-router.js';

interface CacheEntry {
  value: ToolResult;
  expiresAt: number;
}

const cache = new Map<string, CacheEntry>();
const locks = new Map<string, Promise<ToolResult>>();

export async function withCache(
  key: string,
  ttlMs: number,
  fn: () => Promise<ToolResult>
): Promise<ToolResult> {
  const now = Date.now();
  const hit = cache.get(key);
  if (hit && hit.expiresAt > now) {
    return hit.value;
  }
  const value = await fn();
  cache.set(key, { value, expiresAt: now + ttlMs });
  return value;
}

export function clearMcpCache(key?: string): void {
  if (key) cache.delete(key);
  else cache.clear();
}

export async function withLock(
  key: string,
  fn: () => Promise<ToolResult>,
  busyMessage: string
): Promise<ToolResult> {
  const existing = locks.get(key);
  if (existing) {
    return { content: [{ type: 'text', text: busyMessage }] };
  }
  const promise = fn().finally(() => {
    locks.delete(key);
  });
  locks.set(key, promise);
  return promise;
}
