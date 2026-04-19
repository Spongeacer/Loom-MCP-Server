import type { StoreAdapter } from '@spongeacer/loom-core';
import { runFsScan, runFsHealth, runFsDeps, runFsTrash, runFsClean, formatFsHealth, formatFsDeps, formatTrashList } from '@spongeacer/loom-core';

export async function runFsScanCommand(args: string[], store: StoreAdapter): Promise<string> {
  const dirs = args.length > 0 ? args : ['src', 'tests'];
  await runFsScan(dirs, store);
  return `FS scan complete for: ${dirs.join(', ')}`;
}

export function runFsHealthCommand(store: StoreAdapter): string {
  return formatFsHealth(runFsHealth(store));
}

export function runFsDepsCommand(args: string[], store: StoreAdapter): string {
  if (args.length === 0) return 'Usage: loom fs deps <file-path>';
  const targetPath = args[0];
  const result = runFsDeps(store, targetPath);
  if (!result) return `No artifact found for: ${targetPath}`;
  return formatFsDeps(result);
}

export function runFsTrashCommand(store: StoreAdapter): string {
  return formatTrashList(runFsTrash(store).items);
}

export async function runFsCleanCommand(store: StoreAdapter): Promise<string> {
  runFsClean(store, 30);
  return 'Cleaned trash items older than 30 days.';
}
