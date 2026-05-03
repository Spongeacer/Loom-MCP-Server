import type { ToolResult } from '@spongeacer/loom-core';
import { getDecaySummary } from '@spongeacer/loom-core';
import { getStore } from '../store.js';
import { ok, err } from './common.js';

export const lifecycleTools = [
  {
    name: 'loom_decay_status',
    description: 'Show memory lifecycle and decay statistics. Use this to understand how much of your knowledge base is fresh, fading, or eligible for archival. Helps decide when to run prune operations.',
    inputSchema: { type: 'object', properties: {} },
    handler: async (): Promise<ToolResult> => {
      const store = getStore();
      if (!store.isInitialized()) return err('LOOM not initialized');
      const entries = store.listEntries();
      const summary = getDecaySummary(entries);
      const archived = store.listArchived();

      const lines: string[] = [];
      lines.push('=== Memory Lifecycle Status ===');
      lines.push(`Active: ${summary.total} | Immune: ${summary.immune} | Archived: ${archived.length}`);
      lines.push(`Healthy (>=0.5): ${summary.healthy} | Fading (0.15-0.5): ${summary.fading} | Archivable (<0.15): ${summary.archival}`);
      lines.push('');
      lines.push('By type:');
      for (const [type, data] of Object.entries(summary.byType)) {
        lines.push(`  ${type}: ${data.count} entries, avg decay score=${data.avgScore}`);
      }
      if (summary.archival > 0) {
        lines.push('');
        lines.push(`${summary.archival} entries are eligible for archival. Run loom_prune with action="archive" to archive them.`);
      }
      return ok(lines.join('\n'));
    },
  },
  {
    name: 'loom_prune',
    description: 'Manage memory lifecycle: apply decay, archive stale entries, list/restore/purge archived entries. Use this to keep the knowledge base clean and prevent unbounded growth.',
    inputSchema: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['status', 'apply', 'archive', 'list', 'restore', 'purge'],
          description: 'Action to perform. status=show stats, apply=update decay scores, archive=auto-archive stale, list=show archived, restore=bring back, purge=permanent delete.',
        },
        entry_id: {
          type: 'string',
          description: 'Entry ID for restore/purge actions.',
        },
      },
      required: ['action'],
    },
    handler: async (args: Record<string, unknown>): Promise<ToolResult> => {
      const store = getStore();
      if (!store.isInitialized()) return err('LOOM not initialized');
      const action = String(args.action);

      if (action === 'status') {
        const entries = store.listEntries();
        const summary = getDecaySummary(entries);
        const archived = store.listArchived();
        const lines = [
          `Active: ${summary.total} | Immune: ${summary.immune} | Archived: ${archived.length}`,
          `Healthy: ${summary.healthy} | Fading: ${summary.fading} | Archivable: ${summary.archival}`,
        ];
        for (const [type, data] of Object.entries(summary.byType)) {
          lines.push(`  ${type}: ${data.count} (avg=${data.avgScore})`);
        }
        return ok(lines.join('\n'));
      }

      if (action === 'apply') {
        const changed = store.applyDecay();
        return ok(`Applied decay to ${changed.length} entries.`);
      }

      if (action === 'archive') {
        const archived = store.autoArchive();
        if (archived.length === 0) return ok('No entries eligible for archival.');
        return ok(`Archived ${archived.length} entries:\n${archived.join('\n')}`);
      }

      if (action === 'list') {
        const items = store.listArchived();
        if (items.length === 0) return ok('No archived entries.');
        const lines = items.map((item) =>
          `${item.id} (${item.type}) — archived ${item.archivedAt.slice(0, 10)}, decay=${item.decayScore.toFixed(2)}`
        );
        return ok(lines.join('\n'));
      }

      if (action === 'restore') {
        const id = String(args.entry_id || '');
        if (!id) return err('entry_id required for restore');
        const entry = store.restoreFromArchive(id);
        if (!entry) return err(`Archived entry not found: ${id}`);
        return ok(`Restored: ${id} (${entry.type})`);
      }

      if (action === 'purge') {
        const id = String(args.entry_id || '');
        if (!id) return err('entry_id required for purge');
        const ok_ = store.pruneArchived(id);
        if (!ok_) return err(`Archived entry not found: ${id}`);
        return ok(`Purged: ${id} (moved to trash)`);
      }

      return err(`Unknown action: ${action}`);
    },
  },
];
