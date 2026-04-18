import { describe, it } from 'node:test';
import assert from 'node:assert';
import { generateKeyPair, fingerprintPublicKey, getOrCreateDevice, getDeviceIdentity, signChallenge, } from '../auth.js';
// Clean up device key between test runs
import { rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
function cleanDeviceKey() {
    const path = join(homedir(), '.loom', 'device-key.json');
    if (existsSync(path))
        rmSync(path);
}
describe('auth', () => {
    it('generates a valid Ed25519 keypair', () => {
        const kp = generateKeyPair();
        assert.ok(kp.publicKey);
        assert.ok(kp.privateKey);
        assert.strictEqual(typeof kp.publicKey, 'string');
        assert.strictEqual(typeof kp.privateKey, 'string');
        // PEM base64 strings are typically 100+ chars
        assert.ok(kp.publicKey.length > 50);
        assert.ok(kp.privateKey.length > 50);
    });
    it('produces a stable fingerprint for a given public key', () => {
        const kp = generateKeyPair();
        const fp1 = fingerprintPublicKey(kp.publicKey);
        const fp2 = fingerprintPublicKey(kp.publicKey);
        assert.strictEqual(fp1, fp2);
        assert.strictEqual(fp1.length, 32); // hex, 32 chars
    });
    it('produces different fingerprints for different keys', () => {
        const kp1 = generateKeyPair();
        const kp2 = generateKeyPair();
        assert.notStrictEqual(fingerprintPublicKey(kp1.publicKey), fingerprintPublicKey(kp2.publicKey));
    });
    it('creates and reloads a device keypair', () => {
        cleanDeviceKey();
        const pair1 = getOrCreateDevice();
        assert.ok(pair1.deviceId);
        assert.ok(pair1.publicKey);
        assert.ok(pair1.privateKey);
        const pair2 = getOrCreateDevice();
        assert.strictEqual(pair1.deviceId, pair2.deviceId);
        assert.strictEqual(pair1.publicKey, pair2.publicKey);
    });
    it('returns a stable device identity', () => {
        cleanDeviceKey();
        const id1 = getDeviceIdentity('test-mac');
        const id2 = getDeviceIdentity('test-mac');
        assert.strictEqual(id1.deviceId, id2.deviceId);
        assert.strictEqual(id1.label, 'test-mac');
        assert.ok(id1.publicKey);
    });
    it('signs a challenge deterministically', () => {
        cleanDeviceKey();
        const sig1 = signChallenge('hello-world');
        const sig2 = signChallenge('hello-world');
        // Ed25519 signatures are deterministic for the same key+message
        assert.strictEqual(sig1, sig2);
        assert.notStrictEqual(signChallenge('different'), sig1);
    });
});
//# sourceMappingURL=auth.test.js.map