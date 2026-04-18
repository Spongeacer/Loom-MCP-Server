/**
 * LOOM Cloud Sync — Public API
 *
 * Export everything needed by the core loom package to enable cloud sync.
 */
export type { CloudEntry, CloudMeta, CloudProvenance, ConflictResult, ConflictStrategy, DeviceIdentity, DeviceKeyPair, EntrySyncState, LicenseInfo, PullPayload, PullResponse, PushPayload, PushResponse, RegisterDevicePayload, RegisterDeviceResponse, SyncConfig, SyncIndex, SyncResult, } from './types.js';
export { DEFAULT_SYNC_CONFIG } from './types.js';
export { generateLicenseKeyPair, generateLicense, validateLicense as validateLicenseKey, signLicensePayload, verifyLicenseSignature, getLicenseId, isLicenseExpired, FEATURE_CLOUD_SYNC, FEATURE_CROSS_PROJECT, FEATURE_TEAM_SHARING, FEATURE_LLM_MERGE, } from './license.js';
export type { LicensePayload, LicenseValidationResult, GenerateLicenseOptions } from './license.js';
export { resolveConflict, isEntryDirty } from './conflict-resolver.js';
export { generateKeyPair, getOrCreateDevice, getDeviceIdentity, fingerprintPublicKey, signChallenge, readLicenseKey, saveLicenseKey, validateLicense, } from './auth.js';
export { CloudApiError, createCloudApiClient, createDefaultCloudApiClient, createMemoryTokenManager, } from './cloud-api.js';
export type { CloudApiClient, CloudApiClientOptions, TokenManager } from './cloud-api.js';
export { createSyncEngine } from './sync-engine.js';
export type { SyncEngine, SyncEngineOptions } from './sync-engine.js';
//# sourceMappingURL=index.d.ts.map