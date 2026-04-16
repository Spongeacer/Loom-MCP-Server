import * as fs from 'node:fs';
import * as path from 'node:path';
import { getPaths } from './paths.js';

const lockRefCounts = new Map<string, number>();
const asyncLockQueues = new Map<string, Promise<unknown>>();

function ensureLockDir(projectRoot: string): void {
  const p = path.join(getPaths(projectRoot).root, '.locks');
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
}

function lockFilePath(projectRoot: string, name: string): string {
  return path.join(getPaths(projectRoot).root, '.locks', `${name}.lock`);
}

function readLockPid(p: string): number | null {
  try {
    return parseInt(fs.readFileSync(p, 'utf-8'), 10);
  } catch {
    return null;
  }
}

export function acquireLockSync(projectRoot: string, name: string): boolean {
  ensureLockDir(projectRoot);
  const p = lockFilePath(projectRoot, name);
  const refKey = p;
  const currentRef = lockRefCounts.get(refKey) || 0;
  if (currentRef > 0) {
    // Reentrant lock in the same process
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
    // Check for stale lock from a dead process
    const pid = readLockPid(p);
    if (pid !== null && pid !== process.pid) {
      try { process.kill(pid, 0); } catch {
        try { fs.unlinkSync(p); } catch { /* ignore */ }
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
  try {
    fs.unlinkSync(p);
  } catch {
    // ignore
  }
}

export function withFileLockSync<T>(
  projectRoot: string,
  name: string,
  fn: () => T,
  timeoutMs = 5000
): T {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    if (acquireLockSync(projectRoot, name)) {
      const cleanup = () => {
        releaseLockSync(projectRoot, name);
      };
      process.once('exit', cleanup);
      try {
        return fn();
      } finally {
        process.off('exit', cleanup);
        releaseLockSync(projectRoot, name);
      }
    }
    // busy-wait spin with tiny sleep to avoid 100% CPU
    const start = Date.now();
    while (Date.now() - start < 50) {
      // noop
    }
  }
  throw new Error(`Failed to acquire lock "${name}" within ${timeoutMs}ms`);
}

export async function withFileLock<T>(
  projectRoot: string,
  name: string,
  fn: () => Promise<T>,
  timeoutMs = 5000
): Promise<T> {
  const lockPath = lockFilePath(projectRoot, name);

  // Serialize concurrent async calls for the same lock in the same process
  const previous = asyncLockQueues.get(lockPath);
  let resolveQueue: () => void;
  const queued = new Promise<void>((resolve) => { resolveQueue = resolve; });
  asyncLockQueues.set(lockPath, queued);

  if (previous) {
    await previous;
  }

  const deadline = Date.now() + timeoutMs;
  try {
    while (Date.now() < deadline) {
      if (acquireLockSync(projectRoot, name)) {
        const cleanup = () => {
          releaseLockSync(projectRoot, name);
        };
        process.once('exit', cleanup);
        try {
          return await fn();
        } finally {
          process.off('exit', cleanup);
          releaseLockSync(projectRoot, name);
        }
      }
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    throw new Error(`Failed to acquire lock "${name}" within ${timeoutMs}ms`);
  } finally {
    resolveQueue!();
    asyncLockQueues.delete(lockPath);
  }
}
