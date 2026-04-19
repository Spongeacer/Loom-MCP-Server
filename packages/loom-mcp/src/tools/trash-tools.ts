import type { ToolResult } from '@spongeacer/loom-core';
import { formatTrashList } from '@spongeacer/loom-core';
import { getStore } from '../store.js';
import { ok, err } from './common.js';

export const trashTools = [
  {
    name: 'loom_trash_list',
    description: 'List deleted LOOM entries in trash',
    inputSchema: { type: 'object', properties: {} },
    handler: async (): Promise<ToolResult> => {
      return ok(formatTrashList(getStore().listTrash()));
    },
  },
  {
    name: 'loom_trash_restore',
    description: 'Restore a LOOM entry from trash',
    inputSchema: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] },
    handler: async (args: Record<string, unknown>): Promise<ToolResult> => {
      try {
        const id = String(args.id);
        const store = getStore();
        const trash = store.listTrash();
        if (!trash.some((t) => t.entry.id === id)) {
          return err(`Entry not found in trash: ${id}`);
        }
        store.restoreFromTrash(id);
        return ok(`Restored ${id} from trash.`);
      } catch (e) {
        return err(`Restore failed: ${String(e)}`);
      }
    },
  },
  {
    name: 'loom_trash_purge',
    description: 'Permanently delete all items in trash',
    inputSchema: { type: 'object', properties: {} },
    handler: async (): Promise<ToolResult> => {
      try {
        const store = getStore();
        const trash = store.listTrash();
        if (trash.length === 0) {
          return ok('Trash is already empty.');
        }
        store.purgeTrash(0);
        return ok(`Purged ${trash.length} item(s) from trash.`);
      } catch (e) {
        return err(`Purge failed: ${String(e)}`);
      }
    },
  },
];
