import type { StoreAdapter } from '@spongeacer/loom-core';

export function runExpand(args: string[], store: StoreAdapter): string {
  const id = args[0];
  const level = (args[1] as 'l2' | 'l3') || 'l2';
  if (!id) return 'Usage: loom expand <id> [l2|l3]';

  const entry = store.getEntry(id);
  if (!entry) return `Entry not found: ${id}`;

  const lines: string[] = [];
  lines.push(`=== ${entry.id} (${entry.type}) ===`);
  lines.push(`L1.5: ${entry.content.l1_5}`);
  if (level === 'l2') {
    lines.push(`L2: ${entry.content.l2}`);
  } else {
    lines.push(`L2: ${entry.content.l2}`);
    const l3 = typeof entry.content.l3 === 'string' ? entry.content.l3 : `[file: ${entry.content.l3.file}]`;
    lines.push(`L3: ${l3}`);
  }
  return lines.join('\n');
}
