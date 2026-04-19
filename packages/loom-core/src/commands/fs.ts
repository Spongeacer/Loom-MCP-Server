import type { StoreAdapter } from '../store/adapter.js';
import type { ArtifactEntry } from '../types/index.js';
import { performFsScan } from '../fs-scan.js';

export interface FsHealthItem {
  path: string;
  status: string;
  reasons: string[];
}

export interface FsHealthResult {
  items: Record<string, FsHealthItem[]>;
}

export interface FsDepsResult {
  targetPath: string;
  imports: string[];
  importedBy: string[];
}

export interface FsTrashResult {
  items: { id: string; type: string; deletedAt: string }[];
}

export async function runFsScan(dirs: string[], store: StoreAdapter): Promise<void> {
  await performFsScan(dirs, store.getProjectRoot(), store);
}

export function runFsHealth(store: StoreAdapter): FsHealthResult {
  const artifacts = store.listEntries().filter((e): e is ArtifactEntry => e.type === 'Artifact');
  const byStatus: Record<string, FsHealthItem[]> = { healthy: [], stale: [], orphan: [], legacy: [], redundant: [], missing: [] };
  for (const art of artifacts) {
    const s = art.artifact.health.status;
    if (!byStatus[s]) byStatus[s] = [];
    byStatus[s].push({
      path: art.artifact.path,
      status: s,
      reasons: art.artifact.health.reasons,
    });
  }
  return { items: byStatus };
}

export function runFsDeps(store: StoreAdapter, targetPath: string): FsDepsResult | null {
  const artifact = store.listEntries().find((e): e is ArtifactEntry => e.type === 'Artifact' && e.artifact.path === targetPath);
  if (!artifact) return null;
  return {
    targetPath,
    imports: artifact.artifact.deps.imports,
    importedBy: artifact.artifact.deps.imported_by,
  };
}

export function runFsTrash(store: StoreAdapter): FsTrashResult {
  return { items: store.listTrash() };
}

export function runFsClean(store: StoreAdapter, days: number): void {
  store.purgeTrash(days);
}
