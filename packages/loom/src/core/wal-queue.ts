import * as fs from 'node:fs';
import * as path from 'node:path';
import { getPaths } from './paths.js';
import { withFileLockSync } from './lock.js';

interface PendingEvent {
  event: Record<string, unknown>;
  projectRoot: string;
  resolve: () => void;
  reject: (err: Error) => void;
}

const queue: PendingEvent[] = [];
let flushing = false;
const WAL_ROTATE_SIZE = 10 * 1024 * 1024; // 10MB
const MAX_QUEUE_SIZE = 10000;

function maybeRotateWal(walPath: string): void {
  try {
    const stat = fs.statSync(walPath);
    if (stat.size > WAL_ROTATE_SIZE) {
      const archiveDir = path.join(path.dirname(walPath), 'archive');
      if (!fs.existsSync(archiveDir)) fs.mkdirSync(archiveDir, { recursive: true });
      const rotated = path.join(archiveDir, `wal-${Date.now()}.jsonl`);
      fs.renameSync(walPath, rotated);
    }
  } catch {
    // wal does not exist yet or rotation failed — safe to ignore
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
  } catch (err) {
    // Re-insert failed batch at front so subsequent flushes can retry
    // Limit retries to avoid infinite loops when WAL directory is removed
    const maxRetries = 3;
    for (const item of batch) {
      const retries = ((item.event as any).__retries || 0) + 1;
      if (retries <= maxRetries) {
        (item.event as any).__retries = retries;
        queue.unshift(item);
      } else {
        item.reject(err as Error);
      }
    }
  } finally {
    flushing = false;
    if (queue.length > 0) {
      const hasRetries = queue.some((item) => ((item.event as any).__retries || 0) > 0);
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

export function appendWalAsync(
  event: Record<string, unknown>,
  projectRoot?: string
): Promise<void> {
  registerBeforeExit();
  return new Promise((resolve, reject) => {
    if (queue.length >= MAX_QUEUE_SIZE) {
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

export async function drainWalAsync(): Promise<void> {
  if (queue.length === 0 && !flushing) return;
  await new Promise<void>((resolve) => {
    const check = () => {
      if (queue.length === 0 && !flushing) {
        resolve();
      } else {
        setImmediate(check);
      }
    };
    check();
  });
}
