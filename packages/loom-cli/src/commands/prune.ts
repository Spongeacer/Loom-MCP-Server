import type { StoreAdapter } from '@spongeacer/loom-core';
import { getDecaySummary } from '@spongeacer/loom-core';

export async function runPrune(store: StoreAdapter, args: string[]): Promise<string> {
  const subcommand = args[0] || 'status';

  if (subcommand === 'status') {
    return runDecayStatus(store);
  }

  if (subcommand === 'apply') {
    return runDecayApply(store);
  }

  if (subcommand === 'archive') {
    return runAutoArchive(store);
  }

  if (subcommand === 'restore') {
    const id = args[1];
    if (!id) return 'Usage: loom prune restore <entry-id>';
    const entry = store.restoreFromArchive(id);
    if (!entry) return `Archived entry not found: ${id}`;
    return `Restored entry: ${id} (${entry.type})`;
  }

  if (subcommand === 'list') {
    const items = store.listArchived();
    if (items.length === 0) return 'No archived entries.';
    const lines = ['Archived entries:'];
    for (const item of items) {
      lines.push(`  ${item.id} (${item.type}) — archived ${item.archivedAt.slice(0, 10)}, decay=${item.decayScore.toFixed(2)}`);
    }
    return lines.join('\n');
  }

  if (subcommand === 'purge') {
    const id = args[1];
    if (!id) return 'Usage: loom prune purge <entry-id>';
    const ok = store.pruneArchived(id);
    if (!ok) return `Archived entry not found: ${id}`;
    return `Permanently purged: ${id} (moved to trash first)`;
  }

  return [
    'Usage: loom prune <subcommand>',
    '',
    'Subcommands:',
    '  status     — Show decay statistics for all entries',
    '  apply      — Apply decay scores to all entries (updates freshness)',
    '  archive    — Auto-archive entries with decay score < 0.15',
    '  list       — List archived entries',
    '  restore <id> — Restore an archived entry to active',
    '  purge <id>   — Permanently delete an archived entry (moves to trash)',
  ].join('\n');
}

function runDecayStatus(store: StoreAdapter): string {
  const entries = store.listEntries();
  const summary = getDecaySummary(entries);
  const archived = store.listArchived();

  const lines: string[] = [];
  lines.push('Memory Lifecycle Status:');
  lines.push(`  Active entries: ${summary.total}`);
  lines.push(`  Immune (no decay): ${summary.immune}`);
  lines.push(`  Healthy (score >= 0.5): ${summary.healthy}`);
  lines.push(`  Fading (0.15 <= score < 0.5): ${summary.fading}`);
  lines.push(`  Archivable (score < 0.15): ${summary.archival}`);
  lines.push(`  Archived: ${archived.length}`);
  lines.push('');
  lines.push('By type:');
  for (const [type, data] of Object.entries(summary.byType)) {
    const d = data as { count: number; avgScore: number };
    lines.push(`  ${type}: ${d.count} entries, avg score=${d.avgScore}`);
  }
  return lines.join('\n');
}

function runDecayApply(store: StoreAdapter): string {
  const changed = store.applyDecay();
  if (changed.length === 0) return 'No entries needed decay update.';
  const lines = [`Applied decay to ${changed.length} entries:`];
  for (const e of changed.slice(0, 10)) {
    lines.push(`  ${e.id}: score=${(e.decay?.score ?? 0).toFixed(3)}`);
  }
  if (changed.length > 10) lines.push(`  ... and ${changed.length - 10} more`);
  return lines.join('\n');
}

function runAutoArchive(store: StoreAdapter): string {
  const archived = store.autoArchive();
  if (archived.length === 0) return 'No entries eligible for archival.';
  return `Archived ${archived.length} entries:\n${archived.map((id: string) => `  ${id}`).join('\n')}`;
}
