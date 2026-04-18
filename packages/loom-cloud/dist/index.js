/**
 * LOOM Cloud Sync — Public API
 *
 * Export everything needed by the core loom package to enable cloud sync.
 */
export { DEFAULT_SYNC_CONFIG } from './types.js';
// License
export { generateLicenseKeyPair, generateLicense, validateLicense as validateLicenseKey, signLicensePayload, verifyLicenseSignature, getLicenseId, isLicenseExpired, FEATURE_CLOUD_SYNC, FEATURE_CROSS_PROJECT, FEATURE_TEAM_SHARING, FEATURE_LLM_MERGE, } from './license.js';
// Conflict resolution
export { resolveConflict, isEntryDirty } from './conflict-resolver.js';
// Auth
export { generateKeyPair, getOrCreateDevice, getDeviceIdentity, fingerprintPublicKey, signChallenge, readLicenseKey, saveLicenseKey, validateLicense, } from './auth.js';
// Cloud API
export { CloudApiError, createCloudApiClient, createDefaultCloudApiClient, createMemoryTokenManager, } from './cloud-api.js';
// Sync Engine
export { createSyncEngine } from './sync-engine.js';
//# sourceMappingURL=index.js.map