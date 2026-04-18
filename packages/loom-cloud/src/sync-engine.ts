/**
 * LOOM Cloud Sync — Core Sync Engine
 *
 * Orchestrates bidirectional sync between the local StoreAdapter and the
 * cloud server.  The engine is designed to be:
 *   - Offline-first: local store is always authoritative; cloud is best-effort.
 *   - Non-blocking: sync runs in the background; prompt builder never waits.
 *   - Silent-fail: network errors are logged but never thrown to the user.
 *
 * Sync lifecycle:
 *   1. Load or create sync-index from `.loom/cache/sync-index.yml`.
 *   2. On local write → mark entry dirty, enqueue push (debounced).
 *   3. On pull timer → fetch user-level entries from cloud, resolve conflicts.
 *   4. Pulled entries are saved with namespace='user' so they appear in all
 *      projects for this user.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';

import type { Entry } from '../../loom/dist/types/index.js';
import type { StoreAdapter } from '../../loom/dist/core/store-adapter.js';

import type {
  CloudEntry,
  ConflictResult,
  EntrySyncState,
  PushPayload,
  PullPayload,
  SyncConfig,
  SyncIndex,
  SyncResult,
} from './types.js';
import type { CloudApiClient } from './cloud-api.js';
import { resolveConflict, isEntryDirty } from './conflict-resolver.js';
import { getDeviceIdentity } from './auth.js';

// ─────────────────────────────────────────────────────────────────────────────
// SyncEngine interface
// ─────────────────────────────────────────────────────────────────────────────

export interface SyncEngine {
  /** Current sync index (for inspection). */
  readonly index: SyncIndex;
  /** true if a sync operation is in progress. */
  readonly isSyncing: boolean;

  /** One-shot: push dirty entries then pull cloud updates. */
  sync(): Promise<SyncResult>;

  /** Mark a local entry as dirty (call this after every local save). */
  markDirty(entryId: string): void;

  /** Start background pull polling (returns stop function). */
  startBackgroundSync(): () => void;

  /** Flush pending changes and stop background sync. */
  shutdown(): Promise<void>;
}

// SyncResult is defined in types.ts

// ─────────────────────────────────────────────────────────────────────────────
// Factory
// ─────────────────────────────────────────────────────────────────────────────

export interface SyncEngineOptions {
  store: StoreAdapter;
  api: CloudApiClient;
  config: SyncConfig;
  /** Project name (for push metadata). */
  projectName: string;
  /** Project root directory (where .loom/ lives). */
  projectRoot: string;
  /** Optional device label override. */
  deviceLabel?: string;
  /** Optional callback invoked after a cloud entry is saved locally. */
  onSave?: (entry: Entry) => void;
}

export function createSyncEngine(opts: SyncEngineOptions): SyncEngine {
  return new SyncEngineImpl(opts);
}

// ─────────────────────────────────────────────────────────────────────────────
// Implementation
// ─────────────────────────────────────────────────────────────────────────────

class SyncEngineImpl implements SyncEngine {
  private store: StoreAdapter;
  private api: CloudApiClient;
  private config: SyncConfig;
  private projectName: string;
  private projectRoot: string;
  private deviceId: string;
  private onSave?: (entry: Entry) => void;

  private _index: SyncIndex;
  private _isSyncing = false;
  private _pushTimer: ReturnType<typeof setTimeout> | null = null;
  private _pullTimer: ReturnType<typeof setTimeout> | null = null;
  private _dirtyQueue = new Set<string>();
  private _shuttingDown = false;

  constructor(opts: SyncEngineOptions) {
    this.store = opts.store;
    this.api = opts.api;
    this.config = opts.config;
    this.projectName = opts.projectName;
    this.projectRoot = opts.projectRoot;
    this.deviceId = getDeviceIdentity(opts.deviceLabel).deviceId;
    this.onSave = opts.onSave;
    this._index = loadSyncIndex(opts.projectRoot);
  }

  get index(): SyncIndex {
    return this._index;
  }

  get isSyncing(): boolean {
    return this._isSyncing;
  }

