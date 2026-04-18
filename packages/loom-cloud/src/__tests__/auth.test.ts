import { describe, it } from 'node:test';
import assert from 'node:assert';
import { generateEd25519KeyPair, signChallenge, fingerprintPublicKey } from '@spongeacer/loom-core';

describe('auth (cloud)', () => {
  it('generateEd25519KeyPair produces non-empty keys', () => {
    const kp = generateEd25519KeyPair();
    assert.ok(kp.publicKey.length > 0);
    assert.ok(kp.privateKey.length > 0);
  });

  it('fingerprint is consistent', () => {
    const kp = generateEd25519KeyPair();
    const fp1 = fingerprintPublicKey(kp.publicKey);
    const fp2 = fingerprintPublicKey(kp.publicKey);
    assert.strictEqual(fp1, fp2);
    assert.strictEqual(fp1.length, 64); // hex sha256
  });

  it('sign and verify challenge', () => {
    const kp = generateEd25519KeyPair();
    const challenge = 'test-challenge-123';
    const sig = signChallenge(kp.privateKey, challenge);
    assert.ok(sig.length > 0);
  });
});
