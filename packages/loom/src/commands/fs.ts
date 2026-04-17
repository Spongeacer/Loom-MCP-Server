import * as fs from 'node:fs';
import * as path from 'node:path';
import { getConfig, listEntries, listBindings, saveEntry, invalidateCache } from '../core/store.js';
import { appendWalAsync } from '../core/wal-queue.js';
import { withFileLockSync } from '../core/lock.js';
import { performFsScanInWorker } from '../core/fs-scan.js';
import { runHealthAnalysis } from '../core/health-analyzer.js';
import { markArtifactDirty } from '../core/dirty-tracker.js';
import { resolveProjectRoot } from '../core/paths.js';
import { DEFAULT_FS_SCAN_DIRS, CLI_FS_SCAN_TIMEOUT_MS, FS_CLEAN_LOCK_TIMEOUT_MS } from '../core/constants.js';
import type { ArtifactEntry } from '../types/index.js';

function assertInitialized(): void {
  if (!getConfig()) {
    throw new Error('LOOM not initialized. Run: .loom init <project-name>');
  }
}

function getArtifacts(): ArtifactEntry[] {
  return listEntries().filter((e): e is ArtifactEntry => e.type === 'Artifact');
}

function isWithin(parent: string, child: string): boolean {
  const rel = path.relative(parent, child);
  return rel !== '' && !rel.startsWith('..') && !path.isAbsolute(rel);
}

function resolveSafePath(projectRoot: string, relativePath: string): string | null {
  const normalized = path.normalize(relativePath);
  if (path.isAbsolute(normalized)) return null;
  // Reject paths that escape the project root
  const parts = normalized.split(path.sep);
  if (parts.some((p) => p === '..')) return null;
  const resolved = path.resolve(projectRoot, normalized);
  if (!isWithin(projectRoot, resolved)) return null;
  return resolved;
}

function isWithinProject(projectRoot: string, dir: string): boolean {
  const resolved = path.resolve(projectRoot, dir);
  const rel = path.relative(projectRoot, resolved);
  return rel !== '' && !rel.startsWith('..') && !path.isAbsolute(rel);
}

export async function runFsScan(args: string[]): Promise<string> {
  assertInitialized();
  const projectRoot = resolveProjectRoot();
  const dirs = (args.length > 0 ? args : DEFAULT_FS_SCAN_DIRS).filter((d) => isWithinProject(projectRoot, d));
  await performFsScanInWorker(dirs.length > 0 ? dirs : DEFAULT_FS_SCAN_DIRS, projectRoot, { silent: false, updateTimestamp: true, timeoutMs: CLI_FS_SCAN_TIMEOUT_MS });
  return `FS scan completed for: ${dirs.join(', ')}`;
}

export function runFsDeps(args: string[]): string {
  assertInitialized();
  const filePath = args[0];
  if (!filePath) {
    throw new Error('Usage: .loom fs deps <path>');
  }
  const artifacts = getArtifacts();
  const art = artifacts.find((a) => a.artifact.path === filePath || a.id === filePath);
  if (!art) {
    throw new Error(`No artifact found for: ${filePath}`);
  }
  const lines: string[] = [];
  lines.push(`Artifact: ${art.artifact.path} (${art.id})`);
  lines.push(`Imports (${art.artifact.deps.imports.length}):`);
  for (const imp of art.artifact.deps.imports) {
    lines.push(`  → ${imp}`);
  }
  lines.push(`Imported by (${art.artifact.deps.imported_by.length}):`);
  for (const by of art.artifact.deps.imported_by) {
    lines.push(`  ← ${by}`);
  }
  return lines.join('\n');
}

export function runFsHealth(): string {
  assertInitialized();
  const projectRoot = resolveProjectRoot();
  const artifacts = getArtifacts();
  const entries = listEntries();
  const bindings = listBindings();
  const config = getConfig();
  const report = runHealthAnalysis(artifacts, bindings, entries, projectRoot, config ?? undefined);

  for (const art of report.artifacts) {
    saveEntry(art, undefined, true);
  }
  invalidateCache();

  const lines: string[] = [];
  lines.push('=== File Health Report ===');
  for (const [status, items] of Object.entries(report.byStatus)) {
    if (items.length === 0) continue;
    lines.push(`\n[${status.toUpperCase()}] ${items.length} file(s)`);
    for (const art of items.slice(0, 20)) {
      const h = art.artifact.health;
      lines.push(`  ↣${art.id}: ${art.artifact.path} score=${(h.score * 100).toFixed(0)}% action=${h.suggested_action}`);
      if (h.reasons.length) {
        lines.push(`      reasons: ${h.reasons.join('; ')}`);
      }
    }
    if (items.length > 20) {
      lines.push(`      ... and ${items.length - 20} more`);
    }
  }
  return lines.join('\n');
}

