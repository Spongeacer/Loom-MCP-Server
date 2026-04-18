import * as fs from 'node:fs';
import * as path from 'node:path';
import { getPaths } from './paths.js';
import { withFileLockSync } from './lock.js';
import { ensureDir } from './fs-utils.js';
import { WAL_ROTATE_SIZE_BYTES, WAL_QUEUE_MAX_SIZE } from './constants.js';

interface PendingEvent {
  event: Record<string, unknown>;
  projectRoot: string;
  resolve: () => void;
  reject: (err: Error) => void;
}

const queue: PendingEvent[] = [];
let flushing = false;

function maybeRotateWal(walPath: string): void {
  try {
    const stat = fs.statSync(walPath);
    if (stat.size > WAL_ROTATE_SIZE_BYTES) {
      const archiveDir = path.join(path.dirname(walPath), 'archive');
      ensureDir(archiveDir);
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
        const agentId = process.env.LOOM_AGENT_ID || 'unknown';
        const lines = events
          .map((e) => JSON.stringify({ ...e, agent_id: agentId, t: new Date().toISOString() }) + '\n')
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
      const retries = ((item.event as Record<string, unknown>).__retries as number | undefined || 0) + 1;
      if (retries <= maxRetries) {
        (item.event as Record<string, unknown>).__retries = retries;
        queue.unshift(item);
      } else {
        item.reject(err instanceof Error ? err : new Error(String(err)));
      }
    }
  } finally {
    flushing = false;
    if (queue.length > 0) {
      const hasRetries = queue.some((item) => ((item.event as Record<string, unknown>).__retries as number | undefined || 0) > 0);
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
