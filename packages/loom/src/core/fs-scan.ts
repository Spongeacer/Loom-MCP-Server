import * as fs from 'node:fs';
import * as path from 'node:path';
import { getPaths } from './paths.js';
import { listEntries, listBindings, saveEntry, appendWal, invalidateCache } from './store.js';
import { updateArtifactsFs, scanProjectFiles } from './fs-tracker.js';
import { discoverArtifacts } from './binding-discovery.js';
import { buildDependencyGraph } from './dependency-graph.js';
import { runHealthAnalysis } from './health-analyzer.js';
import YAML from 'yaml';
import type { ArtifactEntry } from '../types/index.js';

const SCAN_COOLDOWN_MS = 5 * 60 * 1000; // 5 minutes

function getLastScanPath(projectRoot: string): string {
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
  let artifacts = listEntries(projectRoot).filter((e): e is ArtifactEntry => e.type === 'Artifact');
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
    const paths = getPaths(projectRoot);
    for (const b of bindings) {
      const bindingId = `${b.source}-${b.target}`;
      const bindingPath = path.join(paths.bindings, `${bindingId}.yml`);
      if (!fs.existsSync(bindingPath)) {
        fs.writeFileSync(bindingPath, YAML.stringify(b));
      }
    }
    if (newArtifacts.length > 0 || bindings.length > 0) invalidateCache(projectRoot);
  }
  return { artifacts, l0Bindings };
}

function stepUpdateFsMeta(artifacts: ArtifactEntry[], dirs: string[], projectRoot: string): { missing: ArtifactEntry[] } {
  const { missing } = updateArtifactsFs(artifacts, dirs, projectRoot);
  for (const art of artifacts) {
    saveEntry(art, projectRoot, true);
  }
  invalidateCache(projectRoot);
  return { missing };
}

async function stepBuildDependencyGraph(
  artifacts: ArtifactEntry[],
  projectRoot: string
): Promise<{ updatedArtifacts: ArtifactEntry[]; depBindings: import('../types/index.js').Binding[] }> {
  const { artifacts: updatedArtifacts, bindings: depBindings } = buildDependencyGraph(artifacts, projectRoot);
  for (const art of updatedArtifacts) {
    saveEntry(art, projectRoot, true);
  }

  const paths = getPaths(projectRoot);
  let wroteAny = false;
  for (const b of depBindings) {
    const bindingId = `${b.source}-${b.target}`;
    const bindingPath = path.join(paths.bindings, `${bindingId}.yml`);
    if (!fs.existsSync(bindingPath)) {
      fs.writeFileSync(bindingPath, YAML.stringify(b));
      wroteAny = true;
    }
  }
  if (wroteAny) invalidateCache(projectRoot);

  return { updatedArtifacts, depBindings };
}

function stepHealthAnalysis(artifacts: ArtifactEntry[], projectRoot: string): void {
  const entries = listEntries(projectRoot);
  const allBindings = listBindings(projectRoot);
  runHealthAnalysis(artifacts, allBindings, entries, projectRoot);
  for (const art of artifacts) {
    saveEntry(art, projectRoot, true);
  }
  invalidateCache(projectRoot);
}

export async function performFsScan(
  dirs: string[],
  projectRoot: string,
  opts: { silent?: boolean; updateTimestamp?: boolean } = {}
): Promise<void> {
  const { artifacts } = await stepRegisterArtifacts(dirs, projectRoot);
  const { missing } = stepUpdateFsMeta(artifacts, dirs, projectRoot);
  const { updatedArtifacts, depBindings } = await stepBuildDependencyGraph(artifacts, projectRoot);
  stepHealthAnalysis(updatedArtifacts, projectRoot);

  appendWal(
    { type: 'fs_scan', dirs, missing_count: missing.length, dep_bindings: depBindings.length, auto: opts.updateTimestamp ?? true },
    projectRoot
  );

  if (opts.updateTimestamp !== false) {
    touchLastScan(projectRoot);
  }

  if (!opts.silent) {
    console.log(`Scanned ${dirs.join(', ')}.`);
    console.log(`Artifacts: ${artifacts.length}`);
    console.log(`Missing files: ${missing.length}`);
    console.log(`Dependency bindings created: ${depBindings.length}`);
  }
}
