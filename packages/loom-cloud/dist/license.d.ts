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
import type { LicenseInfo } from './types.js';
export declare const LICENSE_PREFIX = "loom:";
export declare const FEATURE_CLOUD_SYNC: number;
export declare const FEATURE_CROSS_PROJECT: number;
export declare const FEATURE_TEAM_SHARING: number;
export declare const FEATURE_LLM_MERGE: number;
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
/**
 * Generate a new Ed25519 keypair for license signing.
 * Returns PEM-encoded keys.
 */
export declare function generateLicenseKeyPair(): {
    publicKey: string;
    privateKey: string;
};
/**
 * Sign a license payload with the given private key (PEM).
 */
export declare function signLicensePayload(encodedPayload: string, privateKeyPem: string): string;
/**
 * Verify a license signature with the given public key (PEM).
 */
export declare function verifyLicenseSignature(encodedPayload: string, encodedSignature: string, publicKeyPem: string): boolean;
export interface GenerateLicenseOptions {
    tier: 'free' | 'pro';
    expiresAt: number | null;
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
export declare function generateLicense(privateKeyPem: string, opts: GenerateLicenseOptions): string;
/**
 * Validate a license key string.
 * Uses the embedded public key for signature verification (no network needed).
 */
export declare function validateLicense(licenseKey: string, publicKeyPem?: string): LicenseValidationResult;
/**
 * Extract the license ID from a license key (for logging / support).
 */
export declare function getLicenseId(licenseKey: string): string | null;
/**
 * Check if a license is expired without full validation (fast check).
 */
export declare function isLicenseExpired(licenseKey: string): boolean;
//# sourceMappingURL=license.d.ts.map