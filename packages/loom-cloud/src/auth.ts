import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { generateEd25519KeyPair, signChallenge, fingerprintPublicKey } from '@spongeacer/loom-core';
import { safeMkdir, atomicWriteFile, readTextFile } from '@spongeacer/loom-core';

const DEVICE_KEY_PATH = path.join(os.homedir(), '.loom', 'device-key.json');

export interface DeviceIdentity {
  deviceId: string;
  publicKey: string;
  privateKey: string;
  fingerprint: string;
}

function loadDeviceKey(): DeviceIdentity | null {
  const raw = readTextFile(DEVICE_KEY_PATH);
  if (!raw) return null;
  try {
    const data = JSON.parse(raw) as DeviceIdentity;
    if (data.deviceId && data.publicKey && data.privateKey) {
      return data;
    }
  } catch {
    // ignore parse errors
  }
  return null;
}

function saveDeviceKey(identity: DeviceIdentity): void {
  safeMkdir(path.dirname(DEVICE_KEY_PATH));
  atomicWriteFile(DEVICE_KEY_PATH, JSON.stringify(identity, null, 2));
  fs.chmodSync(DEVICE_KEY_PATH, 0o600);
}

export function getOrCreateDevice(): DeviceIdentity {
  const existing = loadDeviceKey();
  if (existing) return existing;

  const keyPair = generateEd25519KeyPair();
  const identity: DeviceIdentity = {
    deviceId: `dev-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    publicKey: keyPair.publicKey,
    privateKey: keyPair.privateKey,
    fingerprint: fingerprintPublicKey(keyPair.publicKey),
  };
  saveDeviceKey(identity);
  return identity;
}

export function signDeviceChallenge(device: DeviceIdentity, challenge: string): string {
  return signChallenge(device.privateKey, challenge);
}
