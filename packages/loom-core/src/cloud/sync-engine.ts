import * as fs from 'node:fs';
import * as path from 'node:path';
import type { StoreAdapter } from '../store/adapter.js';
import type { Entry } from '../types/index.js';
import { atomicWriteFile } from '../utils/fs-safe.js';
import { CloudApiClient } from './api.js';
import { resolveConflict } from './conflict-resolver.js';
import type { EntrySyncState } from './conflict-resolver.js';

const SYNC_PUSH_DEBOUNCE_MS = 5000;
const SYNC_BACKGROUND_INTERVAL_MS = 60000;

/**
 * Strip sensitive and locally-computed fields from an entry before syncing to cloud.
 * This is the data minimization layer — only sync what the cloud needs.
 */
function stripForSync(entry: Entry): Entry {
  const stripped = { ...entry };
  // Remove filesystem paths (local-only, meaningless on cloud)
  if (stripped.activation) {
    stripped.activation = { ...stripped.activation, paths: [] };
  }
  // Remove locally-computed quality/decay scores (can be recomputed)
  if (stripped.quality) {
    stripped.quality = { freshness: 1, trust: stripped.quality.trust, activity: 1, composite_score: stripped.quality.composite_score };
  }
  if (stripped.decay) {
    stripped.decay = undefined;
  }
  // Remove behavioral metadata (privacy: don't reveal access patterns)
  if (stripped.lifecycle) {
    stripped.lifecycle = {
      ...stripped.lifecycle,
      last_accessed: '',
      last_activated: '',
      activation_count: 0,
    };
  }
  // Strip artifact filesystem metadata (paths, sizes, timestamps)
  if (stripped.type === 'Artifact' && (stripped as any).artifact) {
    const art = { ...(stripped as any).artifact };
    art.path = art.path ? art.path.replace(/.*\//, '[redacted]/') : '';
    art.fs = { last_modified_at: '', last_seen_at: '', size_bytes: 0, exists: art.fs?.exists ?? true };
    art.deps = { imports: [], imported_by: [] };
    (stripped as any).artifact = art;
  }
  return stripped;
}

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

function loadSyncIndex(indexPath: string): SyncIndex {
  if (!fs.existsSync(indexPath)) return { entries: {} };
  try {
    const raw = fs.readFileSync(indexPath, 'utf-8');
    const data = JSON.parse(raw) as SyncIndex;
    if (data && typeof data.entries === 'object') return data;
  } catch {
    // corrupted or unreadable
  }
  return { entries: {} };
}

function saveSyncIndex(indexPath: string, index: SyncIndex): void {
  const dir = path.dirname(indexPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  const temp = `${indexPath}.tmp-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  atomicWriteFile(indexPath, JSON.stringify(index, null, 2));
}

export class SyncEngineImpl implements SyncEngine {
  private _dirtyQueue = new Set<string>();
  private _pushTimer: ReturnType<typeof setTimeout> | null = null;
  private _pullTimer: ReturnType<typeof setInterval> | null = null;
  private _isSyncing = false;
  private _indexPath: string;

  constructor(
    private store: StoreAdapter,
    private api: CloudApiClient,
    private token: string,
    private projectId: string,
    private index: SyncIndex = { entries: {} },
  ) {
    this._indexPath = path.join(store.getProjectRoot(), '.loom', 'cache', 'sync-index.json');
    // Load persisted index if the provided one is empty
    if (Object.keys(this.index.entries).length === 0) {
      const persisted = loadSyncIndex(this._indexPath);
      this.index = persisted;
    }
  }

  private _persistIndex(): void {
    saveSyncIndex(this._indexPath, this.index);
  }

  markDirty(entryId: string): void {
    this._dirtyQueue.add(entryId);
    // Update the in-memory dirty flag so sync() knows this entry has local changes
    if (!this.index.entries[entryId]) {
      this.index.entries[entryId] = { cloudVersion: 0, lastSyncedAt: new Date(0).toISOString(), dirty: true };
    } else {
      this.index.entries[entryId].dirty = true;
    }
    if (this._pushTimer) {
      clearTimeout(this._pushTimer);
    }
    this._pushTimer = setTimeout(() => {
      void this._pushDirty();
    }, SYNC_PUSH_DEBOUNCE_MS);
  }

  private async _pushDirty(): Promise<{ pushedCount: number }> {
    if (this._isSyncing || this._dirtyQueue.size === 0) return { pushedCount: 0 };
    this._isSyncing = true;
    const ids = Array.from(this._dirtyQueue);

    try {
      // Filter out entries that should never be pushed to cloud
      const entries = ids
        .map((id) => this.store.getEntry(id))
        .filter((e): e is Entry => e !== null)
        .filter((e) => {
          // Skip user-namespace (cloud→local only)
          if (e.namespace === 'user') return false;
          // Skip local-namespace (stays on device)
          if (e.namespace === 'local') return false;
          // Skip entries marked as noSync
          if ((e as any).noSync === true) return false;
          return true;
        })
        .map((e) => ({
          id: e.id,
          version: e.version,
          payload: JSON.stringify(stripForSync(e)),
        }));

      const pushedIds = new Set<string>();

      if (entries.length) {
        // Build baseVersions from persisted sync index
        const baseVersions: Record<string, number> = {};
        for (const e of entries) {
          baseVersions[e.id] = this.index.entries[e.id]?.cloudVersion ?? 0;
        }

        const result = await this.api.push(this.token, this.projectId, entries, baseVersions);

        if (!result.ok && result.conflicts && result.conflicts.length > 0) {
          // Optimistic concurrency conflict — resolve and re-queue
          const unresolved: string[] = [];
          for (const conflict of result.conflicts) {
            const local = this.store.getEntry(conflict.id);
            const syncState = this.index.entries[conflict.id];
            // Pull the conflicting entry from cloud to get full payload
            const since = new Date(0).toISOString();
            const pullResult = await this.api.pull(this.token, this.projectId, since);
            if (pullResult.ok && pullResult.entries) {
              const remote = pullResult.entries.find((e) => e.id === conflict.id);
              if (remote) {
                const remoteEntry = JSON.parse(remote.payload) as Entry;
                const resolution = resolveConflict(local, remoteEntry, syncState);
                if (resolution.strategy === 'cloud-wins' && resolution.winner) {
                  this.store.saveEntry(resolution.winner);
                } else if (resolution.strategy === 'fork-local' && resolution.winner && resolution.fork) {
                  this.store.saveEntry(resolution.winner);
                  this.store.saveEntry(resolution.fork);
                } else if (resolution.strategy === 'local-wins' && local) {
                  this.store.saveEntry(local);
                }
                this.index.entries[conflict.id] = {
                  cloudVersion: remote.version,
                  lastSyncedAt: new Date().toISOString(),
                  dirty: false,
                };
                // Re-queue the resolved entry for next push
                this._dirtyQueue.add(conflict.id);
                pushedIds.add(conflict.id);
              } else {
                // Entry no longer exists on cloud; re-queue for next attempt
                this._dirtyQueue.add(conflict.id);
                unresolved.push(conflict.id);
              }
            } else {
              // Failed to pull; re-queue for retry
              this._dirtyQueue.add(conflict.id);
              unresolved.push(conflict.id);
            }
          }
          this._persistIndex();
          const msg = `Push conflict on ${result.conflicts.map((c) => c.id).join(', ')} — ${unresolved.length > 0 ? 'some unresolved, will retry' : 'resolved, will retry'}`;
          throw new Error(msg);
        }

        if (!result.ok) {
          throw new Error(result.error || 'Push failed');
        }

        for (const e of entries) {
          this.index.entries[e.id] = {
            cloudVersion: e.version,
            lastSyncedAt: new Date().toISOString(),
            dirty: false,
          };
          pushedIds.add(e.id);
        }
        this._persistIndex();
      }

      // Only clear ids that were actually pushed (or skipped because filtered)
      for (const id of ids) {
        if (pushedIds.has(id)) {
          this._dirtyQueue.delete(id);
        }
      }
      return { pushedCount: pushedIds.size };
    } catch (err) {
      // Re-queue for retry on failure
      for (const id of ids) {
        this._dirtyQueue.add(id);
      }
      throw err;
    } finally {
      this._isSyncing = false;
    }
  }

  async sync(): Promise<SyncResult> {
    if (this._isSyncing) {
      return { pushed: 0, pulled: 0, conflicts: 0, errors: ['Sync already in progress'] };
    }

    const result: SyncResult = { pushed: 0, pulled: 0, conflicts: 0, errors: [] };

    // Pull first (before push) so we don't miss remote changes with a too-recent since timestamp.
    // Use the LATEST lastSyncedAt instead of the earliest, so we only fetch truly new changes.
    const syncTimes = Object.values(this.index.entries)
      .map((s) => s.lastSyncedAt)
      .sort();
    const lastSync = syncTimes.length > 0 ? syncTimes[syncTimes.length - 1] : new Date(0).toISOString();

    const pullResult = await this.api.pull(this.token, this.projectId, lastSync);
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
    this._persistIndex();

    // Pull user-profile from cloud (cloud→local only, never pushed)
    try {
      const userProfile = await this.api.getUserProfile(this.token);
      if (userProfile.ok && userProfile.entry) {
        const parsedEntry = JSON.parse(userProfile.entry.payload) as Entry;
        this.store.saveEntry(parsedEntry);
      }
    } catch {
      // Best-effort: user profile is not critical for project sync
    }

    // Push dirty entries after pull
    try {
      const pushResult = await this._pushDirty();
      result.pushed = pushResult.pushedCount;
    } catch (err) {
      result.errors.push(`Push failed: ${String(err)}`);
    }

    return result;
  }

  startBackgroundSync(intervalMs = SYNC_BACKGROUND_INTERVAL_MS): void {
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
