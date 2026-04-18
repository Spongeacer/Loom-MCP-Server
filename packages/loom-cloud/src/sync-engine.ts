import type { StoreAdapter, Entry } from '@spongeacer/loom-core';
import { CloudApiClient } from './cloud-api.js';
import { resolveConflict } from './conflict-resolver.js';
import type { EntrySyncState } from './conflict-resolver.js';

export interface SyncIndex {
  entries: Record<string, EntrySyncState>;
}

export interface SyncResult {
  pushed: number;
  pulled: number;
  conflicts: number;
  errors: string[];
}

export interface SyncEngine {
  sync(): Promise<SyncResult>;
  markDirty(entryId: string): void;
  startBackgroundSync(intervalMs?: number): void;
  shutdown(): void;
}

export class SyncEngineImpl implements SyncEngine {
  private _dirtyQueue = new Set<string>();
  private _pushTimer: ReturnType<typeof setTimeout> | null = null;
  private _pullTimer: ReturnType<typeof setInterval> | null = null;
  private _isSyncing = false;

  constructor(
    private store: StoreAdapter,
    private api: CloudApiClient,
    private token: string,
    private index: SyncIndex = { entries: {} },
  ) {}

  markDirty(entryId: string): void {
    this._dirtyQueue.add(entryId);
    if (this._pushTimer) {
      clearTimeout(this._pushTimer);
    }
    this._pushTimer = setTimeout(() => {
      void this._pushDirty();
    }, 5000);
  }

  private async _pushDirty(): Promise<void> {
    if (this._isSyncing || this._dirtyQueue.size === 0) return;
    this._isSyncing = true;
    const ids = Array.from(this._dirtyQueue);
    this._dirtyQueue.clear();

    const entries = ids
      .map((id) => this.store.getEntry(id))
      .filter((e): e is Entry => e !== null)
      .map((e) => ({
        id: e.id,
        version: e.version,
        payload: JSON.stringify(e),
      }));

    if (entries.length) {
      await this.api.push(this.token, entries);
      for (const e of entries) {
        this.index.entries[e.id] = {
          cloudVersion: e.version,
          lastSyncedAt: new Date().toISOString(),
          dirty: false,
        };
      }
    }
    this._isSyncing = false;
  }

  async sync(): Promise<SyncResult> {
    const result: SyncResult = { pushed: 0, pulled: 0, conflicts: 0, errors: [] };

    // Push
    await this._pushDirty();
    result.pushed = Object.values(this.index.entries).filter((s) => !s.dirty).length;

    // Pull
    const lastSync = Object.values(this.index.entries)
      .map((s) => s.lastSyncedAt)
      .sort()[0] ?? new Date(0).toISOString();

    const pullResult = await this.api.pull(this.token, lastSync);
    if (!pullResult.ok || !pullResult.entries) {
      if (pullResult.error) result.errors.push(pullResult.error);
      return result;
    }

    for (const remote of pullResult.entries) {
      const local = this.store.getEntry(remote.id);
      const syncState = this.index.entries[remote.id];
      const remoteEntry = JSON.parse(remote.payload) as Entry;

      const resolution = resolveConflict(local, remoteEntry, syncState);

      if (resolution.strategy === 'cloud-wins' && resolution.winner) {
        this.store.saveEntry(resolution.winner);
      } else if (resolution.strategy === 'fork-local' && resolution.winner && resolution.fork) {
        this.store.saveEntry(resolution.winner);
        this.store.saveEntry(resolution.fork);
        result.conflicts++;
      } else if (resolution.strategy === 'local-wins') {
        // local already saved, mark dirty for next push
        this.markDirty(remote.id);
      }

      this.index.entries[remote.id] = {
        cloudVersion: remote.version,
        lastSyncedAt: new Date().toISOString(),
        dirty: false,
      };
      result.pulled++;
    }

    return result;
  }

  startBackgroundSync(intervalMs = 60000): void {
    this._pullTimer = setInterval(() => {
      void this.sync();
    }, intervalMs);
  }

  shutdown(): void {
    if (this._pushTimer) clearTimeout(this._pushTimer);
    if (this._pullTimer) clearInterval(this._pullTimer);
    this._pushTimer = null;
    this._pullTimer = null;
  }
}
