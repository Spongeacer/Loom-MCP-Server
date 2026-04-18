/**
 * LOOM Cloud Sync — Public API
 *
 * Export everything needed by the core loom package to enable cloud sync.
 */

// Types
export type {
  CloudEntry,
  CloudMeta,
  CloudProvenance,
  ConflictResult,
  ConflictStrategy,
  DeviceIdentity,
  DeviceKeyPair,
  EntrySyncState,
  LicenseInfo,
  PullPayload,
  PullResponse,
  PushPayload,
  PushResponse,
  RegisterDevicePayload,
  RegisterDeviceResponse,
  SyncConfig,
  SyncIndex,
  SyncResult,
} from './types.js';
export { DEFAULT_SYNC_CONFIG } from './types.js';

// License
export {
  generateLicenseKeyPair,
  generateLicense,
  validateLicense as validateLicenseKey,
  signLicensePayload,
  verifyLicenseSignature,
  getLicenseId,
  isLicenseExpired,
  FEATURE_CLOUD_SYNC,
  FEATURE_CROSS_PROJECT,
  FEATURE_TEAM_SHARING,
  FEATURE_LLM_MERGE,
} from './license.js';
export type { LicensePayload, LicenseValidationResult, GenerateLicenseOptions } from './license.js';

// Conflict resolution
export { resolveConflict, isEntryDirty } from './conflict-resolver.js';

// Auth
export {
  generateKeyPair,
  getOrCreateDevice,
  getDeviceIdentity,
  fingerprintPublicKey,
  signChallenge,
  readLicenseKey,
  saveLicenseKey,
} from './auth.js';

// Cloud API
export {
  CloudApiError,
  createCloudApiClient,
  createDefaultCloudApiClient,
  createMemoryTokenManager,
} from './cloud-api.js';
export type { CloudApiClient, CloudApiClientOptions, TokenManager } from './cloud-api.js';

// Sync Engine
export { createSyncEngine } from './sync-engine.js';
export type { SyncEngine, SyncEngineOptions } from './sync-engine.js';

// Sync Commands
export {
  runSyncStatus,
  runSyncLogin,
  runSyncLogout,
  runSyncNow,
  runSyncStart,
  runSyncStop,
} from './commands/sync.js';
