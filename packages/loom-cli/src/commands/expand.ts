import type { StoreAdapter } from '@spongeacer/loom-core';
import { formatEntryExpand } from '@spongeacer/loom-core';

export function runExpand(args: string[], store: StoreAdapter): string {
  const id = args[0];
  const level = (args[1] as 'l2' | 'l3') || 'l2';
  if (!id) return 'Usage: loom expand <id> [l2|l3]';

  const entry = store.getEntry(id);
  if (!entry) return `Entry not found: ${id}`;

  return formatEntryExpand(entry, level);
}
