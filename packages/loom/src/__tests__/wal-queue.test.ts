import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { appendWalAsync, drainWalAsync } from '../core/wal-queue.js';

describe('wal-queue', () => {
  let loomDir: string;
  let eventsDir: string;
  let walPath: string;

  before(() => {
    loomDir = fs.mkdtempSync(path.join(os.tmpdir(), 'loom-wal-'));
    eventsDir = path.join(loomDir, '.loom', 'events');
    fs.mkdirSync(eventsDir, { recursive: true });
    walPath = path.join(eventsDir, 'wal.jsonl');
  });

  after(() => {
    fs.rmSync(loomDir, { recursive: true, force: true });
  });

  it('appendWalAsync writes events to wal', async () => {
    await appendWalAsync({ type: 'test_event', data: 1 }, loomDir);
    await appendWalAsync({ type: 'test_event', data: 2 }, loomDir);
    await drainWalAsync();

    const lines = fs.readFileSync(walPath, 'utf-8').trim().split('\n').filter(Boolean);
    assert.strictEqual(lines.length, 2);
    const ev1 = JSON.parse(lines[0]);
    const ev2 = JSON.parse(lines[1]);
    assert.strictEqual(ev1.type, 'test_event');
    assert.strictEqual(ev1.data, 1);
    assert.strictEqual(ev2.data, 2);
    assert(ev1.t);
    assert(ev2.t);
  });
});
