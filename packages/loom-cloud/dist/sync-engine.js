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
import { resolveConflict } from './conflict-resolver.js';
import { getDeviceIdentity } from './auth.js';
export function createSyncEngine(opts) {
    return new SyncEngineImpl(opts);
}
// ─────────────────────────────────────────────────────────────────────────────
// Implementation
// ─────────────────────────────────────────────────────────────────────────────
class SyncEngineImpl {
    store;
    api;
    config;
    projectName;
    projectRoot;
    deviceId;
    _index;
    _isSyncing = false;
    _pushTimer = null;
    _pullTimer = null;
    _dirtyQueue = new Set();
    _shuttingDown = false;
    constructor(opts) {
        this.store = opts.store;
        this.api = opts.api;
        this.config = opts.config;
        this.projectName = opts.projectName;
        this.projectRoot = opts.projectRoot;
        this.deviceId = getDeviceIdentity(opts.deviceLabel).deviceId;
        this._index = loadSyncIndex(opts.projectRoot);
    }
    get index() {
        return this._index;
    }
    get isSyncing() {
        return this._isSyncing;
    }
    // ── Public API ────────────────────────────────────────────────────────────
    markDirty(entryId) {
        this._dirtyQueue.add(entryId);
        this._index.entries[entryId] = {
            ...this._index.entries[entryId],
            dirty: true,
            cloudVersion: this._index.entries[entryId]?.cloudVersion ?? null,
        };
        this._schedulePush();
    }
    async sync() {
        if (this._isSyncing || this._shuttingDown) {
            return { pushed: 0, pulled: 0, conflicts: [], errors: ['Sync already in progress'] };
        }
        this._isSyncing = true;
        const result = { pushed: 0, pulled: 0, conflicts: [], errors: [] };
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
        }
        catch (err) {
            result.errors.push(err instanceof Error ? err.message : String(err));
        }
        finally {
            this._isSyncing = false;
            saveSyncIndex(this.projectRoot, this._index);
        }
        return result;
    }
    startBackgroundSync() {
        if (this._pullTimer)
            return () => this._stopBackgroundSync();
        const tick = () => {
            if (this._shuttingDown)
                return;
            this.sync().catch(() => {
                /* silent fail for background */
            });
            this._pullTimer = setTimeout(tick, this.config.pullIntervalMs);
        };
        this._pullTimer = setTimeout(tick, this.config.pullIntervalMs);
        return () => this._stopBackgroundSync();
    }
    async shutdown() {
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
            }
            catch {
                /* best effort */
            }
        }
        saveSyncIndex(this.projectRoot, this._index);
    }
    // ── Push ──────────────────────────────────────────────────────────────────
    _schedulePush() {
        if (this._pushTimer)
            clearTimeout(this._pushTimer);
        this._pushTimer = setTimeout(() => {
            this._pushTimer = null;
            this.sync().catch(() => {
                /* silent fail */
            });
        }, 5000); // 5s debounce
    }
    async _push() {
        const dirtyIds = Array.from(this._dirtyQueue);
        if (dirtyIds.length === 0) {
            return { accepted: [], rejected: [] };
        }
        const entries = [];
        for (const id of dirtyIds) {
            const entry = this.store.getEntry(id);
            if (entry)
                entries.push(entry);
        }
        if (entries.length === 0) {
            this._dirtyQueue.clear();
            return { accepted: [], rejected: [] };
        }
        const payload = {
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
        }
        catch (err) {
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
    async _pull() {
        const payload = {
            deviceId: this.deviceId,
            sinceCloudVersion: this._index.cloudVersion,
            namespace: 'user',
        };
        const errors = [];
        const applied = [];
        const conflicts = [];
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
                setTimeout(() => this.sync().catch(() => { }), 10_000);
            }
        }
        catch (err) {
            errors.push(err instanceof Error ? err.message : String(err));
        }
        return { applied, conflicts, errors };
    }
    async _applyCloudEntry(cloudEntry) {
        const local = this.store.getEntry(cloudEntry.entry.id);
        const syncState = this._index.entries[cloudEntry.entry.id];
        const result = resolveConflict(local, cloudEntry.entry, syncState, cloudEntry.cloud.cloudVersion);
        // Save winner
        this.store.saveEntry(result.winner);
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
    _stopBackgroundSync() {
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
function getSyncIndexPath(projectRoot) {
    return join(projectRoot, '.loom', SYNC_INDEX_DIR, SYNC_INDEX_FILE);
}
function loadSyncIndex(projectRoot) {
    const path = getSyncIndexPath(projectRoot);
    if (existsSync(path)) {
        try {
            const raw = readFileSync(path, 'utf-8');
            return JSON.parse(raw);
        }
        catch {
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
function saveSyncIndex(projectRoot, index) {
    const path = getSyncIndexPath(projectRoot);
    const dir = dirname(path);
    if (!existsSync(dir))
        mkdirSync(dir, { recursive: true });
    writeFileSync(path, JSON.stringify(index, null, 2));
}
//# sourceMappingURL=sync-engine.js.map