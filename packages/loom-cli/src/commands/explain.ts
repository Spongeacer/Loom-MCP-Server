import type { StoreAdapter } from '@spongeacer/loom-core';
import { formatEntryExplain } from '@spongeacer/loom-core';

export function runExplain(args: string[], store: StoreAdapter): string {
  const id = args[0];
  if (!id) return 'Usage: loom explain <id>';

  const entry = store.getEntry(id);
  if (!entry) return `Entry not found: ${id}`;

  return formatEntryExplain(entry);
}
