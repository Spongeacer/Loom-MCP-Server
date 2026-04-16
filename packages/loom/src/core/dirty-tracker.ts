import * as fs from 'node:fs';
import * as path from 'node:path';
import { execSync, execFileSync } from 'node:child_process';
import YAML from 'yaml';
import { getPaths } from './paths.js';
import { appendWalAsync } from './wal-queue.js';
import { listEntries } from './store.js';
import type { ArtifactEntry } from '../types/index.js';

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

function writeDirtySet(ds: DirtySet, cwd?: string): void {
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

function getCurrentCommit(projectRoot?: string): string | null {
  try {
    return execSync('git rev-parse HEAD', {
      cwd: projectRoot || process.cwd(),
      encoding: 'utf-8',
    }).trim();
  } catch {
    return null;
  }
}

function detectGitChanges(projectRoot?: string): { changes: string[]; currentCommit: string | null } {
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

  let currentCommit: string | null = null;
  try {
    currentCommit = getCurrentCommit(root);
    const ds = readDirtySet(root);
    const lastCommit = ds.last_known_commit;

    if (lastCommit && currentCommit && lastCommit !== currentCommit) {
      const diff = execFileSync('git', ['diff', '--name-only', lastCommit, currentCommit], {
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

  return { changes: Array.from(changed), currentCommit };
}

function mtimeSnapshotPath(projectRoot?: string): string {
  return path.join(getPaths(projectRoot).cache, 'last-known-mtimes.json');
}

function detectMtimeChanges(projectRoot?: string): string[] {
  const root = projectRoot || process.cwd();
  const artifacts = listEntries(root).filter((e): e is ArtifactEntry => e.type === 'Artifact');
  const snapshotPath = mtimeSnapshotPath(root);
  const previous: Record<string, string> = fs.existsSync(snapshotPath)
    ? JSON.parse(fs.readFileSync(snapshotPath, 'utf-8'))
    : {};

  const changed: string[] = [];
  const current: Record<string, string> = {};

  for (const art of artifacts) {
    const p = path.join(root, art.artifact.path);
    let mtime: string;
    try {
      const stat = fs.statSync(p);
      mtime = stat.mtimeMs.toString();
    } catch {
      mtime = 'missing';
    }
    current[art.artifact.path] = mtime;
    if (previous[art.artifact.path] !== mtime) {
      changed.push(art.artifact.path);
    }
  }

  fs.writeFileSync(snapshotPath, JSON.stringify(current, null, 2));
  return changed;
}

export function syncDirtyFromGit(projectRoot?: string): boolean {
  const root = projectRoot || process.cwd();

  // Try Git first (zero-cost, most accurate)
  let changes: string[];
  let currentCommit: string | null = null;
  try {
    const gitResult = detectGitChanges(root);
    changes = gitResult.changes;
    currentCommit = gitResult.currentCommit;
  } catch {
    changes = [];
  }

  // Fallback to mtime polling for non-Git users or Git failures
  if (changes.length === 0) {
    try {
      changes = detectMtimeChanges(root);
    } catch {
      changes = [];
    }
  }

  const ds = readDirtySet(root);
  let needsWrite = false;
  for (const file of changes) {
    if (!ds.files.includes(file)) {
      ds.files.push(file);
      needsWrite = true;
    }
  }
  if (!ds.needs_dependency_scan && (changes.length > 0 || needsWrite)) {
    ds.needs_dependency_scan = true;
    needsWrite = true;
  }
  if (currentCommit !== undefined && ds.last_known_commit !== currentCommit) {
    ds.last_known_commit = currentCommit;
    needsWrite = true;
  }
  if (needsWrite) {
    writeDirtySet(ds, root);
  }
  return changes.length > 0;
}
