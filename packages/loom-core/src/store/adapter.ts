import type { Entry, Binding, WorkingSet, LoomConfig, TrashItem } from '../types/index.js';

/**
 * Abstract storage interface for LOOM.
 * Enables swapping between file-system, in-memory, or remote backends.
 */
export interface StoreAdapter {
  // ── Lifecycle ──
  initWorkspace(projectName: string): void;
  isInitialized(): boolean;

  // ── Entry CRUD ──
  listEntries(): Entry[];
  getEntry(id: string): Entry | null;
  saveEntry(entry: Entry): void;
  removeEntry(id: string): void; // moves to trash

  // ── Binding CRUD ──
  listBindings(): Binding[];
  saveBinding(binding: Binding): void;
  removeBinding(sourceId: string, targetId: string): void;

  // ── Working Set ──
  getWorkingSet(): WorkingSet;
  saveWorkingSet(ws: WorkingSet): void;

  // ── Config ──
  getConfig(): LoomConfig | null;

  // ── Prompt Cache ──
  writeActivePrompt(content: string): void;
  readActivePrompt(): string;

  // ── Cache Version ──
  readCacheVersion(): string;
  bumpCacheVersion(): void;

  // ── Trash ──
  listTrash(): TrashItem[];
  restoreFromTrash(id: string): void;
  purgeTrash(olderThanDays?: number): void;

  // ── Project Root ──
  getProjectRoot(): string;
}
