import type { Entry } from '../types/index.js';

export function formatEntryExpand(entry: Entry, level: 'l2' | 'l3' = 'l2'): string {
  const lines: string[] = [];
  lines.push(`=== ${entry.id} (${entry.type}) ===`);
  lines.push(`L1.5: ${entry.content.l1_5}`);
  lines.push(`L2: ${entry.content.l2}`);
  if (level === 'l3') {
    const l3 = typeof entry.content.l3 === 'string'
      ? entry.content.l3
      : `[file: ${entry.content.l3.file}]`;
    lines.push(`L3: ${l3}`);
  }
  return lines.join('\n');
}

export function formatEntryExplain(entry: Entry): string {
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
