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

function readLockPid(p: string): number | null {
  try {
    const pid = parseInt(fs.readFileSync(p, 'utf-8'), 10);
    return Number.isNaN(pid) ? null : pid;
  } catch {
    return null;
  }
}

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
  try {
    const fd = fs.openSync(p, 'wx');
    fs.writeSync(fd, String(process.pid));
    fs.closeSync(fd);
    lockRefCounts.set(refKey, 1);
    return true;
  } catch {
    const pid = readLockPid(p);
    if (pid !== null && pid !== process.pid) {
      if (!isProcessAlive(pid)) {
        safeUnlink(p);
        try {
          const fd = fs.openSync(p, 'wx');
          fs.writeSync(fd, String(process.pid));
          fs.closeSync(fd);
          lockRefCounts.set(refKey, 1);
          return true;
        } catch {
          return false;
        }
      }
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


