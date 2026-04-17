import * as fs from 'node:fs';
import * as path from 'node:path';
import { fork } from 'node:child_process';
import { listEntries, listBindings, saveEntry, saveBinding, removeBinding, appendWalAsync, invalidateCache, getConfig } from './store.js';
import { updateArtifactsFs, scanProjectFiles } from './fs-tracker.js';
import { discoverArtifacts } from './binding-discovery.js';
import { buildDependencyGraph, updateDependencyGraphIncremental } from './dependency-graph.js';
import { runHealthAnalysis } from './health-analyzer.js';
import type { ArtifactEntry } from '../types/index.js';

import { SCAN_COOLDOWN_MS, FS_SCAN_WORKER_TIMEOUT_MS } from './constants.js';

export function getLastScanPath(projectRoot: string): string {
  return path.join(projectRoot, '.loom', 'cache', 'last-fs-scan.txt');
}

export function shouldAutoScan(projectRoot: string): boolean {
  const lastScanPath = getLastScanPath(projectRoot);
  if (!fs.existsSync(lastScanPath)) return true;
  const lastScan = new Date(fs.readFileSync(lastScanPath, 'utf-8').trim()).getTime();
  return Date.now() - lastScan > SCAN_COOLDOWN_MS;
}

function touchLastScan(projectRoot: string): void {
  fs.writeFileSync(getLastScanPath(projectRoot), new Date().toISOString());
}

async function stepRegisterArtifacts(
  dirs: string[],
  projectRoot: string
): Promise<{ artifacts: ArtifactEntry[]; l0Bindings: import('../types/index.js').Binding[] }> {
  const artifacts = listEntries(projectRoot).filter((e): e is ArtifactEntry => e.type === 'Artifact');
  const existingPaths = new Set(artifacts.map((a) => a.artifact.path));
  const allScannedFiles = scanProjectFiles(dirs, projectRoot);
  const newFiles = allScannedFiles.filter((f) => !existingPaths.has(f)).map((f) => path.join(projectRoot, f));

  const l0Bindings: import('../types/index.js').Binding[] = [];
  if (newFiles.length > 0) {
    const allEntries = listEntries(projectRoot);
    const { entries: newArtifacts, bindings } = discoverArtifacts(newFiles, allEntries, projectRoot);
    for (const art of newArtifacts) {
      saveEntry(art, projectRoot, true);
      artifacts.push(art);
    }
    l0Bindings.push(...bindings);
    for (const b of bindings) {
      saveBinding(b, projectRoot);
    }
    if (newArtifacts.length > 0 || bindings.length > 0) invalidateCache(projectRoot);
  }
  return { artifacts, l0Bindings };
}

function stepUpdateFsMeta(artifacts: ArtifactEntry[], dirs: string[], projectRoot: string): { artifacts: ArtifactEntry[]; missing: ArtifactEntry[] } {
  const { artifacts: updated, missing } = updateArtifactsFs(artifacts, dirs, projectRoot);
  for (const art of updated) {
    saveEntry(art, projectRoot, true);
  }
  invalidateCache(projectRoot);
  return { artifacts: updated, missing };
}

async function stepBuildDependencyGraph(
  artifacts: ArtifactEntry[],
  projectRoot: string
): Promise<{ updatedArtifacts: ArtifactEntry[]; depBindings: import('../types/index.js').Binding[] }> {
  const { artifacts: updatedArtifacts, bindings: depBindings } = buildDependencyGraph(artifacts, projectRoot);
  for (const art of updatedArtifacts) {
    saveEntry(art, projectRoot, true);
  }

  let wroteAny = false;
  for (const b of depBindings) {
    saveBinding(b, projectRoot);
    wroteAny = true;
  }
  if (wroteAny) invalidateCache(projectRoot);

  return { updatedArtifacts, depBindings };
}

function stepHealthAnalysis(artifacts: ArtifactEntry[], projectRoot: string): void {
  const entries = listEntries(projectRoot);
  const allBindings = listBindings(projectRoot);
  const config = getConfig(projectRoot);
  const report = runHealthAnalysis(artifacts, allBindings, entries, projectRoot, config ?? undefined);
  for (const art of report.artifacts) {
    saveEntry(art, projectRoot, true);
  }
  invalidateCache(projectRoot);
}