  // ── Public API ────────────────────────────────────────────────────────────

  markDirty(entryId: string): void {
    this._dirtyQueue.add(entryId);
    this._index.entries[entryId] = {
      ...this._index.entries[entryId],
      dirty: true,
      cloudVersion: this._index.entries[entryId]?.cloudVersion ?? null,
    };
    this._schedulePush();
  }

  async sync(): Promise<SyncResult> {
    if (this._isSyncing || this._shuttingDown) {
      return { pushed: 0, pulled: 0, conflicts: [], errors: ['Sync already in progress'] };
    }
    this._isSyncing = true;
    const result: SyncResult = { pushed: 0, pulled: 0, conflicts: [], errors: [] };

    try {
      // Phase 1: Push
      const pushResult = await this._push();
      result.pushed = pushResult.accepted.length;
      result.errors.push(...pushResult.rejected.map((r) => `Push rejected: ${r.id}: ${r.reason}`));

      // Phase 2: Pull
      const pullResult = await this._pull();
      result.pulled = pullResult.applied.length;
      result.conflicts.push(...pullResult.conflicts);
      result.errors.push(...pullResult.errors);
    } catch (err) {
      result.errors.push(err instanceof Error ? err.message : String(err));
    } finally {
      this._isSyncing = false;
      saveSyncIndex(this.projectRoot, this._index);
    }

    return result;
  }

  startBackgroundSync(): () => void {
    if (this._pullTimer) return () => this._stopBackgroundSync();

    const tick = () => {
      if (this._shuttingDown) return;
      this.sync().catch(() => {
        /* silent fail for background */
      });
      this._pullTimer = setTimeout(tick, this.config.pullIntervalMs);
    };

    this._pullTimer = setTimeout(tick, this.config.pullIntervalMs);
    return () => this._stopBackgroundSync();
  }

  async shutdown(): Promise<void> {
    this._shuttingDown = true;
    this._stopBackgroundSync();

    if (this._pushTimer) {
      clearTimeout(this._pushTimer);
      this._pushTimer = null;
    }

    // Flush any remaining dirty entries
    if (this._dirtyQueue.size > 0) {
      try {
        await this._push();
      } catch {
        /* best effort */
      }
    }

    saveSyncIndex(this.projectRoot, this._index);
  }

  // ── Push ──────────────────────────────────────────────────────────────────

  private _schedulePush(): void {
    if (this._pushTimer) clearTimeout(this._pushTimer);
    this._pushTimer = setTimeout(() => {
      this._pushTimer = null;
      this.sync().catch(() => {
        /* silent fail */
      });
    }, 5000); // 5s debounce
  }

  private async _push(): Promise<{ accepted: string[]; rejected: { id: string; reason: string }[] }> {
    const dirtyIds = Array.from(this._dirtyQueue);
    if (dirtyIds.length === 0) {
      return { accepted: [], rejected: [] };
    }

    const entries: Entry[] = [];
    for (const id of dirtyIds) {
      const entry = this.store.getEntry(id);
      if (entry) entries.push(entry);
    }

    if (entries.length === 0) {
      this._dirtyQueue.clear();
      return { accepted: [], rejected: [] };
    }

    const payload: PushPayload = {
      deviceId: this.deviceId,
      projectName: this.projectName,
      entries,
      baseCloudVersion: this._index.cloudVersion,
    };

    try {
      const res = await this.api.push(payload);

      // Update sync index for accepted entries
      for (const id of res.accepted) {
        this._index.entries[id] = {
          ...this._index.entries[id],
          dirty: false,
          lastPushAt: new Date().toISOString(),
        };
        this._dirtyQueue.delete(id);
      }

      // Mark rejected as still dirty (will retry next sync)
      for (const rej of res.rejected) {
        this._index.entries[rej.id] = {
          ...this._index.entries[rej.id],
          dirty: true,
        };
      }

      this._index.cloudVersion = res.newCloudVersion;
      this._index.lastPushedAt = new Date().toISOString();
      return { accepted: res.accepted, rejected: res.rejected };
    } catch (err) {
      // Push failed — entries remain dirty for retry
      return {
        accepted: [],
        rejected: entries.map((e) => ({
          id: e.id,
          reason: err instanceof Error ? err.message : String(err),
        })),
      };
    }
  }

