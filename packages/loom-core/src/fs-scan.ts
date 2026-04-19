import * as fs from 'node:fs';
import * as path from 'node:path';
import type { StoreAdapter } from './store/adapter.js';
import type { ArtifactEntry, Binding } from './types/index.js';
import { getPaths } from './paths.js';
import { scanProjectFiles, updateArtifactsFs } from './fs-tracker.js';
import { discoverArtifacts } from './binding-discovery.js';
import { buildDependencyGraph, updateDependencyGraphIncremental } from './dependency-graph.js';
import { runHealthAnalysis } from './health-analyzer.js';
import { appendWalAsync } from './wal-queue.js';
import { SCAN_COOLDOWN_MS, FS_SCAN_WORKER_TIMEOUT_MS } from './constants.js';
import { safeMkdir } from './utils/fs-safe.js';

export function getLastScanPath(projectRoot: string): string {
  return path.join(projectRoot, '.loom', 'cache', 'last-fs-scan.txt');
}

export function shouldAutoScan(projectRoot: string): boolean {
  const lastScanPath = getLastScanPath(projectRoot);
  if (!fs.existsSync(lastScanPath)) return true;
  const raw = fs.readFileSync(lastScanPath, 'utf-8').trim();
  if (!raw) return true;
  const lastScan = new Date(raw).getTime();
  if (Number.isNaN(lastScan)) return true;
  return Date.now() - lastScan > SCAN_COOLDOWN_MS;
}

function touchLastScan(projectRoot: string): void {
  safeMkdir(path.dirname(getLastScanPath(projectRoot)));
  fs.writeFileSync(getLastScanPath(projectRoot), new Date().toISOString());
}

async function stepRegisterArtifacts(
  dirs: string[],
  projectRoot: string,
  adapter: StoreAdapter
): Promise<{ artifacts: ArtifactEntry[]; l0Bindings: Binding[] }> {
  const artifacts = adapter.listEntries().filter((e): e is ArtifactEntry => e.type === 'Artifact');
  const existingPaths = new Set(artifacts.map((a) => a.artifact.path));
  const allScannedFiles = scanProjectFiles(dirs, projectRoot);
  const newFiles = allScannedFiles.filter((f) => !existingPaths.has(f)).map((f) => path.join(projectRoot, f));

  const l0Bindings: Binding[] = [];
  if (newFiles.length > 0) {
    const allEntries = adapter.listEntries();
    const { entries: newArtifacts, bindings } = discoverArtifacts(newFiles, allEntries, projectRoot);
    for (const art of newArtifacts) {
      adapter.saveEntry(art);
      artifacts.push(art);
    }
    l0Bindings.push(...bindings);
    for (const b of bindings) {
      adapter.saveBinding(b);
    }
    if (newArtifacts.length > 0 || bindings.length > 0) adapter.bumpCacheVersion();
  }
  return { artifacts, l0Bindings };
}

function stepUpdateFsMeta(artifacts: ArtifactEntry[], dirs: string[], projectRoot: string, adapter: StoreAdapter): { artifacts: ArtifactEntry[]; missing: ArtifactEntry[] } {
  const { artifacts: updated, missing, seenPaths } = updateArtifactsFs(artifacts, dirs, projectRoot);
  // Safety: if scan found zero files, don't mass-delete artifacts (wrong scan dirs)
  const safeToDelete = seenPaths.size > 0 || artifacts.length === 0;
  if (safeToDelete) {
    for (const art of missing) {
      adapter.removeEntry(art.id);
    }
  }
  const kept = safeToDelete ? updated.filter((a) => a.artifact.fs.exists) : updated;
  for (const art of kept) {
    adapter.saveEntry(art);
  }
  adapter.bumpCacheVersion();
  return { artifacts: kept, missing: safeToDelete ? missing : [] };
}

async function stepBuildDependencyGraph(artifacts: ArtifactEntry[], projectRoot: string, adapter: StoreAdapter): Promise<{ updatedArtifacts: ArtifactEntry[]; depBindings: Binding[] }> {
  const { artifacts: updatedArtifacts, bindings: depBindings } = buildDependencyGraph(artifacts, projectRoot);
  for (const art of updatedArtifacts) {
    adapter.saveEntry(art);
  }
  let wroteAny = false;
  for (const b of depBindings) {
    adapter.saveBinding(b);
    wroteAny = true;
  }
  if (wroteAny) adapter.bumpCacheVersion();
  return { updatedArtifacts, depBindings };
}

function stepHealthAnalysis(artifacts: ArtifactEntry[], projectRoot: string, adapter: StoreAdapter): void {
  const entries = adapter.listEntries();
  const allBindings = adapter.listBindings();
  const config = adapter.getConfig();
  const report = runHealthAnalysis(artifacts, allBindings, entries, projectRoot, config ?? undefined);
  for (const art of report.artifacts) {
    adapter.saveEntry(art);
  }
  adapter.bumpCacheVersion();
}

