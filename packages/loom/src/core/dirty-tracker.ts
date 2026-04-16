import * as fs from 'node:fs';
import * as path from 'node:path';
import YAML from 'yaml';
import { getPaths } from './paths.js';
import { withFileLockSync } from './lock.js';
import { appendWalAsync } from './wal-queue.js';

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
  return YAML.parse(fs.readFileSync(p, 'utf-8')) as DirtySet;
}

function writeDirtySet(ds: DirtySet, cwd?: string): void {
  fs.writeFileSync(dirtySetPath(cwd), YAML.stringify(ds));
}

export function clearDirtySet(cwd?: string): void {
  const projectRoot = cwd || process.cwd();
  withFileLockSync(
    projectRoot,
    'dirty-set',
    () => {
      writeDirtySet({ files: [], artifacts: [], needs_dependency_scan: false }, projectRoot);
    },
    5000
  );
}

export function markArtifactDirty(
  filePath: string,
  artifactId?: string,
  cwd?: string
): void {
  const projectRoot = cwd || process.cwd();
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
    5000
  );
  appendWalAsync({ type: 'artifact_dirty', path: rel, artifact_id: artifactId }, projectRoot).catch(() => {});
}
