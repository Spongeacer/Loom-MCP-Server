import type { StoreAdapter } from './adapter.js';
import type { Entry, Binding, WorkingSet, LoomConfig, TrashItem } from '../types/index.js';
import { LOOM_VERSION } from '../constants.js';

/**
 * In-memory StoreAdapter for testing.
 * All data is held in memory; no filesystem operations.
 */
export class MemoryStoreAdapter implements StoreAdapter {
  private entries = new Map<string, Entry>();
  private bindings = new Map<string, Binding>();
  private workingSet: WorkingSet = {
    active_task: null,
    pinned_entries: [],
    hot_entries: [],
    recently_expanded: [],
    blocked_entries: [],
  };
  private config: LoomConfig | null = null;
  private activePrompt = '';
  private cacheVersion = '';
  private trash = new Map<string, TrashItem>();
  private _initialized = false;

  initWorkspace(projectName: string): void {
    this.config = {
      version: LOOM_VERSION,
      project_name: projectName,
      initialized_at: new Date().toISOString(),
      default_namespace: 'project',
    };
    this._initialized = true;

  }

  isInitialized(): boolean {
    return this._initialized;
  }

  getProjectRoot(): string {
    return '';
  }

  listEntries(): Entry[] {
    return Array.from(this.entries.values()).map((e) => structuredClone(e));
  }

  getEntry(id: string): Entry | null {
    const e = this.entries.get(id);
    return e ? structuredClone(e) : null;
  }

  saveEntry(entry: Entry): void {
    this.entries.set(entry.id, structuredClone(entry));
  }

  removeEntry(id: string): void {
    const entry = this.entries.get(id);
    if (entry) {
      this.trash.set(id, {
        id,
        type: entry.type,
        deletedAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        entry: structuredClone(entry),
      });
      this.entries.delete(id);
    }
  }

  listBindings(): Binding[] {
    return Array.from(this.bindings.values()).map((b) => structuredClone(b));
  }

  saveBinding(binding: Binding): void {
    const key = `${binding.source}→${binding.target}`;
    this.bindings.set(key, structuredClone(binding));
  }

  removeBinding(sourceId: string, targetId: string): void {
    this.bindings.delete(`${sourceId}→${targetId}`);
  }

  getWorkingSet(): WorkingSet {
    return structuredClone(this.workingSet);
  }

  saveWorkingSet(ws: WorkingSet): void {
    this.workingSet = structuredClone(ws);
  }

  getConfig(): LoomConfig | null {
    return this.config ? structuredClone(this.config) : null;
  }

  writeActivePrompt(content: string): void {
    this.activePrompt = content;
  }

  readActivePrompt(): string {
    return this.activePrompt;
  }

  readCacheVersion(): string {
    return this.cacheVersion;
  }

  bumpCacheVersion(): void {
    this.cacheVersion = Date.now().toString();
  }

  listTrash(): TrashItem[] {
    return Array.from(this.trash.values()).sort((a, b) => b.deletedAt.localeCompare(a.deletedAt));
  }

  restoreFromTrash(id: string): void {
    const item = this.trash.get(id);
    if (item) {
      this.entries.set(id, structuredClone(item.entry));
      this.trash.delete(id);
    }
  }

  purgeTrash(_olderThanDays?: number): void {
    const cutoff = Date.now() - (_olderThanDays ?? 30) * 24 * 60 * 60 * 1000;
    for (const [key, item] of this.trash) {
      if (new Date(item.expiresAt).getTime() < cutoff) {
        this.trash.delete(key);
      }
    }
  }
}
