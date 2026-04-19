import type { ToolResult } from '@spongeacer/loom-core';
import { formatEntryExpand, formatEntryExplain } from '@spongeacer/loom-core';
import { getStore } from '../store.js';
import { ok, err } from './common.js';

export const entryTools = [
  {
    name: 'loom_entry_expand',
    description: 'Expand a LOOM entry to show more detail. Use this when you see a ↣id in the context but do not fully understand what it contains, before acting on or referencing that entry. Prevents hallucination from guessing entry contents based on ID names alone.',
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
    description: 'Explain a LOOM entry\'s metadata, lifecycle, quality scores, and bindings. Use this to understand why an entry exists, how it relates to other entries, and whether it is still trustworthy (check trust level, staleness, and conflict status).',
    inputSchema: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] },
    handler: async (args: Record<string, unknown>): Promise<ToolResult> => {
      const store = getStore();
      const entry = store.getEntry(String(args.id));
      if (!entry) return err(`Entry not found: ${String(args.id)}`);
      return ok(formatEntryExplain(entry));
    },
  },
  {
    name: 'loom_entry_why',
    description: 'Explain why a LOOM entry is relevant to the current context. Use this to understand why a particular entry was injected into the prompt — whether it is the active task, pinned, hot, or connected via bindings. Helpful when an entry seems unrelated at first glance.',
    inputSchema: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] },
    handler: async (args: Record<string, unknown>): Promise<ToolResult> => {
      const store = getStore();
      const id = String(args.id);
      const entry = store.getEntry(id);
      if (!entry) return err(`Entry not found: ${id}`);

      const ws = store.getWorkingSet();
      const lines: string[] = [];
      lines.push(`=== Why is ${entry.id} relevant? ===`);

      if (ws.active_task && entry.id === ws.active_task) {
        lines.push('• This is the currently active task.');
      }
      if (ws.pinned_entries.includes(entry.id)) {
        lines.push('• This entry is pinned in the working set.');
      }
      if (ws.hot_entries.includes(entry.id)) {
        lines.push('• This entry is in the hot list (recently accessed).');
      }
      if (entry.bindings_out.length > 0) {
        lines.push(`• Has ${entry.bindings_out.length} outgoing binding(s): ${entry.bindings_out.map((b) => b.target).join(', ')}`);
      }
      if (entry.bindings_in.length > 0) {
        lines.push(`• Has ${entry.bindings_in.length} incoming binding(s): ${entry.bindings_in.map((b) => b.source).join(', ')}`);
      }
      if (entry.activation.paths.length > 0) {
        lines.push(`• Activated by paths: ${entry.activation.paths.join(', ')}`);
      }
      if (entry.activation.keywords.length > 0) {
        lines.push(`• Activated by keywords: ${entry.activation.keywords.join(', ')}`);
      }
      if (lines.length === 1) {
        lines.push('• No specific activation reason found. Entry may be in dictionary by default.');
      }
      return ok(lines.join('\n'));
    },
  },
];
