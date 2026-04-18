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
/**
 * Resolve a conflict between a local entry and its cloud counterpart.
 *
 * @param local      The entry currently in the local store (null if absent).
 * @param cloud      The entry pulled from cloud (null if absent).
 * @param syncState  Previous sync state for this entry (used to detect dirty).
 * @returns          ConflictResult describing the winner and optional fork.
 */
export function resolveConflict(local, cloud, syncState, cloudVersion) {
    // ── Scenario 1: cloud only ───────────────────────────────────────────────
    if (!local && cloud) {
        return {
            winner: cloud,
            fork: null,
            strategy: 'cloud-wins',
            reason: 'Cloud entry does not exist locally; adopting.',
        };
    }
    // ── Scenario 2: local only ───────────────────────────────────────────────
    if (local && !cloud) {
        return {
            winner: local,
            fork: null,
            strategy: 'local-wins',
            reason: 'Local entry not yet pushed to cloud; keeping.',
        };
    }
    // Defensive: both null should never happen, but handle gracefully.
    if (!local && !cloud) {
        return {
            winner: null,
            fork: null,
            strategy: 'cloud-wins',
            reason: 'Both local and cloud entries are absent; no-op.',
        };
    }
    // At this point both local and cloud are non-null.
    const localEntry = local;
    const cloudEntry = cloud;
    // ── Scenario 3: both exist ───────────────────────────────────────────────
    // Cloud version may be passed explicitly (from CloudMeta) or inferred from entry metadata.
    const resolvedCloudVersion = cloudVersion ?? extractCloudVersion(cloudEntry);
    const localCloudVersion = syncState?.cloudVersion ?? 0;
    // 3a. Cloud has a newer merged version → cloud wins, always.
    if (resolvedCloudVersion > localCloudVersion) {
        // 3b. Local was modified while offline → fork to draft for manual merge.
        const localWasModified = syncState?.dirty ?? false;
        if (localWasModified) {
            const forked = createFork(localEntry);
            return {
                winner: cloudEntry,
                fork: forked,
                strategy: 'fork-local',
                reason: `Cloud merged version ${cloudVersion} is newer than local ` +
                    `version ${localCloudVersion}. Local offline edits forked to draft ` +
                    `"${forked.id}" for manual review.`,
            };
        }
        // 3c. Local was not modified → simple cloud overwrite.
        return {
            winner: cloudEntry,
            fork: null,
            strategy: 'cloud-wins',
            reason: `Cloud version ${resolvedCloudVersion} supersedes local ${localCloudVersion}.`,
        };
    }
    // 3d. Cloud version is same or older → keep local, it will be pushed later.
    return {
        winner: localEntry,
        fork: null,
        strategy: 'local-wins',
        reason: `Local version ${localEntry.version} is ahead of or equal to ` +
            `cloud version ${resolvedCloudVersion}; keeping local.`,
    };
}
// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────
/**
 * Read cloudVersion from an entry's metadata.  Cloud entries carry this in
 * `entry.metadata.sync.cloudVersion` (a convention shared with the server).
 * Falls back to 0 if missing.
 */
function extractCloudVersion(entry) {
    const meta = entry.metadata;
    if (meta && typeof meta === 'object' && 'sync' in meta) {
        const sync = meta.sync;
        if (sync && typeof sync === 'object' && 'cloudVersion' in sync) {
            const cv = sync.cloudVersion;
            if (typeof cv === 'number')
                return cv;
        }
    }
    return 0;
}
/**
 * Create a forked draft entry from a local entry that lost a conflict.
 * The fork lives in namespace 'local' so it never syncs to cloud.
 */
function createFork(original) {
    const timestamp = Date.now();
    const forkId = `${original.id}-local-${timestamp}`;
    return {
        ...original,
        id: forkId,
        namespace: 'local',
        version: 1,
        lifecycle: {
            ...original.lifecycle,
            state: 'draft',
            updated: new Date().toISOString(),
        },
        // Store fork provenance in activation metadata (non-invasive).
        activation: {
            ...original.activation,
            keywords: [...original.activation.keywords, 'fork', 'conflict'],
        },
        // We intentionally do NOT copy bindings to avoid graph pollution.
        bindings_out: [],
        bindings_in: [],
    };
}
/**
 * Determine whether a local entry is "dirty" (has unsynced modifications).
 * Used by the sync engine before push.
 */
export function isEntryDirty(entry, syncState) {
    if (!syncState)
        return true; // Never synced = dirty
    const localUpdated = new Date(entry.lifecycle.updated).getTime();
    const lastPush = syncState.lastPushAt
        ? new Date(syncState.lastPushAt).getTime()
        : 0;
    return localUpdated > lastPush;
}
//# sourceMappingURL=conflict-resolver.js.map