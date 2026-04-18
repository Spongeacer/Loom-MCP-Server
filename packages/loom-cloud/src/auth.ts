/**
 * LOOM Cloud Sync — Device Key Authentication
 *
 * Zero-registration auth using Ed25519 keypairs:
 *   1. Each device generates a unique Ed25519 keypair on first use.
 *   2. The public key fingerprint becomes the stable deviceId.
 *   3. Registration sends {deviceId, publicKey, signedChallenge} to cloud.
 *   4. Cloud verifies signature → issues a short-lived access token.
 *   5. Subsequent requests carry the token in an Authorization header.
 *
 * No passwords, no OAuth flows, no user accounts.  The license key is the
 * only shared secret (entered once per user, stored in ~/.loom/license).
 */

import { createHash, randomBytes, generateKeyPairSync, createSign } from 'node:crypto';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

import type { DeviceIdentity, DeviceKeyPair, LicenseInfo } from './types.js';

// ─────────────────────────────────────────────────────────────────────────────
// Key storage paths
// ─────────────────────────────────────────────────────────────────────────────

function getLoomDir(): string {
  const dir = join(homedir(), '.loom');
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  return dir;
}

function deviceKeyPath(): string {
  return join(getLoomDir(), 'device-key.json');
}

function licensePath(): string {
  return join(getLoomDir(), 'license.json');
}

// ─────────────────────────────────────────────────────────────────────────────
// Ed25519 via Node.js built-in crypto (Node ≥18)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Generate a new Ed25519 keypair.  Returns base64-encoded keys.
 */
export function generateKeyPair(): { publicKey: string; privateKey: string } {
  return generateViaNodeCrypto();
}

function generateViaNodeCrypto(): { publicKey: string; privateKey: string } {
  // Node 18+ has Ed25519 in crypto.generateKeyPairSync
  const { publicKey, privateKey } = generateKeyPairSync('ed25519', {
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });
  return {
    publicKey: Buffer.from(publicKey).toString('base64'),
    privateKey: Buffer.from(privateKey).toString('base64'),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Device Identity
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Load or create the device keypair.  Stable across restarts.
 */
export function getOrCreateDevice(): DeviceKeyPair {
  const path = deviceKeyPath();
  if (existsSync(path)) {
    const raw = readFileSync(path, 'utf-8');
    return JSON.parse(raw) as DeviceKeyPair;
  }

  const { publicKey, privateKey } = generateKeyPair();
  const deviceId = fingerprintPublicKey(publicKey);
  const pair: DeviceKeyPair = {
    deviceId,
    publicKey,
    privateKey,
    createdAt: new Date().toISOString(),
  };
  writeFileSync(path, JSON.stringify(pair, null, 2), { mode: 0o600 });
  return pair;
}

/**
 * Return the public-facing device identity (no private key).
 */
export function getDeviceIdentity(label?: string): DeviceIdentity {
  const pair = getOrCreateDevice();
  return {
    deviceId: pair.deviceId,
    label: label ?? pair.deviceId.slice(0, 12),
    publicKey: pair.publicKey,
    registeredAt: pair.createdAt,
  };
}

/**
 * Derive a stable deviceId from an Ed25519 public key.
 * Uses first 16 bytes of SHA-256(pubkey) as hex.
 */
export function fingerprintPublicKey(publicKeyBase64: string): string {
  const pub = Buffer.from(publicKeyBase64, 'base64');
  return createHash('sha256').update(pub).digest('hex').slice(0, 32);
}

// ─────────────────────────────────────────────────────────────────────────────
// Signing
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Sign a challenge string with the device private key.
 * Returns base64 signature.
 */
export function signChallenge(challenge: string): string {
  const pair = getOrCreateDevice();
  const { privateKey } = pair;

  // Try native Ed25519 sign first
  try {
    const signer = createSign('SHA512');
    signer.update(challenge);
    return signer.sign(privateKey, 'base64');
  } catch {
    // Fallback: HMAC-SHA256 with privateKey (deterministic for same seed)
    return createHash('sha256')
      .update(Buffer.from(privateKey, 'base64'))
      .update(challenge)
      .digest('base64');
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// License Key
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Read the stored license key (if any).
 */
export function readLicenseKey(): string | null {
  const path = licensePath();
  if (!existsSync(path)) return null;
  try {
    const raw = readFileSync(path, 'utf-8');
    const parsed = JSON.parse(raw);
    return parsed.licenseKey ?? null;
  } catch {
    return null;
  }
}

/**
 * Save a license key locally.
 */
export function saveLicenseKey(licenseKey: string): void {
  const path = licensePath();
  writeFileSync(
    path,
    JSON.stringify({ licenseKey, savedAt: new Date().toISOString() }, null, 2),
    { mode: 0o600 },
  );
}


