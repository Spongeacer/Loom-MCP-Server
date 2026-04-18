/**
 * LOOM Cloud Sync — Type Definitions
 *
 * These types extend the core LOOM Entry model with cloud-sync-specific
 * metadata.  All cloud-aware fields live in a single `sync` sub-object so
 * the core Entry schema never has to change.
 */
export const DEFAULT_SYNC_CONFIG = {
    apiBaseUrl: 'https://cloud.loom-mcp.dev',
    pullIntervalMs: 60_000,
    pushTimeoutMs: 10_000,
    backgroundSync: false,
    llmMergeEnabled: true,
};
//# sourceMappingURL=types.js.map