/**
 * Archive Manager — moves decayed entries to/from the archive directory.
 *
 * Archived entries live in .loom/archive/ (mirroring the original type subdirectory).
 * They are excluded from listEntries() and prompt building but can be restored.
 */
import * as path from 'node:path';
import type { Entry, EntryType, TrashItem } from './types/index.js';
import type { LoomPaths } from './paths.js';
import { safeMkdir, atomicWriteFile, readTextFile, safeReaddir, safeUnlink } from './utils/fs-safe.js';
import { parseYaml, stringifyYaml } from './utils/yaml.js';
import { isEligibleForArchival } from './decay-engine.js';
import { saveToTrash } from './store/trash.js';

const ARCHIVE_DIR_NAME = 'archive';

export interface ArchiveItem {
  id: string;
  type: EntryType;
  archivedAt: string;
  decayScore: number;
  entry: Entry;
}

function archiveDir(paths: LoomPaths): string {
  return path.join(paths.root, ARCHIVE_DIR_NAME);
}

function archiveTypeDir(paths: LoomPaths, entryType: EntryType): string {
  return path.join(archiveDir(paths), entryType.toLowerCase() + 's');
}

function makeArchiveFileName(entry: Entry): string {
  return `${entry.id}.archived.yml`;
}

/**
 * Archive a single entry: move from active entries/ to archive/.
 * Does NOT delete the original — caller must handle that.
 * Returns the archive file path.
 */
export function archiveEntry(paths: LoomPaths, entry: Entry): string {
  const dir = archiveTypeDir(paths, entry.type);
  safeMkdir(dir);
  const filePath = path.join(dir, makeArchiveFileName(entry));
  const item: ArchiveItem = {
    id: entry.id,
    type: entry.type,
    archivedAt: new Date().toISOString(),
    decayScore: entry.decay?.score ?? 0,
    entry,
  };
  atomicWriteFile(filePath, stringifyYaml(item));
  return filePath;
}

/**
 * Restore an archived entry back to active. Returns the entry or null if not found.
 */
export function restoreFromArchive(paths: LoomPaths, id: string): Entry | null {
  const dirs = safeReaddir(archiveDir(paths));
  for (const typeDir of dirs) {
    const fullPath = path.join(archiveDir(paths), typeDir);
    for (const file of safeReaddir(fullPath)) {
      if (!file.endsWith('.archived.yml')) continue;
      const raw = readTextFile(path.join(fullPath, file));
      if (!raw) continue;
      const item = parseYaml<ArchiveItem | null>(raw, null);
      if (item && item.id === id) {
        safeUnlink(path.join(fullPath, file));
        return item.entry;
      }
    }
  }
  return null;
}

/**
 * List all archived entries.
 */
export function listArchived(paths: LoomPaths): ArchiveItem[] {
  const items: ArchiveItem[] = [];
  const dirs = safeReaddir(archiveDir(paths));
  for (const typeDir of dirs) {
    const fullPath = path.join(archiveDir(paths), typeDir);
    for (const file of safeReaddir(fullPath)) {
      if (!file.endsWith('.archived.yml')) continue;
      const raw = readTextFile(path.join(fullPath, file));
      if (!raw) continue;
      const item = parseYaml<ArchiveItem | null>(raw, null);
      if (item) items.push(item);
    }
  }
  return items.sort((a, b) => a.archivedAt.localeCompare(b.archivedAt));
}

/**
 * Find an archived entry by ID.
 */
export function findArchived(paths: LoomPaths, id: string): ArchiveItem | null {
  const dirs = safeReaddir(archiveDir(paths));
  for (const typeDir of dirs) {
    const fullPath = path.join(archiveDir(paths), typeDir);
    for (const file of safeReaddir(fullPath)) {
      if (!file.endsWith('.archived.yml')) continue;
      const raw = readTextFile(path.join(fullPath, file));
      if (!raw) continue;
      const item = parseYaml<ArchiveItem | null>(raw, null);
      if (item && item.id === id) return item;
    }
  }
  return null;
}

/**
 * Permanently delete an archived entry (moves to trash first).
 */
export function purgeArchived(paths: LoomPaths, id: string): boolean {
  const dirs = safeReaddir(archiveDir(paths));
  for (const typeDir of dirs) {
    const fullPath = path.join(archiveDir(paths), typeDir);
    for (const file of safeReaddir(fullPath)) {
      if (!file.endsWith('.archived.yml')) continue;
      const raw = readTextFile(path.join(fullPath, file));
      if (!raw) continue;
      const item = parseYaml<ArchiveItem | null>(raw, null);
      if (item && item.id === id) {
        // Move to trash before permanent deletion
        saveToTrash(paths.trash, item.entry);
        safeUnlink(path.join(fullPath, file));
        return true;
      }
    }
  }
  return false;
}

/**
 * Auto-archive entries that are eligible (low decay score).
 * Returns the list of archived entry IDs.
 */
export function autoArchive(paths: LoomPaths, entries: Entry[]): string[] {
  const archived: string[] = [];
  for (const entry of entries) {
    if (isEligibleForArchival(entry)) {
      archiveEntry(paths, entry);
      archived.push(entry.id);
    }
  }
  return archived;
}
