export { getOrCreateDevice, signDeviceChallenge } from './auth.js';
export type { DeviceIdentity } from './auth.js';

export {
  generateLicenseKeyPair,
  signLicensePayload,
  verifyLicensePayload,
  generateLicense,
  validateLicense,
  FEATURE_CLOUD_SYNC,
  FEATURE_CROSS_PROJECT,
  FEATURE_TEAM_SHARING,
  FEATURE_LLM_MERGE,
} from './license.js';
export type { LicenseInfo, LicenseKeyPair, ValidationResult } from './license.js';

export { resolveConflict } from './conflict-resolver.js';
export type { ConflictStrategy, ConflictResult, EntrySyncState } from './conflict-resolver.js';

export { CloudApiClient } from './cloud-api.js';
export type { CloudApiConfig, PushResult, PullResult } from './cloud-api.js';

export { SyncEngineImpl } from './sync-engine.js';
export type { SyncIndex, SyncResult, SyncEngine } from './sync-engine.js';
