import type { FsHealthResult, FsDepsResult } from '../commands/fs.js';

export function formatFsHealth(result: FsHealthResult): string {
  const lines: string[] = ['=== File Health Report ==='];
  for (const [status, items] of Object.entries(result.items)) {
    if (items.length === 0) continue;
    lines.push(`\n[${status.toUpperCase()}] (${items.length})`);
    for (const item of items.slice(0, 10)) {
      lines.push(`  ${item.path} — ${item.reasons.join(', ') || 'OK'}`);
    }
  }
  return lines.join('\n');
}

export function formatFsDeps(result: FsDepsResult): string {
  const lines: string[] = [`=== Dependencies for ${result.targetPath} ===`];
  lines.push(`Imports: ${result.imports.join(', ') || '(none)'}`);
  lines.push(`Imported by: ${result.importedBy.join(', ') || '(none)'}`);
  return lines.join('\n');
}

export function formatTrashList(items: { id: string; type: string; deletedAt: string }[]): string {
  if (items.length === 0) return 'Trash is empty.';
  const lines = ['=== Trash ==='];
  for (const item of items) {
    lines.push(`  ${item.id} (${item.type}) — deleted ${item.deletedAt}`);
  }
  return lines.join('\n');
}
