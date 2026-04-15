import * as fs from 'node:fs';
import { getPaths } from './paths.js';

interface PendingEvent {
  event: Record<string, unknown>;
  projectRoot: string;
  resolve: () => void;
  reject: (err: Error) => void;
}

const queue: PendingEvent[] = [];
let flushing = false;

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
