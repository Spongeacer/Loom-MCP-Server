import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { readWalEvents, summarizeSession } from '../core/session-recall.js';
import { drainWalAsync } from '../core/wal-queue.js';

describe('session-recall', () => {
  let tmpDir: string;
  let walPath: string;

  before(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'loom-session-'));
    fs.mkdirSync(path.join(tmpDir, '.loom', 'events'), { recursive: true });
    walPath = path.join(tmpDir, '.loom', 'events', 'wal.jsonl');
    const now = Date.now();
    const events = [
      { t: new Date(now - 1000).toISOString(), type: 'task_set', id: 'task-1' },
      { t: new Date(now - 2000).toISOString(), type: 'fs_scan', dirs: ['src'] },
      { t: new Date(now - 2 * 60 * 60 * 1000).toISOString(), type: 'old_event', id: 'old' },
      { t: new Date(now - 1000).toISOString(), type: 'task_set', id: 'task-2' },
    ];
    fs.writeFileSync(walPath, events.map(e => JSON.stringify(e)).join('\n') + '\n');
  });

  after(async () => {
    await drainWalAsync();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('readWalEvents filters by type', () => {
    const events = readWalEvents(tmpDir, 10, 'task_set');
    assert.strictEqual(events.length, 2);
    assert(events.every(e => e.type === 'task_set'));
  });

  it('readWalEvents respects limit', () => {
    const events = readWalEvents(tmpDir, 2);
    assert.strictEqual(events.length, 2);
  });

  it('summarizeSession returns text summary', () => {
    const summary = summarizeSession(tmpDir, 1);
    assert(summary.includes('Session summary for the last 1 hours:'));
    assert(summary.includes('task_set'));
    assert(summary.includes('fs_scan'));
    assert(!summary.includes('old_event'));
  });
});
