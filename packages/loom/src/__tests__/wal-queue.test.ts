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

  it('rotates wal when it exceeds WAL_ROTATE_SIZE_BYTES', async () => {
    // Pre-fill wal to just above the rotation threshold (512KB)
    const paddingSize = 520 * 1024;
    fs.writeFileSync(walPath, 'x'.repeat(paddingSize));

    await appendWalAsync({ type: 'rotate_test', data: 42 }, loomDir);
    await drainWalAsync();

    // Original wal should have been rotated into archive/ and a fresh wal created
    const archiveDir = path.join(eventsDir, 'archive');
    assert(fs.existsSync(archiveDir), 'archive dir should exist');
    const archives = fs.readdirSync(archiveDir).filter((f) => f.startsWith('wal-') && f.endsWith('.jsonl'));
    assert.strictEqual(archives.length, 1, 'one archive file should exist');

    // The current wal should contain only the newly appended event
    assert(fs.existsSync(walPath), 'wal should still exist after rotation');
    const lines = fs.readFileSync(walPath, 'utf-8').trim().split('\n').filter(Boolean);
    assert.strictEqual(lines.length, 1);
    const ev = JSON.parse(lines[0]);
    assert.strictEqual(ev.type, 'rotate_test');
    assert.strictEqual(ev.data, 42);
  });
});
