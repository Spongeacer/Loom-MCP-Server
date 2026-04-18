/**
 * LOOM Cloud Sync — License Management
 *
 * License key format: loom:<base64_payload>:<base64_signature>
 *
 * Payload (JSON, minified then base64url):
 *   {
 *     v: 1,              // format version
 *     t: 'pro',          // tier: 'free' | 'pro'
 *     e: 1735689600,     // expiresAt (Unix seconds), null for lifetime
 *     f: 15,             // feature bitmask
 *     i: 1710000000,     // issuedAt (Unix seconds)
 *     id: 'uuid'         // unique license id
 *   }
 *
 * Signature: Ed25519 sign(privateKey, payload_bytes)
 *
 * Device-side validation uses the embedded public key (offline-capable).
 * Cloud-side validation uses the private key (can also re-sign / rotate).
 */

import { createHash, randomBytes, generateKeyPairSync, sign, verify, randomUUID as cryptoRandomUUID } from 'node:crypto';
import type { LicenseInfo } from './types.js';

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

export const LICENSE_PREFIX = 'loom:';
const LICENSE_VERSION = 1;

// Feature bitmasks
export const FEATURE_CLOUD_SYNC = 1 << 0;
export const FEATURE_CROSS_PROJECT = 1 << 1;
export const FEATURE_TEAM_SHARING = 1 << 2;
export const FEATURE_LLM_MERGE = 1 << 3;

// Embedded public key for device-side validation (PEM format).
// In production this is the public counterpart of the server's private key.
// This is safe to embed — it's a public key.
const EMBEDDED_PUBLIC_KEY_PEM = ''; // TODO: embed real Ed25519 SPKI PEM here

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface LicensePayload {
  v: number;
  t: 'free' | 'pro';
  e: number | null;
  f: number;
  i: number;
  id: string;
}

