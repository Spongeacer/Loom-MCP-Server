import { describe, it } from 'node:test';
import assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { readWalEvents, readWalEventsSince, summarizeSession } from '../session-recall.js';
import { getPaths } from '../paths.js';

describe('session-recall', () => {
  const tmpDir = path.join(process.cwd(), '.tmp-test-session');

  function setupWal(events: Array<Record<string, unknown>>) {
    if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });
    const p = getPaths(tmpDir);
    fs.mkdirSync(path.dirname(p.wal), { recursive: true });
    const lines = events.map((e) => JSON.stringify(e)).join('\n') + '\n';
    fs.writeFileSync(p.wal, lines);
  }

  it('readWalEvents returns events in chronological order', () => {
    setupWal([
      { type: 'task_set', t: '2026-04-18T10:00:00.000Z' },
      { type: 'fs_scan', t: '2026-04-18T10:05:00.000Z' },
      { type: 'task_set', t: '2026-04-18T10:10:00.000Z' },
    ]);
    const events = readWalEvents(tmpDir, 10);
    assert.strictEqual(events.length, 3);
    assert.strictEqual(events[0].type, 'task_set');
    assert.strictEqual(events[1].type, 'fs_scan');
    assert.strictEqual(events[2].type, 'task_set');
  });

  it('readWalEvents filters by type', () => {
    setupWal([
      { type: 'task_set', t: '2026-04-18T10:00:00.000Z' },
      { type: 'fs_scan', t: '2026-04-18T10:05:00.000Z' },
    ]);
    const events = readWalEvents(tmpDir, 10, 'fs_scan');
    assert.strictEqual(events.length, 1);
    assert.strictEqual(events[0].type, 'fs_scan');
  });

  it('readWalEventsSince returns events after timestamp', () => {
    setupWal([
      { type: 'old', t: '2026-04-17T00:00:00.000Z' },
      { type: 'new', t: '2026-04-18T12:00:00.000Z' },
    ]);
    const events = readWalEventsSince(tmpDir, '2026-04-18T00:00:00.000Z');
    assert.strictEqual(events.length, 1);
    assert.strictEqual(events[0].type, 'new');
  });

  it('summarizeSession produces summary', () => {
    const now = new Date();
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000).toISOString();
    const twoHoursAgo = new Date(now.getTime() - 2 * 60 * 60 * 1000).toISOString();
    setupWal([
      { type: 'task_set', t: oneHourAgo, id: 'task-1' },
      { type: 'fs_scan', t: twoHoursAgo },
    ]);
    const summary = summarizeSession(tmpDir, 24);
    assert.ok(summary.includes('Total events: 2'));
    assert.ok(summary.includes('task_set=1'));
  });
});