export function runFsTrash(): string {
  assertInitialized();
  const projectRoot = resolveProjectRoot();
  const artifacts = getArtifacts();
  const entries = listEntries();
  const bindings = listBindings();
  const config = getConfig();
  const report = runHealthAnalysis(artifacts, bindings, entries, projectRoot, config ?? undefined);

  if (report.trashCandidates.length === 0) {
    return 'No trash candidates found.';
  }

  const lines: string[] = [];
  lines.push('=== Trash Candidates ===');
  for (const art of report.trashCandidates) {
    const h = art.artifact.health;
    lines.push(`[${h.suggested_action.toUpperCase()}] ${art.artifact.path} (${h.status})`);
    lines.push(`  reasons: ${h.reasons.join('; ')}`);
  }
  return lines.join('\n');
}

export async function runFsClean(): Promise<string> {
  assertInitialized();
  const projectRoot = resolveProjectRoot();
  let archived = 0;
  let deleted = 0;
  const logLines: string[] = [];

  withFileLockSync(
    projectRoot,
    'store',
    () => {
      const artifacts = getArtifacts();
      const entries = listEntries();
      const bindings = listBindings();
      const config = getConfig();
      const report = runHealthAnalysis(artifacts, bindings, entries, projectRoot, config ?? undefined);

      const toArchive = report.trashCandidates.filter((a) => a.artifact.health.suggested_action === 'archive');
      const toDelete = report.trashCandidates.filter((a) => a.artifact.health.suggested_action === 'delete');
      archived = toArchive.length;
      deleted = toDelete.length;

      const trashDir = path.join(projectRoot, '.loom', 'trash');
      if (!fs.existsSync(trashDir)) {
        fs.mkdirSync(trashDir, { recursive: true });
      }

      for (const art of toArchive) {
        const src = resolveSafePath(projectRoot, art.artifact.path);
        if (!src) {
          logLines.push(`Skipping unsafe path: ${art.artifact.path}`);
          archived--;
          continue;
        }
        const rel = path.relative(projectRoot, src);
        const dest = path.join(trashDir, rel);
        if (!isWithin(trashDir, dest)) {
          logLines.push(`Skipping unsafe trash path: ${art.artifact.path}`);
          archived--;
          continue;
        }
        const destDir = path.dirname(dest);
        if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true });
        if (fs.existsSync(src)) {
          fs.renameSync(src, dest);
          art.artifact.fs.exists = false;
          art.artifact.health.status = 'missing';
          art.artifact.health.suggested_action = 'delete';
          saveEntry(art, projectRoot, true);
          markArtifactDirty(art.artifact.path, art.id);
          logLines.push(`Archived: ${art.artifact.path} -> .loom/trash/${art.artifact.path}`);
        } else {
          archived--;
        }
      }

      for (const art of toDelete) {
        const src = resolveSafePath(projectRoot, art.artifact.path);
        if (!src) {
          logLines.push(`Skipping unsafe path: ${art.artifact.path}`);
          deleted--;
          continue;
        }
        if (fs.existsSync(src)) {
          fs.unlinkSync(src);
          art.artifact.fs.exists = false;
          saveEntry(art, projectRoot, true);
          markArtifactDirty(art.artifact.path, art.id);
          logLines.push(`Deleted: ${art.artifact.path}`);
        } else {
          deleted--;
        }
      }

      invalidateCache(projectRoot);
    },
    FS_CLEAN_LOCK_TIMEOUT_MS
  );

  await appendWalAsync({ type: 'fs_clean', archived, deleted }, projectRoot);
  logLines.push(`\nClean complete. Archived: ${archived}, Deleted: ${deleted}`);
  return logLines.join('\n');
}
