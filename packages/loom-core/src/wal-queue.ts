import * as fs from 'node:fs';
import * as path from 'node:path';
import { getPaths } from './paths.js';
import { withFileLockSync } from './utils/lock.js';
import { safeMkdir } from './utils/fs-safe.js';
import { WAL_ROTATE_SIZE_BYTES, WAL_QUEUE_MAX_SIZE } from './constants.js';

interface PendingEvent {
  event: Record<string, unknown>;
  projectRoot: string;
  resolve: () => void;
  reject: (err: Error) => void;
}

const queue: PendingEvent[] = [];
let flushing = false;
const retryCounts = new WeakMap<Record<string, unknown>, number>();

function maybeRotateWal(walPath: string): void {
  try {
    const stat = fs.statSync(walPath);
    if (stat.size > WAL_ROTATE_SIZE_BYTES) {
      const archiveDir = path.join(path.dirname(walPath), 'archive');
      safeMkdir(archiveDir);
      const rotated = path.join(archiveDir, `wal-${Date.now()}.jsonl`);
      fs.renameSync(walPath, rotated);
    }
  } catch {
    // wal does not exist yet or rotation failed
  }
}

async function flushOnce(): Promise<void> {
  if (flushing || queue.length === 0) return;
  flushing = true;
  const batch = queue.splice(0, queue.length);
  try {
    const byRoot = new Map<string, Record<string, unknown>[]>();
    for (const item of batch) {
      const list = byRoot.get(item.projectRoot) || [];
      list.push(item.event);
      byRoot.set(item.projectRoot, list);
    }
    for (const [root, events] of byRoot) {
      withFileLockSync(root, 'wal', () => {
        const paths = getPaths(root);
        maybeRotateWal(paths.wal);
        const lines = events
          .map((e) => JSON.stringify({ ...e, t: new Date().toISOString() }) + '\n')
          .join('');
        fs.appendFileSync(paths.wal, lines);
      }, 5000);
    }
    for (const item of batch) {
      item.resolve();
    }
    notifyDrain();
  } catch (err) {
    const maxRetries = 3;
    for (const item of batch) {
      const retries = (retryCounts.get(item.event) || 0) + 1;
      if (retries <= maxRetries) {
        retryCounts.set(item.event, retries);
        queue.unshift(item);
      } else {
        item.reject(err as Error);
      }
    }
    // Also notify drain after exhausting retries (queue may now be empty)
    notifyDrain();
  } finally {
    flushing = false;
    if (queue.length > 0) {
      const hasRetries = queue.some((item) => (retryCounts.get(item.event) || 0) > 0);
      if (hasRetries) {
        setTimeout(() => flushOnce(), 1000);
      } else {
        setImmediate(() => flushOnce());
      }
    }
  }
}

let beforeExitRegistered = false;
function registerBeforeExit(): void {
  if (beforeExitRegistered) return;
  beforeExitRegistered = true;
  process.on('beforeExit', () => {
    if (queue.length > 0) {
      drainWalAsync().catch(() => {});
    }
  });
}

export function appendWalAsync(event: Record<string, unknown>, projectRoot?: string): Promise<void> {
  registerBeforeExit();
  return new Promise((resolve, reject) => {
    if (queue.length >= WAL_QUEUE_MAX_SIZE) {
      reject(new Error('WAL queue overflow: too many pending events'));
      return;
    }
    queue.push({
      event,
      projectRoot: projectRoot || process.cwd(),
      resolve,
      reject,
    });
    setImmediate(() => flushOnce());
  });
}

let drainResolve: (() => void) | null = null;

function notifyDrain(): void {
  if (drainResolve && queue.length === 0 && !flushing) {
    const resolve = drainResolve;
    drainResolve = null;
    resolve();
  }
}

export async function drainWalAsync(): Promise<void> {
  if (queue.length === 0 && !flushing) return;
  await new Promise<void>((resolve) => {
    drainResolve = resolve;
    // In case it flushed between the check and the promise
    setImmediate(() => notifyDrain());
  });
}
