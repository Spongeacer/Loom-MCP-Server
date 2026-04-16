import type { ToolResult } from './types/index.js';

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

export async function withLock(
  key: string,
  fn: () => Promise<ToolResult>,
  busyMessage: string
): Promise<ToolResult> {
  if (locks.has(key)) {
    return { content: [{ type: 'text', text: busyMessage }] };
  }

  let resolveFn: (value: ToolResult) => void;
  const promise = new Promise<ToolResult>((resolve) => {
    resolveFn = resolve;
  }).finally(() => {
    locks.delete(key);
  });

  locks.set(key, promise);
  try {
    resolveFn!(await fn());
  } catch (err) {
    resolveFn!({ content: [{ type: 'text', text: (err as Error).message }], isError: true });
  }
  return promise;
}
