import type { StoreAdapter } from '@spongeacer/loom-core';

export function runWhy(args: string[], store: StoreAdapter): string {
  const id = args[0];
  if (!id) return 'Usage: loom why <id>';

  const entry = store.getEntry(id);
  if (!entry) return `Entry not found: ${id}`;

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
  return lines.join('\n');
}
