import type { StoreAdapter } from '@spongeacer/loom-core';
import * as fs from 'node:fs';
import { CloudApiClient, getOrCreateDevice, signDeviceChallenge, SyncEngineImpl, loadCloudConfig, saveCloudConfig, CLOUD_CONFIG_PATH } from '@spongeacer/loom-core';
import type { CloudConfig } from '@spongeacer/loom-core';

export async function runCloudAdminAllocate(args: string[]): Promise<string> {
  const baseUrl = args[0];
  const adminSecret = args[1];
  if (!baseUrl || !adminSecret) {
    return 'Usage: loom cloud admin allocate <base-url> <admin-secret>\nExample: loom cloud admin allocate https://loom.example.com my-admin-secret';
  }

  const client = new CloudApiClient({ baseUrl });
  const result = await client.adminAllocate(adminSecret);

  if (!result.ok || !result.license) {
    return `Allocation failed: ${result.error || 'No licenses available'}`;
  }

  return `Allocated license: ${result.license}\n\nGive this key to the user. It is now marked as allocated and cannot be assigned again.`;
}

export async function runCloudAdminStats(args: string[]): Promise<string> {
  const baseUrl = args[0];
  const adminSecret = args[1];
  if (!baseUrl || !adminSecret) {
    return 'Usage: loom cloud admin stats <base-url> <admin-secret>\nExample: loom cloud admin stats https://loom.example.com my-admin-secret';
  }

  const client = new CloudApiClient({ baseUrl });
  const result = await client.adminStats(adminSecret);

  if (!result.ok) {
    return `Query failed: ${result.error || 'Unknown error'}`;
  }

  const lines: string[] = [];
  lines.push('License inventory:');
  lines.push(`  Total:     ${result.total}`);
  lines.push(`  Available: ${result.available} (never allocated)`);
  lines.push(`  Allocated: ${result.allocated} (given out but not yet activated)`);
  lines.push(`  Activated: ${result.activated} (in use)`);
  return lines.join('\n');
}

export async function runCloudActivate(args: string[]): Promise<string> {
  const licenseKey = args[0];
  if (!licenseKey) {
    return 'Usage: loom cloud activate <license-key>\nExample: loom cloud activate LOOM-BETA-ABCD-EFGH-IJKL';
  }

  const config = loadCloudConfig();
  if (!config?.userToken || !config.baseUrl) {
    return 'No user token found. Run: loom cloud signup <url> <username> <password>\nOr: loom cloud login <url> <username> <password>';
  }

  const client = new CloudApiClient({ baseUrl: config.baseUrl });
  const result = await client.activate(config.userToken, licenseKey);

  if (!result.ok) {
    return `Activation failed: ${result.error || 'Unknown error'}`;
  }

  return `License activated successfully!\nTier: ${result.tier}\nFeatures: ${result.features}`;
}

export async function runCloudLicenseStatus(): Promise<string> {
  const config = loadCloudConfig();
  if (!config?.token || !config.baseUrl) {
    return 'Not registered. Run: loom cloud register <url>';
  }

  const client = new CloudApiClient({ baseUrl: config.baseUrl });
  const result = await client.getLicenseStatus(config.token);

  if (!result.ok) {
    return `Query failed: ${result.error || 'Unknown error'}`;
  }

  if (!result.active) {
    return 'No active license.\nRun: loom cloud activate <license-key>';
  }

  const lines: string[] = [];
  lines.push('License status:');
  lines.push(`  Active: yes`);
  lines.push(`  Tier: ${result.tier}`);
  lines.push(`  Features: ${result.features}`);
  if (result.expiresAt) {
    lines.push(`  Expires: ${new Date(result.expiresAt * 1000).toISOString()}`);
  }
  return lines.join('\n');
}

export async function runCloudSignup(args: string[]): Promise<string> {
  const baseUrl = args[0];
  const username = args[1];
  const password = args[2];

  if (!baseUrl || !username || !password) {
    return 'Usage: loom cloud signup <base-url> <username> <password>\nExample: loom cloud signup https://loom.example.com alice mypassword';
  }

  const client = new CloudApiClient({ baseUrl });
  const result = await client.signup(username, password);

  if (!result.ok || !result.token) {
    return `Signup failed: ${result.error || 'Unknown error'}`;
  }

  const config = loadCloudConfig() ?? { baseUrl, token: '', registeredAt: '' };
  config.baseUrl = baseUrl;
  config.userToken = result.token;
  saveCloudConfig(config);

  return `Signup successful!\nUser token saved to: ${CLOUD_CONFIG_PATH}`;
}

