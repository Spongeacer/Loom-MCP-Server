import * as fs from 'node:fs';
import * as path from 'node:path';
import { execSync } from 'node:child_process';
import YAML from 'yaml';
import { getPaths } from './paths.js';
import { appendWalAsync } from './wal-queue.js';

export interface DirtySet {
  files: string[];
  artifacts: string[];
  needs_dependency_scan: boolean;
  last_known_commit?: string | null;
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
      last_known_commit: getCurrentCommit(cwd),
    };
  }
  return YAML.parse(fs.readFileSync(p, 'utf-8')) as DirtySet;
}

export function writeDirtySet(ds: DirtySet, cwd?: string): void {
  fs.writeFileSync(dirtySetPath(cwd), YAML.stringify(ds));
}

export function clearDirtySet(cwd?: string): void {
  const ds = readDirtySet(cwd);
  ds.files = [];
  ds.artifacts = [];
  ds.needs_dependency_scan = false;
  writeDirtySet(ds, cwd);
}

export function markArtifactDirty(
  filePath: string,
  artifactId?: string,
  cwd?: string
): void {
  const projectRoot = cwd || process.cwd();
  const rel = path.relative(projectRoot, path.resolve(projectRoot, filePath)).replace(/\\/g, '/');
  const ds = readDirtySet(projectRoot);
  if (!ds.files.includes(rel)) ds.files.push(rel);
  if (artifactId && !ds.artifacts.includes(artifactId)) ds.artifacts.push(artifactId);
  ds.needs_dependency_scan = true;
  writeDirtySet(ds, projectRoot);
  appendWalAsync({ type: 'artifact_dirty', path: rel, artifact_id: artifactId }, projectRoot).catch(() => {});
}

export function getCurrentCommit(projectRoot?: string): string | null {
  try {
    return execSync('git rev-parse HEAD', {
      cwd: projectRoot || process.cwd(),
      encoding: 'utf-8',
    }).trim();
  } catch {
    return null;
  }
}

export function detectGitChanges(projectRoot?: string): string[] {
  const root = projectRoot || process.cwd();
  const changed = new Set<string>();

  try {
    const status = execSync('git status --short', {
      cwd: root,
      encoding: 'utf-8',
    }).trim();
    for (const line of status.split('\n').filter(Boolean)) {
      const file = line.slice(3).trim();
      if (file) changed.add(file);
    }
  } catch {
    // Not a git repo or git unavailable
  }

  try {
    const ds = readDirtySet(root);
    const lastCommit = ds.last_known_commit;
    const currentCommit = getCurrentCommit(root);
    ds.last_known_commit = currentCommit;
    writeDirtySet(ds, root);

    if (lastCommit && currentCommit && lastCommit !== currentCommit) {
      const diff = execSync(`git diff --name-only ${lastCommit} ${currentCommit}`, {
        cwd: root,
        encoding: 'utf-8',
      }).trim();
      for (const file of diff.split('\n').filter(Boolean)) {
        changed.add(file);
      }
    }
  } catch {
    // ignore git errors
  }

  return Array.from(changed);
}

export function syncDirtyFromGit(projectRoot?: string): boolean {
  const root = projectRoot || process.cwd();
  const gitChanges = detectGitChanges(root);
  if (gitChanges.length === 0) return false;

  const ds = readDirtySet(root);
  for (const file of gitChanges) {
    if (!ds.files.includes(file)) ds.files.push(file);
  }
  ds.needs_dependency_scan = true;
  writeDirtySet(ds, root);
  return true;
}
