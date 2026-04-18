import { generateKeyPairSync, createHash, createPrivateKey, createPublicKey, sign, verify } from 'node:crypto';

export interface KeyPair {
  publicKey: string; // base64-encoded PEM
  privateKey: string; // base64-encoded PEM
}

/**
 * Generate an Ed25519 keypair using Node.js native crypto.
 * Node 18+ only. NO FALLBACK — if this fails, the caller must handle the error.
 */
export function generateEd25519KeyPair(): KeyPair {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519', {
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });
  return {
    publicKey: Buffer.from(publicKey).toString('base64'),
    privateKey: Buffer.from(privateKey).toString('base64'),
  };
}

/**
 * Sign a challenge string with an Ed25519 private key (base64 PEM).
 */
export function signChallenge(privateKeyPem: string, challenge: string): string {
  const pem = Buffer.from(privateKeyPem, 'base64').toString('utf-8');
  const privateKey = createPrivateKey(pem);
  return sign(null, Buffer.from(challenge), privateKey).toString('base64');
}

/**
 * Verify a challenge signature with an Ed25519 public key (base64 PEM).
 */
export function verifySignature(publicKeyPem: string, challenge: string, signature: string): boolean {
  const pem = Buffer.from(publicKeyPem, 'base64').toString('utf-8');
  const publicKey = createPublicKey(pem);
  return verify(null, Buffer.from(challenge), publicKey, Buffer.from(signature, 'base64'));
}

/**
 * Compute SHA-256 fingerprint of a base64-encoded public key.
 */
export function fingerprintPublicKey(publicKeyPem: string): string {
  const pem = Buffer.from(publicKeyPem, 'base64').toString('utf-8');
  const publicKey = createPublicKey(pem);
  const der = publicKey.export({ type: 'spki', format: 'der' });
  return createHash('sha256').update(der).digest('hex');
}