async function runIncrementalScan(
  changedFiles: string[],
  projectRoot: string,
  _opts: { silent?: boolean } = {}
): Promise<{ artifacts: ArtifactEntry[]; missing: ArtifactEntry[]; depBindings: import('../types/index.js').Binding[] }> {
  const allArtifacts = listEntries(projectRoot).filter((e): e is ArtifactEntry => e.type === 'Artifact');

  // 1. Register new artifacts from changed files only
  const existingPaths = new Set(allArtifacts.map((a) => a.artifact.path));
  const newFiles = changedFiles.filter((f) => !existingPaths.has(f)).map((f) => path.join(projectRoot, f));
  if (newFiles.length > 0) {
    const allEntries = listEntries(projectRoot);
    const { entries: newArtifacts, bindings } = discoverArtifacts(newFiles, allEntries, projectRoot);
    for (const art of newArtifacts) {
      saveEntry(art, projectRoot, true);
      allArtifacts.push(art);
    }
    for (const b of bindings) {
      saveBinding(b, projectRoot);
    }
    if (newArtifacts.length > 0 || bindings.length > 0) invalidateCache(projectRoot);
  }

  // 2. Update fs meta for changed files only
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
    saveEntry(art, projectRoot, true);
  }
  const missing = changedArtifacts.filter((a) => !a.artifact.fs.exists);
  invalidateCache(projectRoot);

  // 3. Incremental dependency graph
  const { artifacts: updatedAll, bindings: depBindings, removedBindingIds } = updateDependencyGraphIncremental(changedArtifacts, allArtifacts, projectRoot);
  for (const art of updatedAll) {
    saveEntry(art, projectRoot, true);
  }
  let wroteAny = false;
  for (const b of depBindings) {
    saveBinding(b, projectRoot);
    wroteAny = true;
  }
  for (const removedId of removedBindingIds) {
    removeBinding(removedId.source, removedId.target, projectRoot);
    wroteAny = true;
  }
  if (wroteAny) invalidateCache(projectRoot);

  // 4. Health analysis for changed artifacts only
  const entries = listEntries(projectRoot);
  const allBindings = listBindings(projectRoot);
  const config = getConfig(projectRoot);
  const healthReport = runHealthAnalysis(changedArtifacts, allBindings, entries, projectRoot, config ?? undefined);
  for (const art of healthReport.artifacts) {
    saveEntry(art, projectRoot, true);
  }
  invalidateCache(projectRoot);

  return { artifacts: updatedAll, missing, depBindings };
}

export async function performFsScan(
  dirs: string[],
  projectRoot: string,
  opts: { silent?: boolean; updateTimestamp?: boolean; incremental?: boolean; changedFiles?: string[] } = {}
): Promise<void> {
  let artifacts: ArtifactEntry[];
  let missing: ArtifactEntry[];
  let depBindings: import('../types/index.js').Binding[];

  if (opts.incremental && opts.changedFiles && opts.changedFiles.length > 0) {
    const result = await runIncrementalScan(opts.changedFiles, projectRoot, opts);
    artifacts = result.artifacts;
    missing = result.missing;
    depBindings = result.depBindings;
  } else {
    const reg = await stepRegisterArtifacts(dirs, projectRoot);
    artifacts = reg.artifacts;
    const meta = stepUpdateFsMeta(artifacts, dirs, projectRoot);
    artifacts = meta.artifacts;
    missing = meta.missing;
    const graph = await stepBuildDependencyGraph(artifacts, projectRoot);
    depBindings = graph.depBindings;
    stepHealthAnalysis(graph.updatedArtifacts, projectRoot);
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

export function performFsScanInWorker(
  dirs: string[],
  projectRoot: string,
  opts: { silent?: boolean; updateTimestamp?: boolean; timeoutMs?: number } = {}
): Promise<void> {
  // Resolve worker script: prefer local development paths, then fall back to
  // the globally-installed package directory (__dirname) so that global npm
  // installs work out of the box.
  const candidates = [
    path.resolve(projectRoot, 'packages/loom/dist/core/fs-scan-worker.js'),
    path.resolve(projectRoot, 'dist/core/fs-scan-worker.js'),
    path.join(__dirname, 'fs-scan-worker.js'),
  ];
  const actualScript = candidates.find((p) => fs.existsSync(p));

  if (!actualScript) {
    // Fallback to in-process scan if worker script is missing
    return performFsScan(dirs, projectRoot, opts);
  }

  return new Promise((resolve, reject) => {
    const child = fork(actualScript, [JSON.stringify(dirs), projectRoot], {
      detached: false,
      stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
    });

    let stdout = '';
    let stderr = '';
    let settled = false;

    child.stdout?.on('data', (d) => {
      stdout += d;
    });
    child.stderr?.on('data', (d) => {
      stderr += d;
    });

    const timeoutMs = opts.timeoutMs ?? FS_SCAN_WORKER_TIMEOUT_MS;
    const timeout = setTimeout(() => {
      child.kill('SIGTERM');
      if (!settled) {
        settled = true;
        reject(new Error(`FS scan worker timed out after ${timeoutMs}ms`));
      }
    }, timeoutMs);

    child.on('message', (msg: any) => {
      clearTimeout(timeout);
      if (!settled) {
        settled = true;
        if (msg?.success) {
          if (!opts.silent && stdout) console.error(stdout);
          if (stderr) console.error(stderr);
          resolve();
        } else {
          reject(new Error(msg?.error || 'FS scan worker failed'));
        }
      }
    });

    child.on('exit', (code) => {
      clearTimeout(timeout);
      if (!settled) {
        settled = true;
        if (code !== 0) {
          reject(new Error(`FS scan worker exited with code ${code}. stderr: ${stderr}`));
        } else {
          resolve();
        }
      }
    });

    child.on('error', (err) => {
      clearTimeout(timeout);
      if (!settled) {
        settled = true;
        reject(err);
      }
    });
  });
}
