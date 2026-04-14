import * as fs from 'node:fs';
import * as path from 'node:path';
import { getPaths } from './paths.js';
import { listEntries, listBindings, saveEntry, appendWal } from './store.js';
import { updateArtifactsFs, scanProjectFiles } from './fs-tracker.js';
import { discoverArtifacts } from './binding-discovery.js';
import { buildDependencyGraph } from './dependency-graph.js';
import { runGarbageCollector } from './garbage-collector.js';
import type { ArtifactEntry } from '../types/index.js';

const SCAN_COOLDOWN_MS = 5 * 60 * 1000; // 5 minutes

export function getLastScanPath(projectRoot: string): string {
  return path.join(projectRoot, '.loom', 'cache', 'last-fs-scan.txt');
}

export function shouldAutoScan(projectRoot: string): boolean {
  const lastScanPath = getLastScanPath(projectRoot);
  if (!fs.existsSync(lastScanPath)) return true;
  const lastScan = new Date(fs.readFileSync(lastScanPath, 'utf-8').trim()).getTime();
  return Date.now() - lastScan > SCAN_COOLDOWN_MS;
}

export function touchLastScan(projectRoot: string): void {
  fs.writeFileSync(getLastScanPath(projectRoot), new Date().toISOString());
}

export async function performFsScan(
  dirs: string[],
  projectRoot: string,
  opts: { silent?: boolean; updateTimestamp?: boolean } = {}
): Promise<void> {
  let artifacts = listEntries(projectRoot).filter((e): e is ArtifactEntry => e.type === 'Artifact');

  // Register newly discovered files as artifacts
  const existingPaths = new Set(artifacts.map((a) => a.artifact.path));
  const allScannedFiles = scanProjectFiles(dirs, projectRoot);
  const newFiles = allScannedFiles.filter((f) => !existingPaths.has(f)).map((f) => path.join(projectRoot, f));

  if (newFiles.length > 0) {
    const allEntries = listEntries(projectRoot);
    const { entries: newArtifacts, bindings: l0Bindings } = discoverArtifacts(newFiles, allEntries, projectRoot);
    for (const art of newArtifacts) {
      saveEntry(art, projectRoot);
      artifacts.push(art);
    }
    const paths = getPaths(projectRoot);
    const YAML = (await import('yaml')).default;
    for (const b of l0Bindings) {
      const bindingId = `${b.source}-${b.target}`;
      const bindingPath = path.join(paths.bindings, `${bindingId}.yml`);
      if (!fs.existsSync(bindingPath)) {
        fs.writeFileSync(bindingPath, YAML.stringify(b));
      }
      const sourceEntry = listEntries(projectRoot).find((e) => e.id === b.source);
      if (sourceEntry && !sourceEntry.bindings_out.find((bo) => bo.target === b.target)) {
        sourceEntry.bindings_out.push({ target: b.target, rel: b.relationship, conf: b.confidence });
        saveEntry(sourceEntry, projectRoot);
      }
    }
  }

  const { missing } = updateArtifactsFs(artifacts, dirs, projectRoot);
  for (const art of artifacts) {
    saveEntry(art, projectRoot);
  }

  // Build dependency graph
  const { artifacts: updatedArtifacts, bindings: depBindings } = buildDependencyGraph(artifacts, projectRoot);
  for (const art of updatedArtifacts) {
    saveEntry(art, projectRoot);
  }

  const paths = getPaths(projectRoot);
  const YAML = (await import('yaml')).default;
  for (const b of depBindings) {
    const bindingId = `${b.source}-${b.target}`;
    const bindingPath = path.join(paths.bindings, `${bindingId}.yml`);
    if (!fs.existsSync(bindingPath)) {
      fs.writeFileSync(bindingPath, YAML.stringify(b));
    }
  }

  // Run garbage collector
  const entries = listEntries(projectRoot);
  const allBindings = listBindings(projectRoot);
  runGarbageCollector(updatedArtifacts, allBindings, entries, projectRoot);
  for (const art of updatedArtifacts) {
    saveEntry(art, projectRoot);
  }

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
