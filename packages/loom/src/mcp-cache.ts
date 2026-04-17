import type { ToolResult } from './types/index.js';

interface CacheEntry {
  value: ToolResult;
  expiresAt: number;
}

import { MCP_CACHE_MAX_SIZE } from './core/constants.js';

const cache = new Map<string, CacheEntry>();
const locks = new Map<string, Promise<ToolResult>>();
const inFlight = new Map<string, Promise<ToolResult>>();

function pruneCache(): void {
  // Evict oldest entries when we exceed the limit.
  // Map preserves insertion order, so the first key is the oldest.
  while (cache.size > MCP_CACHE_MAX_SIZE) {
    const firstKey = cache.keys().next().value;
    if (firstKey !== undefined) {
      cache.delete(firstKey);
    } else {
      break;
    }
  }
}

function purgeExpiredEntries(): void {
  const now = Date.now();
  for (const [key, entry] of cache) {
    if (entry.expiresAt <= now) {
      cache.delete(key);
    }
  }
}

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

  const existing = inFlight.get(key);
  if (existing) {
    return existing;
  }

  const promise = fn().finally(() => {
    inFlight.delete(key);
  });
  inFlight.set(key, promise);

  const value = await promise;
  purgeExpiredEntries();
  cache.set(key, { value, expiresAt: now + ttlMs });
  pruneCache();
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
