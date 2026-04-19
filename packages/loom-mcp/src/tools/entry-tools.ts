import type { ToolResult } from '@spongeacer/loom-core';
import { formatEntryExpand, formatEntryExplain } from '@spongeacer/loom-core';
import { getStore } from '../store.js';
import { ok, err } from './common.js';

export const entryTools = [
  {
    name: 'loom_entry_expand',
    description: 'Expand a LOOM entry to show more detail',
    inputSchema: { type: 'object', properties: { id: { type: 'string' }, level: { type: 'string', enum: ['l2', 'l3'] } }, required: ['id'] },
    handler: async (args: Record<string, unknown>): Promise<ToolResult> => {
      const store = getStore();
      const id = String(args.id);
      const level = (args.level as 'l2' | 'l3') || 'l2';
      const entry = store.getEntry(id);
      if (!entry) return err(`Entry not found: ${id}`);
      return ok(formatEntryExpand(entry, level));
    },
  },
  {
    name: 'loom_entry_explain',
    description: 'Explain a LOOM entry metadata and bindings',
    inputSchema: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] },
    handler: async (args: Record<string, unknown>): Promise<ToolResult> => {
      const store = getStore();
      const entry = store.getEntry(String(args.id));
      if (!entry) return err(`Entry not found: ${String(args.id)}`);
      return ok(formatEntryExplain(entry));
    },
  },
];