  // ── Pull ──────────────────────────────────────────────────────────────────

  private async _pull(): Promise<{
    applied: string[];
    conflicts: ConflictResult[];
    errors: string[];
  }> {
    const payload: PullPayload = {
      deviceId: this.deviceId,
      sinceCloudVersion: this._index.cloudVersion,
      namespace: 'user',
    };

    const errors: string[] = [];
    const applied: string[] = [];
    const conflicts: ConflictResult[] = [];

    try {
      const res = await this.api.pull(payload);

      for (const cloudEntry of res.entries) {
        const result = await this._applyCloudEntry(cloudEntry);
        if (result) {
          applied.push(cloudEntry.entry.id);
          if (result.fork) {
            conflicts.push(result);
          }
        }
      }

      this._index.cloudVersion = res.cloudVersion;
      this._index.lastPulledAt = new Date().toISOString();

      // If pipeline is still running, schedule another pull soon
      if (res.pipelinePending) {
        setTimeout(() => this.sync().catch(() => {}), 10_000);
      }
    } catch (err) {
      errors.push(err instanceof Error ? err.message : String(err));
    }

    return { applied, conflicts, errors };
  }

  private async _applyCloudEntry(cloudEntry: CloudEntry): Promise<ConflictResult | null> {
    const local = this.store.getEntry(cloudEntry.entry.id);
    const syncState = this._index.entries[cloudEntry.entry.id];

    const result = resolveConflict(local, cloudEntry.entry, syncState, cloudEntry.cloud.cloudVersion);

    // Save winner
    this.store.saveEntry(result.winner);
    this.onSave?.(result.winner);
    this._index.entries[result.winner.id] = {
      cloudVersion: cloudEntry.cloud.cloudVersion,
      lastPullAt: new Date().toISOString(),
      lastPushAt: syncState?.lastPushAt ?? null,
      dirty: false,
      forkedTo: result.fork ? result.fork.id : (syncState?.forkedTo ?? null),
    };

    // Save fork if created
    if (result.fork) {
      this.store.saveEntry(result.fork);
      this.onSave?.(result.fork);
      this._index.entries[result.fork.id] = {
        cloudVersion: null,
        lastPullAt: null,
        lastPushAt: null,
        dirty: false,
        forkedTo: null,
      };
      // Link the original entry to its fork
      this._index.entries[cloudEntry.entry.id] = {
        ...this._index.entries[cloudEntry.entry.id],
        forkedTo: result.fork.id,
      };
    }

    return result;
  }

  // ── Background ────────────────────────────────────────────────────────────

  private _stopBackgroundSync(): void {
    if (this._pullTimer) {
      clearTimeout(this._pullTimer);
      this._pullTimer = null;
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Sync Index persistence
// ─────────────────────────────────────────────────────────────────────────────

const SYNC_INDEX_FILE = 'sync-index.yml';
const SYNC_INDEX_DIR = 'cache';

function getSyncIndexPath(projectRoot: string): string {
  return join(projectRoot, '.loom', SYNC_INDEX_DIR, SYNC_INDEX_FILE);
}

function loadSyncIndex(projectRoot: string): SyncIndex {
  const path = getSyncIndexPath(projectRoot);
  if (existsSync(path)) {
    try {
      const raw = readFileSync(path, 'utf-8');
      return JSON.parse(raw) as SyncIndex;
    } catch {
      /* fall through to default */
    }
  }
  return {
    cloudVersion: 0,
    lastPulledAt: null,
    lastPushedAt: null,
    entries: {},
  };
}

function saveSyncIndex(projectRoot: string, index: SyncIndex): void {
  const path = getSyncIndexPath(projectRoot);
  const dir = dirname(path);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(path, JSON.stringify(index, null, 2));
}