export interface LicenseValidationResult {
  valid: boolean;
  license: LicenseInfo | null;
  reason: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Encode / Decode
// ─────────────────────────────────────────────────────────────────────────────

function base64urlEncode(buf: Buffer): string {
  return buf.toString('base64url').replace(/=+$/, '');
}

function base64urlDecode(str: string): Buffer {
  // Restore padding if needed
  const pad = str.length % 4;
  if (pad) str += '='.repeat(4 - pad);
  return Buffer.from(str, 'base64url');
}

function encodePayload(payload: LicensePayload): string {
  return base64urlEncode(Buffer.from(JSON.stringify(payload), 'utf-8'));
}

function decodePayload(encoded: string): LicensePayload | null {
  try {
    const buf = base64urlDecode(encoded);
    const parsed = JSON.parse(buf.toString('utf-8'));
    if (
      typeof parsed.v === 'number' &&
      typeof parsed.t === 'string' &&
      (parsed.e === null || typeof parsed.e === 'number') &&
      typeof parsed.f === 'number' &&
      typeof parsed.i === 'number' &&
      typeof parsed.id === 'string'
    ) {
      return parsed as LicensePayload;
    }
  } catch {
    // ignore
  }
  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Signing (server-side only — requires private key)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Generate a new Ed25519 keypair for license signing.
 * Returns PEM-encoded keys.
 */
export function generateLicenseKeyPair(): { publicKey: string; privateKey: string } {
  try {
    return generateKeyPairSync('ed25519', {
      publicKeyEncoding: { type: 'spki', format: 'pem' },
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    });
  } catch (err) {
    throw new Error(
      `Failed to generate Ed25519 keypair: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

/**
 * Sign a license payload with the given private key (PEM).
 */
export function signLicensePayload(encodedPayload: string, privateKeyPem: string): string {
  try {
    const sig = sign(null, Buffer.from(encodedPayload, 'utf-8'), privateKeyPem);
    return base64urlEncode(sig);
  } catch (err) {
    throw new Error(
      `Failed to sign license: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

/**
 * Verify a license signature with the given public key (PEM).
 */
export function verifyLicenseSignature(
  encodedPayload: string,
  encodedSignature: string,
  publicKeyPem: string,
): boolean {
  try {
    const payloadBuf = Buffer.from(encodedPayload, 'utf-8');
    const sigBuf = base64urlDecode(encodedSignature);
    return verify(null, payloadBuf, publicKeyPem, sigBuf);
  } catch {
    return false;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// License Generation (server-side)
// ─────────────────────────────────────────────────────────────────────────────

export interface GenerateLicenseOptions {
  tier: 'free' | 'pro';
  expiresAt: number | null; // Unix seconds
  features?: {
    cloudSync?: boolean;
    crossProjectMemory?: boolean;
    teamSharing?: boolean;
    llmMerge?: boolean;
  };
  licenseId?: string;
}

/**
 * Generate a complete license key string.
 * Requires the server's private key (PEM).
 */
export function generateLicense(
  privateKeyPem: string,
  opts: GenerateLicenseOptions,
): string {
  const features = opts.features ?? {};
  let f = 0;
  if (features.cloudSync) f |= FEATURE_CLOUD_SYNC;
  if (features.crossProjectMemory) f |= FEATURE_CROSS_PROJECT;
  if (features.teamSharing) f |= FEATURE_TEAM_SHARING;
  if (features.llmMerge) f |= FEATURE_LLM_MERGE;

  const payload: LicensePayload = {
    v: LICENSE_VERSION,
    t: opts.tier,
    e: opts.expiresAt,
    f,
    i: Math.floor(Date.now() / 1000),
    id: opts.licenseId ?? randomUUID(),
  };

  const encodedPayload = encodePayload(payload);
  const encodedSignature = signLicensePayload(encodedPayload, privateKeyPem);

  return `${LICENSE_PREFIX}${encodedPayload}:${encodedSignature}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// License Validation (device-side, offline-capable)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Validate a license key string.
 * Uses the embedded public key for signature verification (no network needed).
 */
export function validateLicense(
  licenseKey: string,
  publicKeyPem?: string,
): LicenseValidationResult {
  // 1. Format check
  if (!licenseKey.startsWith(LICENSE_PREFIX)) {
    return { valid: false, license: null, reason: 'Invalid license format (missing prefix)' };
  }

  const body = licenseKey.slice(LICENSE_PREFIX.length);
  const parts = body.split(':');
  if (parts.length !== 2) {
    return { valid: false, license: null, reason: 'Invalid license format (expected payload:sig)' };
  }

  const [encodedPayload, encodedSignature] = parts;

  // 2. Payload decode
  const payload = decodePayload(encodedPayload);
  if (!payload) {
    return { valid: false, license: null, reason: 'Invalid license payload (malformed JSON)' };
  }

  if (payload.v !== LICENSE_VERSION) {
    return { valid: false, license: null, reason: `Unsupported license version: ${payload.v}` };
  }

  // 3. Expiration check
  if (payload.e !== null && payload.e < Math.floor(Date.now() / 1000)) {
    return { valid: false, license: null, reason: 'License expired' };
  }

  // 4. Signature verification
  const pubKey = publicKeyPem ?? getEmbeddedPublicKey();
  if (!verifyLicenseSignature(encodedPayload, encodedSignature, pubKey)) {
    return { valid: false, license: null, reason: 'Invalid license signature' };
  }

  // 5. Build LicenseInfo
  const licenseInfo: LicenseInfo = {
    licenseKey,
    tier: payload.t,
    expiresAt: payload.e,
    features: {
      cloudSync: (payload.f & FEATURE_CLOUD_SYNC) !== 0,
      crossProjectMemory: (payload.f & FEATURE_CROSS_PROJECT) !== 0,
      teamSharing: (payload.f & FEATURE_TEAM_SHARING) !== 0,
      llmMerge: (payload.f & FEATURE_LLM_MERGE) !== 0,
    },
  };

  return { valid: true, license: licenseInfo, reason: 'License valid' };
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function randomUUID(): string {
  try {
    return cryptoRandomUUID();
  } catch {
    // Fallback for older Node versions
    const hex = randomBytes(16).toString('hex');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
  }
}

function getEmbeddedPublicKey(): string {
  return EMBEDDED_PUBLIC_KEY_PEM;
}

/**
 * Extract the license ID from a license key (for logging / support).
 */
export function getLicenseId(licenseKey: string): string | null {
  if (!licenseKey.startsWith(LICENSE_PREFIX)) return null;
  const body = licenseKey.slice(LICENSE_PREFIX.length);
  const parts = body.split(':');
  if (parts.length !== 2) return null;
  const payload = decodePayload(parts[0]);
  return payload?.id ?? null;
}

/**
 * Check if a license is expired without full validation (fast check).
 */
export function isLicenseExpired(licenseKey: string): boolean {
  const result = validateLicense(licenseKey);
  return !result.valid && result.reason === 'License expired';
}
