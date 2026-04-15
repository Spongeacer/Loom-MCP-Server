import * as fs from 'node:fs';
import * as path from 'node:path';
import { getConfig, listEntries, listBindings, saveEntry, appendWal } from '../core/store.js';
import { performFsScan } from '../core/fs-scan.js';
import { runHealthAnalysis } from '../core/health-analyzer.js';
import { markArtifactDirty } from '../core/dirty-tracker.js';
import type { ArtifactEntry } from '../types/index.js';

function assertInitialized() {
  if (!getConfig()) {
    console.log('LOOM not initialized. Run:.loom init <project-name>');
    process.exit(1);
  }
}

function getArtifacts(): ArtifactEntry[] {
  return listEntries().filter((e): e is ArtifactEntry => e.type === 'Artifact');
}

function resolveSafePath(projectRoot: string, relativePath: string): string | null {
  const resolved = path.resolve(projectRoot, relativePath);
  const rootResolved = path.resolve(projectRoot);
  const prefix = rootResolved + path.sep;
  if (resolved !== rootResolved && !resolved.startsWith(prefix)) {
    return null;
  }
  return resolved;
}

export async function runFsScan(args: string[]): Promise<void> {
  assertInitialized();
  const dirs = args.length > 0 ? args : ['src', 'tests'];
  await performFsScan(dirs, process.cwd(), { silent: false, updateTimestamp: true });
}

export function runFsDeps(args: string[]): void {
  assertInitialized();
  const filePath = args[0];
  if (!filePath) {
    console.log('Usage:.loom fs deps <path>');
    return;
  }
  const artifacts = getArtifacts();
  const art = artifacts.find((a) => a.artifact.path === filePath || a.id === filePath);
  if (!art) {
    console.log(`No artifact found for: ${filePath}`);
    return;
  }
  console.log(`Artifact: ${art.artifact.path} (${art.id})`);
  console.log(`Imports (${art.artifact.deps.imports.length}):`);
  for (const imp of art.artifact.deps.imports) {
    console.log(`  → ${imp}`);
  }
  console.log(`Imported by (${art.artifact.deps.imported_by.length}):`);
  for (const by of art.artifact.deps.imported_by) {
    console.log(`  ← ${by}`);
  }
}

export function runFsHealth(): void {
  assertInitialized();
  const artifacts = getArtifacts();
  const entries = listEntries();
  const bindings = listBindings();
  const report = runHealthAnalysis(artifacts, bindings, entries, process.cwd());

  for (const art of report.artifacts) {
    saveEntry(art);
  }

  console.log('=== File Health Report ===');
  for (const [status, items] of Object.entries(report.byStatus)) {
    if (items.length === 0) continue;
    console.log(`\n[${status.toUpperCase()}] ${items.length} file(s)`);
    for (const art of items.slice(0, 20)) {
      const h = art.artifact.health;
      console.log(`  ↣${art.id}: ${art.artifact.path} score=${(h.score * 100).toFixed(0)}% action=${h.suggested_action}`);
      if (h.reasons.length) {
        console.log(`      reasons: ${h.reasons.join('; ')}`);
      }
    }
    if (items.length > 20) {
      console.log(`      ... and ${items.length - 20} more`);
    }
  }
}

export function runFsTrash(): void {
  assertInitialized();
  const artifacts = getArtifacts();
  const entries = listEntries();
  const bindings = listBindings();
  const report = runHealthAnalysis(artifacts, bindings, entries, process.cwd());

  if (report.trashCandidates.length === 0) {
    console.log('No trash candidates found.');
    return;
  }

  console.log('=== Trash Candidates ===');
  for (const art of report.trashCandidates) {
    const h = art.artifact.health;
    console.log(`[${h.suggested_action.toUpperCase()}] ${art.artifact.path} (${h.status})`);
    console.log(`  reasons: ${h.reasons.join('; ')}`);
  }
}

export async function runFsClean(): Promise<void> {
  assertInitialized();
  const artifacts = getArtifacts();
  const entries = listEntries();
  const bindings = listBindings();
  const report = runHealthAnalysis(artifacts, bindings, entries, process.cwd());

  const toArchive = report.trashCandidates.filter((a) => a.artifact.health.suggested_action === 'archive');
  const toDelete = report.trashCandidates.filter((a) => a.artifact.health.suggested_action === 'delete');

  const trashDir = path.join(process.cwd(), '.loom', 'trash');
  if (!fs.existsSync(trashDir)) {
    fs.mkdirSync(trashDir, { recursive: true });
  }

  for (const art of toArchive) {
    const src = resolveSafePath(process.cwd(), art.artifact.path);
    if (!src) {
      console.log(`Skipping unsafe path: ${art.artifact.path}`);
      continue;
    }
    const dest = path.join(trashDir, path.normalize(art.artifact.path));
    if (!dest.startsWith(trashDir + path.sep)) {
      console.log(`Skipping unsafe trash path: ${art.artifact.path}`);
      continue;
    }
    const destDir = path.dirname(dest);
    if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true });
    if (fs.existsSync(src)) {
      fs.renameSync(src, dest);
      art.artifact.fs.exists = false;
      art.artifact.health.status = 'missing';
      art.artifact.health.suggested_action = 'delete';
      saveEntry(art);
      markArtifactDirty(art.artifact.path, art.id);
      console.log(`Archived: ${art.artifact.path} -> .loom/trash/${art.artifact.path}`);
    }
  }

  for (const art of toDelete) {
    const src = resolveSafePath(process.cwd(), art.artifact.path);
    if (!src) {
      console.log(`Skipping unsafe path: ${art.artifact.path}`);
      continue;
    }
    if (fs.existsSync(src)) {
      fs.unlinkSync(src);
      art.artifact.fs.exists = false;
      saveEntry(art);
      markArtifactDirty(art.artifact.path, art.id);
      console.log(`Deleted: ${art.artifact.path}`);
    }
  }

  appendWal({ type: 'fs_clean', archived: toArchive.length, deleted: toDelete.length }, process.cwd());
  console.log(`\nClean complete. Archived: ${toArchive.length}, Deleted: ${toDelete.length}`);
}
