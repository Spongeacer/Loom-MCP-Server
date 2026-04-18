/**
 * LOOM Cloud Sync — Background Daemon Runner
 *
 * Spawned detached by `loom sync start`.  Mirrors the watch-daemon pattern.
 * Polls for sync every 60 seconds.
 */

import { resolveProjectRoot } from '../../loom/dist/core/paths.js';
import { FsStoreAdapter } from '../../loom/dist/core/fs-store-adapter.js';
import { readLicenseKey } from './auth.js';
import { validateLicense } from './license.js';
import { createDefaultCloudApiClient } from './cloud-api.js';
import { createSyncEngine } from './sync-engine.js';
import { DEFAULT_SYNC_CONFIG } from './types.js';

async function main() {
  const projectRoot = process.argv[2] || resolveProjectRoot();

  const licenseKey = readLicenseKey();
  if (!licenseKey) {
    console.error('[loom-sync] No license key');
    process.exit(1);
  }

  const license = validateLicense(licenseKey);
  if (!license.valid) {
    console.error('[loom-sync] Invalid license:', license.reason);
    process.exit(1);
  }

  const store = new FsStoreAdapter(resolveProjectRoot(projectRoot));
  const config = {
    ...DEFAULT_SYNC_CONFIG,
    apiBaseUrl: process.env.LOOM_CLOUD_URL || DEFAULT_SYNC_CONFIG.apiBaseUrl,
    backgroundSync: true,
  };
  const api = createDefaultCloudApiClient(config);

  const engine = createSyncEngine({
    store,
    api,
    config,
    projectName: store.getConfig()?.project_name || 'unknown',
    projectRoot,
  });

  const stop = engine.startBackgroundSync();

  // Graceful shutdown
  let shuttingDown = false;
  function shutdown() {
    if (shuttingDown) return;
    shuttingDown = true;
    stop();
    engine.shutdown().then(() => process.exit(0)).catch(() => process.exit(1));
  }

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);

  // Keep alive
  setInterval(() => {
    /* noop — timers keep event loop alive */
  }, 60_000);
}

main().catch((e) => {
  console.error('[loom-sync] Fatal:', e);
  process.exit(1);
});
