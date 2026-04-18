import { runSession } from '@spongeacer/loom-core';
import type { StoreAdapter } from '@spongeacer/loom-core';

export function runSessionCommand(args: string[], _store: StoreAdapter): string {
  const sub = (args[0] as 'summary' | 'recent') || 'summary';
  if (sub === 'recent') {
    const limit = parseInt(args[1] || '20', 10);
    const filterType = args[2] || undefined;
    const result = runSession(_store, 'recent', { limit, filterType });
    return result.content;
  }
  const hours = parseInt(args[1] || '24', 10);
  const result = runSession(_store, 'summary', { hours });
  return result.content;
}