async function runIncrementalScan(
  changedFiles: string[],
  projectRoot: string,
  adapter: StoreAdapter,
  _opts: { silent?: boolean } = {}
): Promise<{ artifacts: ArtifactEntry[]; missing: ArtifactEntry[]; depBindings: Binding[] }> {
  const allArtifacts = adapter.listEntries().filter((e): e is ArtifactEntry => e.type === 'Artifact');

  // 1. Register new artifacts
  const existingPaths = new Set(allArtifacts.map((a) => a.artifact.path));
  const newFiles = changedFiles.filter((f) => !existingPaths.has(f)).map((f) => path.join(projectRoot, f));
  if (newFiles.length > 0) {
    const allEntries = adapter.listEntries();
    const { entries: newArtifacts, bindings } = discoverArtifacts(newFiles, allEntries, projectRoot);
    for (const art of newArtifacts) {
      adapter.saveEntry(art);
      allArtifacts.push(art);
    }
    for (const b of bindings) {
      adapter.saveBinding(b);
    }
    if (newArtifacts.length > 0 || bindings.length > 0) adapter.bumpCacheVersion();
  }

  // 2. Update fs meta for changed files
  const changedArtifacts = allArtifacts
    .filter((a) => changedFiles.includes(a.artifact.path))
    .map((a) => ({ ...a, artifact: { ...a.artifact } }));
  const now = new Date().toISOString();
  for (const art of changedArtifacts) {
    const fullPath = path.join(projectRoot, art.artifact.path);
    if (fs.existsSync(fullPath)) {
      const stat = fs.statSync(fullPath);
      art.artifact.fs = {
        last_modified_at: stat.mtime.toISOString(),
        last_seen_at: now,
        size_bytes: stat.size,
        exists: true,
      };
    } else {
      art.artifact.fs.exists = false;
      art.artifact.fs.last_seen_at = now;
    }
    adapter.saveEntry(art);
  }
  const missing = changedArtifacts.filter((a) => !a.artifact.fs.exists);
  adapter.bumpCacheVersion();

  // 3. Incremental dependency graph
  const { artifacts: updatedAll, bindings: depBindings, removedBindingIds } = updateDependencyGraphIncremental(changedArtifacts, allArtifacts, projectRoot);
  for (const art of updatedAll) {
    adapter.saveEntry(art);
  }
  let wroteAny = false;
  for (const b of depBindings) {
    adapter.saveBinding(b);
    wroteAny = true;
  }
  for (const removedId of removedBindingIds) {
    adapter.removeBinding(removedId.source, removedId.target);
    wroteAny = true;
  }
  if (wroteAny) adapter.bumpCacheVersion();

  // 4. Health analysis
  const entries = adapter.listEntries();
  const allBindings = adapter.listBindings();
  const config = adapter.getConfig();
  const healthReport = runHealthAnalysis(changedArtifacts, allBindings, entries, projectRoot, config ?? undefined);
  for (const art of healthReport.artifacts) {
    adapter.saveEntry(art);
  }
  adapter.bumpCacheVersion();

  return { artifacts: updatedAll, missing, depBindings };
}

export async function performFsScan(
  dirs: string[],
  projectRoot: string,
  adapter: StoreAdapter,
  opts: { silent?: boolean; updateTimestamp?: boolean; incremental?: boolean; changedFiles?: string[] } = {}
): Promise<void> {
  let artifacts: ArtifactEntry[];
  let missing: ArtifactEntry[];
  let depBindings: Binding[];

  if (opts.incremental && opts.changedFiles && opts.changedFiles.length > 0) {
    const result = await runIncrementalScan(opts.changedFiles, projectRoot, adapter, opts);
    artifacts = result.artifacts;
    missing = result.missing;
    depBindings = result.depBindings;
  } else {
    const reg = await stepRegisterArtifacts(dirs, projectRoot, adapter);
    artifacts = reg.artifacts;
    const meta = stepUpdateFsMeta(artifacts, dirs, projectRoot, adapter);
    artifacts = meta.artifacts;
    missing = meta.missing;
    const graph = await stepBuildDependencyGraph(artifacts, projectRoot, adapter);
    depBindings = graph.depBindings;
    stepHealthAnalysis(graph.updatedArtifacts, projectRoot, adapter);
  }

  await appendWalAsync(
    { type: 'fs_scan', dirs, missing_count: missing.length, dep_bindings: depBindings.length, incremental: !!opts.incremental, auto: opts.updateTimestamp ?? true },
    projectRoot
  );

  if (opts.updateTimestamp !== false) {
    touchLastScan(projectRoot);
  }

  if (!opts.silent) {
    console.error(`${opts.incremental ? 'Incremental' : 'Full'} scan ${dirs.join(', ')}.`);
    console.error(`Artifacts: ${artifacts.length}`);
    console.error(`Missing files: ${missing.length}`);
    console.error(`Dependency bindings created: ${depBindings.length}`);
  }
}
