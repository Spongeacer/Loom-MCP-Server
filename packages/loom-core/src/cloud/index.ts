// Cloud client infrastructure — lives in loom-core so local packages
// (loom-cli, loom-mcp) can talk to the cloud without depending on loom-cloud.

export { CloudApiClient } from './api.js';
export type {
  CloudApiConfig,
  AuthResult,
  PushConflict,
  PushResult,
  PullResult,
  UserProfileResult,
  ExtractResult,
} from './api.js';

export {
  loadCloudConfig,
  saveCloudConfig,
  CLOUD_CONFIG_PATH,
} from './config.js';
export type { CloudConfig } from './config.js';

export { SyncEngineImpl } from './sync-engine.js';
export type {
  SyncIndex,
  SyncResult,
  SyncEngine,
} from './sync-engine.js';

export { resolveConflict } from './conflict-resolver.js';
export type {
  ConflictStrategy,
  ConflictResult,
  EntrySyncState,
} from './conflict-resolver.js';

export { getOrCreateDevice, signDeviceChallenge } from './device.js';
export type { DeviceIdentity } from './device.js';
