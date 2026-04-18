import type { StoreAdapter } from '@loom/core';

export function runExplain(args: string[], store: StoreAdapter): string {
  const id = args[0];
  if (!id) return 'Usage: loom explain <id>';

  const entry = store.getEntry(id);
  if (!entry) return `Entry not found: ${id}`;

  const lines: string[] = [];
  lines.push(`=== ${entry.id} ===`);
  lines.push(`Type: ${entry.type}`);
  lines.push(`Namespace: ${entry.namespace}`);
  lines.push(`Version: ${entry.version}`);
  lines.push(`Lifecycle: ${entry.lifecycle.state}`);
  lines.push(`Trust: ${entry.trust.level} (${entry.trust.source})`);
  lines.push(`Quality: ${entry.quality.composite_score.toFixed(2)}`);
  lines.push(`Bindings out: ${entry.bindings_out.length}`);
  lines.push(`Bindings in: ${entry.bindings_in.length}`);
  if (entry.bindings_out.length > 0) {
    lines.push('  → ' + entry.bindings_out.map((b) => `${b.target} (${b.rel})`).join(', '));
  }
  if (entry.bindings_in.length > 0) {
    lines.push('  ← ' + entry.bindings_in.map((b) => `${b.source} (${b.rel})`).join(', '));
  }
  return lines.join('\n');
}
