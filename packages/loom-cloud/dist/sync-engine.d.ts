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
import type { StoreAdapter } from '../../loom/dist/core/store-adapter.js';
import type { SyncConfig, SyncIndex, SyncResult } from './types.js';
import type { CloudApiClient } from './cloud-api.js';
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
}
export declare function createSyncEngine(opts: SyncEngineOptions): SyncEngine;
//# sourceMappingURL=sync-engine.d.ts.map