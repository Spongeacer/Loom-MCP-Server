import type { StoreAdapter } from '@loom/core';
import { runFsScan, runFsHealth, runFsDeps, runFsTrash, runFsClean } from '@loom/core';

export async function runFsScanCommand(args: string[], store: StoreAdapter): Promise<string> {
  const dirs = args.length > 0 ? args : ['src', 'tests'];
  await runFsScan(dirs, store);
  return `FS scan complete for: ${dirs.join(', ')}`;
}

export function runFsHealthCommand(store: StoreAdapter): string {
  const result = runFsHealth(store);
  const report: string[] = ['=== File Health Report ==='];
  for (const [status, items] of Object.entries(result.items)) {
    if (items.length === 0) continue;
    report.push(`\n[${status.toUpperCase()}] (${items.length})`);
    for (const item of items.slice(0, 10)) {
      report.push(`  ${item.path} — ${item.reasons.join(', ') || 'OK'}`);
    }
  }
  return report.join('\n');
}

export function runFsDepsCommand(args: string[], store: StoreAdapter): string {
  if (args.length === 0) return 'Usage: loom fs deps <file-path>';
  const targetPath = args[0];
  const result = runFsDeps(store, targetPath);
  if (!result) return `No artifact found for: ${targetPath}`;
  const lines: string[] = [`=== Dependencies for ${result.targetPath} ===`];
  lines.push(`Imports: ${result.imports.join(', ') || '(none)'}`);
  lines.push(`Imported by: ${result.importedBy.join(', ') || '(none)'}`);
  return lines.join('\n');
}

export function runFsTrashCommand(store: StoreAdapter): string {
  const result = runFsTrash(store);
  if (result.items.length === 0) return 'Trash is empty.';
  const lines = ['=== Trash ==='];
  for (const item of result.items) {
    lines.push(`  ${item.id} (${item.type}) — deleted ${item.deletedAt}`);
  }
  return lines.join('\n');
}

export async function runFsCleanCommand(store: StoreAdapter): Promise<string> {
  runFsClean(store, 30);
  return 'Cleaned trash items older than 30 days.';
}
