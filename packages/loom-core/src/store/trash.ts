import * as path from 'node:path';
import type { Entry, TrashItem } from '../types/index.js';
import { safeReaddir, readTextFile, safeUnlink, atomicWriteFile } from '../utils/fs-safe.js';
import { parseYaml, stringifyYaml } from '../utils/yaml.js';

const TRASH_TTL_DAYS = 30;

function makeTrashFileName(id: string, timestamp: string): string {
  return `${id}.${timestamp}.trash.yml`;
}

function parseTrashFileName(fileName: string): { id: string; timestamp: string } | null {
  const match = fileName.match(/^(.+)\.(\d{4}-\d{2}-\d{2}T[\d:.]+Z)\.trash\.yml$/);
  if (!match) return null;
  return { id: match[1], timestamp: match[2] };
}

export function saveToTrash(trashDir: string, entry: Entry): void {
  const deletedAt = new Date().toISOString();
  const expiresAt = new Date(Date.now() + TRASH_TTL_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const item: TrashItem = {
    id: entry.id,
    type: entry.type,
    deletedAt,
    expiresAt,
    entry,
  };
  const fileName = makeTrashFileName(entry.id, deletedAt);
  atomicWriteFile(path.join(trashDir, fileName), stringifyYaml(item));
}

export function listTrash(trashDir: string): TrashItem[] {
  const files = safeReaddir(trashDir);
  const items: TrashItem[] = [];
  for (const file of files) {
    const parsed = parseTrashFileName(file);
    if (!parsed) continue;
    const raw = readTextFile(path.join(trashDir, file));
    if (!raw) continue;
    const item = parseYaml<TrashItem | null>(raw, null);
    if (item) items.push(item);
  }
  return items.sort((a, b) => b.deletedAt.localeCompare(a.deletedAt));
}

export function findTrashFile(trashDir: string, id: string): string | null {
  const files = safeReaddir(trashDir);
  for (const file of files) {
    const parsed = parseTrashFileName(file);
    if (parsed && parsed.id === id) {
      return path.join(trashDir, file);
    }
  }
  return null;
}

export function purgeTrash(trashDir: string, olderThanDays = TRASH_TTL_DAYS): void {
  const cutoff = Date.now() - olderThanDays * 24 * 60 * 60 * 1000;
  const files = safeReaddir(trashDir);
  for (const file of files) {
    const parsed = parseTrashFileName(file);
    if (!parsed) {
      safeUnlink(path.join(trashDir, file));
      continue;
    }
    const raw = readTextFile(path.join(trashDir, file));
    if (!raw) {
      safeUnlink(path.join(trashDir, file));
      continue;
    }
    const item = parseYaml<TrashItem | null>(raw, null);
    if (!item || new Date(item.expiresAt).getTime() < cutoff) {
      safeUnlink(path.join(trashDir, file));
    }
  }
}
