import * as fs from 'node:fs';
import * as path from 'node:path';
import { getPaths } from './paths.js';

interface PendingEvent {
  event: Record<string, unknown>;
  projectRoot: string;
  resolve: () => void;
  reject: (err: Error) => void;
}

const queue: PendingEvent[] = [];
let flushing = false;
const WAL_ROTATE_SIZE = 10 * 1024 * 1024; // 10MB

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
      const paths = getPaths(root);
      maybeRotateWal(paths.wal);
      const lines = events
        .map((e) => JSON.stringify({ ...e, t: new Date().toISOString() }) + '\n')
        .join('');
      fs.appendFileSync(paths.wal, lines);
    }
    for (const item of batch) {
      item.resolve();
    }
  } catch (err) {
    // Re-insert failed batch at front so subsequent flushes can retry
    queue.unshift(...batch);
    for (const item of batch) {
      item.reject(err as Error);
    }
  } finally {
    flushing = false;
    if (queue.length > 0) {
      setImmediate(() => flushOnce());
    }
  }
}

export function appendWalAsync(
  event: Record<string, unknown>,
  projectRoot?: string
): Promise<void> {
  return new Promise((resolve, reject) => {
    queue.push({
      event,
      projectRoot: projectRoot || process.cwd(),
      resolve,
      reject,
    });
    setImmediate(() => flushOnce());
  });
}
