/**
 * LOOM Cloud Sync — Minimal Conflict Resolver
 *
 * Philosophy: the cloud server is the "smart merge centre" that runs LLM-based
 * consolidation across all projects.  The device only needs to arbitrate
 * between "cloud version" and "local version".  No LLM calls, no semantic
 * analysis, no field-level merging on the device.
 *
 * Three scenarios:
 *   1. Cloud has it, local doesn't      → adopt cloud
 *   2. Local has it, cloud doesn't      → keep local, mark dirty
 *   3. Both have it (offline edit)      → cloud wins (already merged upstream);
 *                                           fork local to draft for user review
 */
import type { Entry } from '../../loom/dist/types/index.js';
import type { ConflictResult, EntrySyncState } from './types.js';
/**
 * Resolve a conflict between a local entry and its cloud counterpart.
 *
 * @param local      The entry currently in the local store (null if absent).
 * @param cloud      The entry pulled from cloud (null if absent).
 * @param syncState  Previous sync state for this entry (used to detect dirty).
 * @returns          ConflictResult describing the winner and optional fork.
 */
export declare function resolveConflict(local: Entry | null, cloud: Entry | null, syncState: EntrySyncState | undefined, cloudVersion?: number): ConflictResult;
/**
 * Determine whether a local entry is "dirty" (has unsynced modifications).
 * Used by the sync engine before push.
 */
export declare function isEntryDirty(entry: Entry, syncState: EntrySyncState | undefined): boolean;
//# sourceMappingURL=conflict-resolver.d.ts.map