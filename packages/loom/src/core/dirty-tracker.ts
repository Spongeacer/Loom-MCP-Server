import * as fs from 'node:fs';
import * as path from 'node:path';
import YAML from 'yaml';
import { getPaths, resolveProjectRoot } from './paths.js';
import { withFileLockSync } from './lock.js';
import { appendWalAsync } from './wal-queue.js';
import { FILE_LOCK_TIMEOUT_MS } from './constants.js';

export interface DirtySet {
  files: string[];
  artifacts: string[];
  needs_dependency_scan: boolean;
}

function dirtySetPath(cwd?: string): string {
  return path.join(getPaths(cwd).cache, 'dirty-set.yml');
}

export function readDirtySet(cwd?: string): DirtySet {
  const p = dirtySetPath(cwd);
  if (!fs.existsSync(p)) {
    return {
      files: [],
      artifacts: [],
      needs_dependency_scan: false,
    };
  }
  const parsed = YAML.parse(fs.readFileSync(p, 'utf-8')) as DirtySet | null;
  if (!parsed) {
    return {
      files: [],
      artifacts: [],
      needs_dependency_scan: false,
    };
  }
  return parsed;
}

function writeDirtySet(ds: DirtySet, cwd?: string): void {
  fs.writeFileSync(dirtySetPath(cwd), YAML.stringify(ds));
}

export function clearDirtySet(cwd?: string): void {
  const projectRoot = resolveProjectRoot(cwd);
  withFileLockSync(
    projectRoot,
    'dirty-set',
    () => {
      writeDirtySet({ files: [], artifacts: [], needs_dependency_scan: false }, projectRoot);
    },
    5000
  );
}

export function removeFromDirtySet(
  files: string[],
  artifacts: string[],
  cwd?: string
): void {
  const projectRoot = resolveProjectRoot(cwd);
  withFileLockSync(
    projectRoot,
    'dirty-set',
    () => {
      const ds = readDirtySet(projectRoot);
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

export function markArtifactDirty(
  filePath: string,
  artifactId?: string,
  cwd?: string
): void {
  const projectRoot = resolveProjectRoot(cwd);
  const rel = path.relative(projectRoot, path.resolve(projectRoot, filePath)).replace(/\\/g, '/');
  withFileLockSync(
    projectRoot,
    'dirty-set',
    () => {
      const ds = readDirtySet(projectRoot);
      if (!ds.files.includes(rel)) ds.files.push(rel);
      if (artifactId && !ds.artifacts.includes(artifactId)) ds.artifacts.push(artifactId);
      ds.needs_dependency_scan = true;
      writeDirtySet(ds, projectRoot);
    },
    FILE_LOCK_TIMEOUT_MS
  );
  appendWalAsync({ type: 'artifact_dirty', path: rel, artifact_id: artifactId }, projectRoot).catch(() => {});
}
