import * as path from 'node:path';
import { getPaths } from './paths.js';
import { withFileLockSync } from './utils/lock.js';
import { FILE_LOCK_TIMEOUT_MS } from './constants.js';
import { readTextFile, atomicWriteFile } from './utils/fs-safe.js';
import { parseYaml, stringifyYaml } from './utils/yaml.js';

export interface DirtySet {
  files: string[];
  artifacts: string[];
  needs_dependency_scan: boolean;
}

const DEFAULT_DIRTY_SET: DirtySet = {
  files: [],
  artifacts: [],
  needs_dependency_scan: false,
};

function dirtySetPath(cwd?: string): string {
  return path.join(getPaths(cwd).cache, 'dirty-set.yml');
}

function readDirtySetRaw(cwd?: string): DirtySet {
  const raw = readTextFile(dirtySetPath(cwd));
  if (!raw) return { ...DEFAULT_DIRTY_SET };
  return parseYaml<DirtySet>(raw, { ...DEFAULT_DIRTY_SET });
}

function writeDirtySet(ds: DirtySet, cwd?: string): void {
  atomicWriteFile(dirtySetPath(cwd), stringifyYaml(ds));
}

export function readDirtySet(cwd?: string): DirtySet {
  return readDirtySetRaw(cwd);
}

export function clearDirtySet(cwd?: string): void {
  const projectRoot = cwd ?? process.cwd();
  withFileLockSync(
    projectRoot,
    'dirty-set',
    () => {
      writeDirtySet({ files: [], artifacts: [], needs_dependency_scan: false }, projectRoot);
    },
    5000
  );
}

export function removeFromDirtySet(files: string[], artifacts: string[], cwd?: string): void {
  const projectRoot = cwd ?? process.cwd();
  withFileLockSync(
    projectRoot,
    'dirty-set',
    () => {
      const ds = readDirtySetRaw(projectRoot);
      const fileSet = new Set(files.map((f) => path.relative(projectRoot, path.resolve(projectRoot, f)).replace(/\\/g, '/')));
      const artifactSet = new Set(artifacts);
      ds.files = ds.files.filter((f) => !fileSet.has(f));
      ds.artifacts = ds.artifacts.filter((a) => !artifactSet.has(a));
      if (ds.files.length === 0) {
        ds.needs_dependency_scan = false;
      }
      writeDirtySet(ds, projectRoot);
    },
    FILE_LOCK_TIMEOUT_MS
  );
}

export function markArtifactDirty(filePath: string, artifactId?: string, cwd?: string): void {
  const projectRoot = cwd ?? process.cwd();
  const rel = path.relative(projectRoot, path.resolve(projectRoot, filePath)).replace(/\\/g, '/');
  withFileLockSync(
    projectRoot,
    'dirty-set',
    () => {
      const ds = readDirtySetRaw(projectRoot);
      if (!ds.files.includes(rel)) ds.files.push(rel);
      if (artifactId && !ds.artifacts.includes(artifactId)) ds.artifacts.push(artifactId);
      ds.needs_dependency_scan = true;
      writeDirtySet(ds, projectRoot);
    },
    FILE_LOCK_TIMEOUT_MS
  );
}
