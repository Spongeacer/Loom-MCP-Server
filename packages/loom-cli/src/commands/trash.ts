import type { StoreAdapter } from '@spongeacer/loom-core';
import { formatTrashList } from '@spongeacer/loom-core';

export function runTrashList(store: StoreAdapter): string {
  return formatTrashList(store.listTrash());
}

export function runTrashRestore(args: string[], store: StoreAdapter): string {
  const id = args[0];
  if (!id) return 'Usage: loom trash restore <id>';
  const trashed = store.listTrash().find((t) => t.id === id);
  if (!trashed) return `Entry ${id} is not in trash.`;
  store.restoreFromTrash(id);
  return `Restored ${id} from trash.`;
}

export function runTrashPurge(store: StoreAdapter): string {
  store.purgeTrash(0);
  return 'Trash purged.';
}
