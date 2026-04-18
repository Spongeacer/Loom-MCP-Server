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
import type { DeviceIdentity, DeviceKeyPair, LicenseInfo } from './types.js';
/**
 * Generate a new Ed25519 keypair.  Returns base64-encoded keys.
 */
export declare function generateKeyPair(): {
    publicKey: string;
    privateKey: string;
};
/**
 * Load or create the device keypair.  Stable across restarts.
 */
export declare function getOrCreateDevice(): DeviceKeyPair;
/**
 * Return the public-facing device identity (no private key).
 */
export declare function getDeviceIdentity(label?: string): DeviceIdentity;
/**
 * Derive a stable deviceId from an Ed25519 public key.
 * Uses first 16 bytes of SHA-256(pubkey) as hex.
 */
export declare function fingerprintPublicKey(publicKeyBase64: string): string;
/**
 * Sign a challenge string with the device private key.
 * Returns base64 signature.
 */
export declare function signChallenge(challenge: string): string;
/**
 * Read the stored license key (if any).
 */
export declare function readLicenseKey(): string | null;
/**
 * Save a license key locally.
 */
export declare function saveLicenseKey(licenseKey: string): void;
/**
 * Validate license with the cloud server.
 * Returns LicenseInfo or null if invalid.
 */
export declare function validateLicense(licenseKey: string, apiBaseUrl: string): Promise<LicenseInfo | null>;
//# sourceMappingURL=auth.d.ts.map