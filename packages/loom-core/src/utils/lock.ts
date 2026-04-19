import * as fs from 'node:fs';
import * as path from 'node:path';
import * as cp from 'node:child_process';
import { getPaths } from '../paths.js';
import { safeMkdir, safeUnlink } from './fs-safe.js';
import { FILE_LOCK_TIMEOUT_MS } from '../constants.js';

const lockRefCounts = new Map<string, number>();

function ensureLockDir(projectRoot: string): void {
  safeMkdir(path.join(getPaths(projectRoot).root, '.locks'));
}

function lockFilePath(projectRoot: string, name: string): string {
  return path.join(getPaths(projectRoot).root, '.locks', `${name}.lock`);
}

interface LockPayload {
  pid: number;
  time: number;
}

function readLockPayload(p: string): LockPayload | null {
  try {
    const raw = fs.readFileSync(p, 'utf-8');
    const data = JSON.parse(raw) as LockPayload;
    if (typeof data.pid === 'number' && typeof data.time === 'number') {
      return data;
    }
    return null;
  } catch {
    return null;
  }
}

/** Minimum age (ms) before a lock is considered stale enough to remove.
 *  Prevents races where a process creates a lock and immediately dies
 *  before the lock file is even written. */
const STALE_LOCK_MIN_AGE_MS = 3000;

export function isProcessAlive(pid: number): boolean {
  if (process.platform === 'win32') {
    try {
      const result = cp.execSync(`tasklist /FI "PID eq ${pid}" /NH`, { encoding: 'utf-8', stdio: 'pipe' });
      return result.includes(String(pid));
    } catch {
      return false;
    }
  }
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

export function acquireLockSync(projectRoot: string, name: string): boolean {
  ensureLockDir(projectRoot);
  const p = lockFilePath(projectRoot, name);
  const refKey = p;
  const currentRef = lockRefCounts.get(refKey) || 0;
  if (currentRef > 0) {
    lockRefCounts.set(refKey, currentRef + 1);
    return true;
  }

  // Fast path: try to create the lock atomically
  try {
    const fd = fs.openSync(p, 'wx');
    const payload: LockPayload = { pid: process.pid, time: Date.now() };
    fs.writeSync(fd, JSON.stringify(payload));
    fs.closeSync(fd);
    lockRefCounts.set(refKey, 1);
    return true;
  } catch {
    // Lock already exists — inspect it
    const payload = readLockPayload(p);
    if (payload) {
      const age = Date.now() - payload.time;
      const stale = !isProcessAlive(payload.pid) && age > STALE_LOCK_MIN_AGE_MS;
      if (stale) {
        // Remove stale lock but DO NOT immediately recreate it here.
        // This eliminates the TOCTOU window between unlink and openSync.
        safeUnlink(p);
      }
    } else {
      // Corrupt or unreadable lock file — attempt to remove it
      safeUnlink(p);
    }
    return false;
  }
}

export function releaseLockSync(projectRoot: string, name: string): void {
  const p = lockFilePath(projectRoot, name);
  const refKey = p;
  const currentRef = lockRefCounts.get(refKey) || 0;
  if (currentRef > 1) {
    lockRefCounts.set(refKey, currentRef - 1);
    return;
  }
  lockRefCounts.delete(refKey);
  safeUnlink(p);
}

export function withFileLockSync<T>(
  projectRoot: string,
  name: string,
  fn: () => T,
  timeoutMs = FILE_LOCK_TIMEOUT_MS
): T {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (acquireLockSync(projectRoot, name)) {
      const cleanup = () => { releaseLockSync(projectRoot, name); };
      process.once('exit', cleanup);
      try {
        return fn();
      } finally {
        process.off('exit', cleanup);
        releaseLockSync(projectRoot, name);
      }
    }
    const buffer = new SharedArrayBuffer(4);
    const view = new Int32Array(buffer);
    Atomics.wait(view, 0, 0, 50);
  }
  throw new Error(`Failed to acquire lock "${name}" within ${timeoutMs}ms`);
}
