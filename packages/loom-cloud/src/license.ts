import { generateEd25519KeyPair, signChallenge, verifySignature } from '@spongeacer/loom-core';

export interface LicenseInfo {
  v: number;
  t: 'pro' | 'free' | 'team';
  e: number;
  f: number;
  i: number;
  id: string;
}

export interface LicenseKeyPair {
  publicKey: string;
  privateKey: string;
}

export const FEATURE_CLOUD_SYNC = 1;
export const FEATURE_CROSS_PROJECT = 2;
export const FEATURE_TEAM_SHARING = 4;
export const FEATURE_LLM_MERGE = 8;

export function generateLicenseKeyPair(): LicenseKeyPair {
  return generateEd25519KeyPair();
}

export function signLicensePayload(payload: string, privateKey: string): string {
  return signChallenge(privateKey, payload);
}

export function verifyLicensePayload(payload: string, signature: string, publicKey: string): boolean {
  return verifySignature(publicKey, payload, signature);
}

export function generateLicense(
  tier: LicenseInfo['t'],
  features: number,
  expiresAt: number,
  keyPair: LicenseKeyPair,
  id?: string,
): string {
  const info: LicenseInfo = {
    v: 1,
    t: tier,
    e: expiresAt,
    f: features,
    i: Date.now(),
    id: id || `lic-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  };
  const payload = Buffer.from(JSON.stringify(info)).toString('base64');
  const signature = signLicensePayload(payload, keyPair.privateKey);
  return `loom:${payload}:${signature}`;
}

export interface ValidationResult {
  valid: boolean;
  info?: LicenseInfo;
  features?: number;
  reason?: string;
}

export function validateLicense(key: string, publicKey?: string): ValidationResult {
  const parts = key.split(':');
  if (parts.length !== 3 || parts[0] !== 'loom') {
    return { valid: false, reason: 'Invalid format' };
  }
  const [, payload, signature] = parts;
  let info: LicenseInfo;
  try {
    info = JSON.parse(Buffer.from(payload, 'base64').toString('utf-8'));
  } catch {
    return { valid: false, reason: 'Invalid payload' };
  }
  if (info.e < Date.now() / 1000) {
    return { valid: false, info, features: info.f, reason: 'Expired' };
  }
  if (publicKey && !verifyLicensePayload(payload, signature, publicKey)) {
    return { valid: false, info, features: info.f, reason: 'Invalid signature' };
  }
  return { valid: true, info, features: info.f };
}