export async function runCloudLogin(args: string[]): Promise<string> {
  const baseUrl = args[0];
  const username = args[1];
  const password = args[2];

  if (!baseUrl || !username || !password) {
    return 'Usage: loom cloud login <base-url> <username> <password>\nExample: loom cloud login https://loom.example.com alice mypassword';
  }

  const client = new CloudApiClient({ baseUrl });
  const result = await client.login(username, password);

  if (!result.ok || !result.token) {
    return `Login failed: ${result.error || 'Unknown error'}`;
  }

  const config = loadCloudConfig() ?? { baseUrl, token: '', registeredAt: '' };
  config.baseUrl = baseUrl;
  config.userToken = result.token;
  saveCloudConfig(config);

  return `Login successful!\nUser token saved to: ${CLOUD_CONFIG_PATH}`;
}

export async function runCloudRegister(args: string[]): Promise<string> {
  const baseUrl = args[0];
  if (!baseUrl) {
    return 'Usage: loom cloud register <base-url>\nExample: loom cloud register https://loom.example.com';
  }

  const config = loadCloudConfig();
  if (!config?.userToken) {
    return 'No user token found. Run: loom cloud signup <url> <username> <password>\nOr: loom cloud login <url> <username> <password>';
  }

  const device = getOrCreateDevice();
  const challenge = `loom-register-${device.deviceId}`;
  const signature = signDeviceChallenge(device, challenge);

  const client = new CloudApiClient({ baseUrl });
  const result = await client.register(device.deviceId, device.publicKey, signature, config.userToken);

  if (!result.ok || !result.token) {
    return `Registration failed: ${result.error || 'Unknown error'}`;
  }

  saveCloudConfig({
    baseUrl,
    token: result.token,
    userToken: config.userToken,
    registeredAt: new Date().toISOString(),
  });

  return `Registered successfully!\nBase URL: ${baseUrl}\nToken saved to: ${CLOUD_CONFIG_PATH}`;
}

export async function runCloudSync(store: StoreAdapter): Promise<string> {
  const config = loadCloudConfig();
  if (!config?.baseUrl || !config.token) {
    return 'Not registered to any cloud server. Run: loom cloud register <base-url>';
  }

  const loomConfig = store.getConfig();
  const projectId = loomConfig?.project_id || 'default';
  if (!loomConfig?.project_id) {
    console.error('[LOOM Cloud] Warning: workspace lacks project_id; using "default" for sync compatibility.');
  }

  const client = new CloudApiClient({ baseUrl: config.baseUrl });
  const engine = new SyncEngineImpl(store, client, config.token, projectId);

  // Mark all local entries as dirty so they get pushed
  for (const entry of store.listEntries()) {
    engine.markDirty(entry.id);
  }

  const result = await engine.sync();
  const lines: string[] = [];
  lines.push('Cloud sync complete:');
  lines.push(`  Project: ${loomConfig?.project_name || 'unknown'} (${projectId})`);
  lines.push(`  Pushed: ${result.pushed}`);
  lines.push(`  Pulled: ${result.pulled}`);
  lines.push(`  Conflicts: ${result.conflicts}`);
  if (result.errors.length > 0) {
    lines.push(`  Errors:`);
    for (const e of result.errors) lines.push(`    - ${e}`);
  }
  return lines.join('\n');
}

export function runCloudStatus(): string {
  const config = loadCloudConfig();
  if (!config) {
    return 'Not registered to any cloud server.\nRun: loom cloud signup <url> <user> <pass>\nThen: loom cloud register <url>';
  }
  const lines: string[] = [];
  lines.push('Cloud status:');
  lines.push(`  Base URL: ${config.baseUrl}`);
  lines.push(`  Has user token: ${config.userToken ? 'yes' : 'no'}`);
  lines.push(`  Has device token: ${config.token ? 'yes' : 'no'}`);
  lines.push(`  Registered: ${config.registeredAt || 'never'}`);
  lines.push(`  Config: ${CLOUD_CONFIG_PATH}`);
  return lines.join('\n');
}

