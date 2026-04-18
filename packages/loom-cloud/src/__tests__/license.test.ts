import { describe, it } from 'node:test';
import assert from 'node:assert';
import { generateLicenseKeyPair, generateLicense, validateLicense, FEATURE_CLOUD_SYNC, FEATURE_CROSS_PROJECT } from '../license.js';

describe('license', () => {
  it('generates and validates a license', () => {
    const kp = generateLicenseKeyPair();
    const expires = Math.floor(Date.now() / 1000) + 86400;
    const license = generateLicense('pro', FEATURE_CLOUD_SYNC | FEATURE_CROSS_PROJECT, expires, kp);
    assert.ok(license.startsWith('loom:'));

    const result = validateLicense(license, kp.publicKey);
    assert.strictEqual(result.valid, true);
    assert.ok(result.info);
    assert.strictEqual(result.info!.t, 'pro');
    assert.ok(result.features! & FEATURE_CLOUD_SYNC);
  });

  it('rejects expired license', () => {
    const kp = generateLicenseKeyPair();
    const expires = Math.floor(Date.now() / 1000) - 86400;
    const license = generateLicense('pro', 0, expires, kp);
    const result = validateLicense(license, kp.publicKey);
    assert.strictEqual(result.valid, false);
    assert.ok(result.reason?.includes('Expired'));
  });

  it('rejects invalid format', () => {
    const result = validateLicense('invalid-license');
    assert.strictEqual(result.valid, false);
    assert.ok(result.reason?.includes('Invalid format'));
  });
});
