import { describe, it } from 'node:test';
import assert from 'node:assert';
import { generateLicenseKeyPair, generateLicense, validateLicense, signLicensePayload, verifyLicenseSignature, FEATURE_CLOUD_SYNC, FEATURE_CROSS_PROJECT, FEATURE_LLM_MERGE, getLicenseId, } from '../license.js';
describe('license', () => {
    let privateKey;
    let publicKey;
    it('generates an Ed25519 keypair', () => {
        const kp = generateLicenseKeyPair();
        assert.ok(kp.publicKey);
        assert.ok(kp.privateKey);
        assert.ok(kp.publicKey.includes('BEGIN PUBLIC KEY'));
        assert.ok(kp.privateKey.includes('BEGIN PRIVATE KEY'));
        privateKey = kp.privateKey;
        publicKey = kp.publicKey;
    });
    it('signs and verifies a payload', () => {
        const payload = 'test-payload-123';
        const sig = signLicensePayload(payload, privateKey);
        assert.ok(sig);
        assert.ok(verifyLicenseSignature(payload, sig, publicKey));
        assert.ok(!verifyLicenseSignature(payload, sig + 'x', publicKey));
        assert.ok(!verifyLicenseSignature('tampered', sig, publicKey));
    });
    it('generates and validates a pro license', () => {
        const licenseKey = generateLicense(privateKey, {
            tier: 'pro',
            expiresAt: null,
            features: {
                cloudSync: true,
                crossProjectMemory: true,
                llmMerge: true,
            },
        });
        assert.ok(licenseKey.startsWith('loom:'));
        const result = validateLicense(licenseKey, publicKey);
        assert.strictEqual(result.valid, true);
        assert.ok(result.license);
        assert.strictEqual(result.license.tier, 'pro');
        assert.strictEqual(result.license.expiresAt, null);
        assert.strictEqual(result.license.features.cloudSync, true);
        assert.strictEqual(result.license.features.crossProjectMemory, true);
        assert.strictEqual(result.license.features.llmMerge, true);
        assert.strictEqual(result.license.features.teamSharing, false);
    });
    it('generates and validates a free license', () => {
        const licenseKey = generateLicense(privateKey, {
            tier: 'free',
            expiresAt: null,
        });
        const result = validateLicense(licenseKey, publicKey);
        assert.strictEqual(result.valid, true);
        assert.strictEqual(result.license.tier, 'free');
    });
    it('detects an expired license', () => {
        const past = Math.floor(Date.now() / 1000) - 3600; // 1 hour ago
        const licenseKey = generateLicense(privateKey, {
            tier: 'pro',
            expiresAt: past,
        });
        const result = validateLicense(licenseKey, publicKey);
        assert.strictEqual(result.valid, false);
        assert.ok(result.reason.includes('expired'));
    });
    it('detects an invalid signature', () => {
        const licenseKey = generateLicense(privateKey, {
            tier: 'pro',
            expiresAt: null,
        });
        // Keep payload intact but replace signature with random data
        const parts = licenseKey.split(':');
        // parts[0] = 'loom', parts[1] = payload, parts[2] = signature
        const tampered = `${parts[0]}:${parts[1]}:invalidsignature123`;
        const result = validateLicense(tampered, publicKey);
        assert.strictEqual(result.valid, false);
        assert.ok(result.reason.includes('signature'));
    });
    it('detects a malformed license', () => {
        const result = validateLicense('not-a-license');
        assert.strictEqual(result.valid, false);
        assert.ok(result.reason.includes('prefix'));
    });
    it('extracts license ID', () => {
        const licenseKey = generateLicense(privateKey, {
            tier: 'pro',
            expiresAt: null,
        });
        const id = getLicenseId(licenseKey);
        assert.ok(id);
        assert.strictEqual(id.length, 36); // UUID format
    });
    it('round-trips feature bitmask correctly', () => {
        const licenseKey = generateLicense(privateKey, {
            tier: 'pro',
            expiresAt: null,
            features: {
                cloudSync: true,
                crossProjectMemory: true,
                teamSharing: false,
                llmMerge: true,
            },
        });
        const result = validateLicense(licenseKey, publicKey);
        assert.strictEqual(result.license.features.cloudSync, true);
        assert.strictEqual(result.license.features.crossProjectMemory, true);
        assert.strictEqual(result.license.features.teamSharing, false);
        assert.strictEqual(result.license.features.llmMerge, true);
        const expectedMask = FEATURE_CLOUD_SYNC | FEATURE_CROSS_PROJECT | FEATURE_LLM_MERGE;
        assert.strictEqual(result.license.features.cloudSync, (expectedMask & FEATURE_CLOUD_SYNC) !== 0);
    });
});
//# sourceMappingURL=license.test.js.map