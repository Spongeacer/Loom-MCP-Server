/**
 * LOOM CLI — Cloud Sync Commands
 *
 *   loom sync status          Show sync status and last activity
 *   loom sync start           Start background sync daemon
 *   loom sync stop            Stop background sync daemon
 *   loom sync login <key>     Save license key
 *   loom sync logout          Remove license key and stop sync
 *   loom sync now             Force one-shot sync
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { resolveProjectRoot } from '../../../loom/dist/core/paths.js';
import { FsStoreAdapter } from '../../../loom/dist/core/fs-store-adapter.js';
import { readLicenseKey, saveLicenseKey } from '../auth.js';
import { validateLicense } from '../license.js';
import { createDefaultCloudApiClient } from '../cloud-api.js';
import { createSyncEngine } from '../sync-engine.js';
import { DEFAULT_SYNC_CONFIG } from '../types.js';

function getProjectRoot(rest: string[]): string {
  const cwd = rest.find((a) => !a.startsWith('--'));
  return resolveProjectRoot(cwd);
}

// ── Status ──────────────────────────────────────────────────────────────────

export async function runSyncStatus(rest: string[] = []): Promise<string> {
  const projectRoot = getProjectRoot(rest);
  const syncIndexPath = path.join(projectRoot, '.loom', 'cache', 'sync-index.yml');

  if (!fs.existsSync(syncIndexPath)) {
    return 'Cloud sync: not configured. Run `loom sync login <license-key>` to enable.';
  }

  try {
    const raw = fs.readFileSync(syncIndexPath, 'utf-8');
    const index = JSON.parse(raw);

    const lines: string[] = ['Cloud Sync Status'];
    lines.push(`  Cloud version:     ${index.cloudVersion ?? 0}`);
    lines.push(`  Last pushed:       ${index.lastPushedAt ? new Date(index.lastPushedAt).toLocaleString() : 'never'}`);
    lines.push(`  Last pulled:       ${index.lastPulledAt ? new Date(index.lastPulledAt).toLocaleString() : 'never'}`);

    const dirtyEntries = Object.entries(index.entries as Record<string, { dirty?: boolean }>)
      .filter(([, s]) => s.dirty)
      .map(([id]) => id);

    lines.push(`  Dirty entries:     ${dirtyEntries.length}`);
    if (dirtyEntries.length > 0) {
      lines.push(`    ${dirtyEntries.join(', ')}`);
    }

    // Check license
    const licenseKey = readLicenseKey();
    if (licenseKey) {
      const result = validateLicense(licenseKey);
      lines.push(`  License:           ${result.valid ? '✓ valid' : '✗ ' + result.reason}`);
      if (result.license) {
        lines.push(`  Tier:              ${result.license.tier}`);
        lines.push(`  Expires:           ${result.license.expiresAt ? new Date(result.license.expiresAt * 1000).toLocaleDateString() : 'never'}`);
        lines.push(`  Features:          ${Object.entries(result.license.features).filter(([, v]) => v).map(([k]) => k).join(', ')}`);
      }
    } else {
      lines.push(`  License:           not set`);
    }

    return lines.join('\n');
  } catch (err) {
    return `Cloud sync: error reading sync index — ${err instanceof Error ? err.message : String(err)}`;
  }
}

// ── Login ───────────────────────────────────────────────────────────────────

export async function runSyncLogin(rest: string[] = []): Promise<string> {
  const licenseKey = rest[0];
  if (!licenseKey) {
    return 'Usage: loom sync login <license-key>';
  }

  const result = validateLicense(licenseKey);

  if (!result.valid) {
    return `License validation failed: ${result.reason}`;
  }

  saveLicenseKey(licenseKey);
  return `License saved. Tier: ${result.license!.tier}. Features: ${Object.entries(result.license!.features).filter(([, v]) => v).map(([k]) => k).join(', ')}`;
}

// ── Logout ──────────────────────────────────────────────────────────────────

export async function runSyncLogout(): Promise<string> {
  const licenseKey = readLicenseKey();
  if (!licenseKey) {
    return 'No license key stored.';
  }

  const licensePath = path.join(process.env.HOME || process.env.USERPROFILE || '.', '.loom', 'license.json');
  if (fs.existsSync(licensePath)) {
    fs.unlinkSync(licensePath);
  }

  // Also stop sync if running
  await runSyncStop();
  return 'License removed and sync stopped.';
}

// ── Now (one-shot) ──────────────────────────────────────────────────────────

export async function runSyncNow(rest: string[] = []): Promise<string> {
  const projectRoot = getProjectRoot(rest);

  const licenseKey = readLicenseKey();
  if (!licenseKey) {
    return 'No license key. Run `loom sync login <key>` first.';
  }

  const license = validateLicense(licenseKey);
  if (!license.valid) {
    return `Invalid license: ${license.reason}`;
  }

  const store = new FsStoreAdapter(resolveProjectRoot(projectRoot));
  const config = { ...DEFAULT_SYNC_CONFIG, apiBaseUrl: process.env.LOOM_CLOUD_URL || DEFAULT_SYNC_CONFIG.apiBaseUrl };
  const api = createDefaultCloudApiClient(config);

  const engine = createSyncEngine({
    store,
    api,
    config,
    projectName: store.getConfig()?.project_name || 'unknown',
    projectRoot,
  });

  const result = await engine.sync();

  const lines: string[] = ['Sync complete.'];
  lines.push(`  Pushed:   ${result.pushed}`);
  lines.push(`  Pulled:   ${result.pulled}`);
  if (result.conflicts.length > 0) {
    lines.push(`  Conflicts: ${result.conflicts.length}`);
    for (const c of result.conflicts) {
      lines.push(`    - ${c.winner.id}: ${c.reason}`);
      if (c.fork) lines.push(`      (forked to ${c.fork.id})`);
    }
  }
  if (result.errors.length > 0) {
    lines.push(`  Errors:`);
    for (const e of result.errors) lines.push(`    - ${e}`);
  }

  await engine.shutdown();
  return lines.join('\n');
}

// ── Start / Stop (background daemon) ────────────────────────────────────────

const PID_FILE = 'sync-daemon-pid.txt';
const HEALTH_FILE = 'sync-health.json';

function getDaemonPaths(projectRoot: string) {
  return {
    pid: path.join(projectRoot, '.loom', 'cache', PID_FILE),
    health: path.join(projectRoot, '.loom', 'cache', HEALTH_FILE),
  };
}

export async function runSyncStart(rest: string[] = []): Promise<string> {
  const projectRoot = getProjectRoot(rest);
  const paths = getDaemonPaths(projectRoot);

  // Check if already running
  if (fs.existsSync(paths.pid)) {
    const pid = parseInt(fs.readFileSync(paths.pid, 'utf-8'), 10);
    try {
      process.kill(pid, 0); // signal 0 = existence check
      return `Sync daemon already running (PID ${pid}).`;
    } catch {
      // stale pid file
    }
  }

  const licenseKey = readLicenseKey();
  if (!licenseKey) {
    return 'No license key. Run `loom sync login <key>` first.';
  }

  const license = validateLicense(licenseKey);
  if (!license.valid) {
    return `Invalid license: ${license.reason}`;
  }

  // Spawn detached background process
  const { spawn } = await import('node:child_process');
  const scriptPath = path.join(__dirname, '..', 'sync-daemon-runner.js');

  const child = spawn(process.execPath, [scriptPath, projectRoot], {
    detached: true,
    stdio: 'ignore',
    env: {
      ...process.env,
      LOOM_CLOUD_URL: process.env.LOOM_CLOUD_URL || DEFAULT_SYNC_CONFIG.apiBaseUrl,
    },
  });

  child.unref();

  fs.writeFileSync(paths.pid, String(child.pid));
  fs.writeFileSync(paths.health, JSON.stringify({ startedAt: new Date().toISOString(), pid: child.pid }));

  return `Sync daemon started (PID ${child.pid}).`;
}

export async function runSyncStop(rest: string[] = []): Promise<string> {
  const projectRoot = getProjectRoot(rest);
  const paths = getDaemonPaths(projectRoot);

  if (!fs.existsSync(paths.pid)) {
    return 'Sync daemon not running.';
  }

  const pid = parseInt(fs.readFileSync(paths.pid, 'utf-8'), 10);
  try {
    process.kill(pid, 'SIGTERM');
    // Wait briefly then check
    await new Promise((r) => setTimeout(r, 1000));
    try {
      process.kill(pid, 0);
      process.kill(pid, 'SIGKILL');
    } catch {
      // already exited
    }
  } catch {
    // process already gone
  }

  fs.unlinkSync(paths.pid);
  if (fs.existsSync(paths.health)) fs.unlinkSync(paths.health);

  return 'Sync daemon stopped.';
}
