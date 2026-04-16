import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { getWatchStatus, getWatchStatusAsync, stopWatchDaemon, startWatchDaemon, ensureWatchDaemon } from '../core/watch-daemon.js';
import { initWorkspace } from '../core/store.js';
import { drainWalAsync } from '../core/wal-queue.js';

describe('watch-daemon', () => {
  let tmpDir: string;
  let originalCwd: string;

  before(() => {
    originalCwd = process.cwd();
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'loom-watch-'));
    process.chdir(tmpDir);
    initWorkspace('test', tmpDir);
  });

  after(async () => {
    await drainWalAsync();
    process.chdir(originalCwd);
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('getWatchStatus returns false when no pid file', () => {
    const status = getWatchStatus(tmpDir);
    assert.strictEqual(status.running, false);
  });

  it('returns not running for invalid pid file', () => {
    const pidFile = path.join(tmpDir, '.loom', 'cache', 'watch-pid.txt');
    fs.writeFileSync(pidFile, 'not-a-number');
    const status = getWatchStatus(tmpDir);
    assert.strictEqual(status.running, false);
    assert(!fs.existsSync(pidFile));
  });

  it('returns not running for stale pid (process does not exist)', () => {
    const pidFile = path.join(tmpDir, '.loom', 'cache', 'watch-pid.txt');
    fs.writeFileSync(pidFile, '999999');
    const status = getWatchStatus(tmpDir);
    assert.strictEqual(status.running, false);
    assert(!fs.existsSync(pidFile));
  });

  it('getWatchStatusAsync handles missing pid gracefully', async () => {
    const status = await getWatchStatusAsync(tmpDir);
    assert.strictEqual(status.running, false);
  });

  it('startWatchDaemon returns missing runner if dist is absent', () => {
    const result = startWatchDaemon(['src'], tmpDir);
    assert(result.includes('not found'));
  });

  it('ensureWatchDaemon returns runner missing when dist absent', () => {
    const result = ensureWatchDaemon(['src', 'tests'], tmpDir);
    assert(result.includes('not found'));
  });

  it('stopWatchDaemon returns not running when no daemon', () => {
    const result = stopWatchDaemon(tmpDir);
    assert(result.includes('not running'));
  });
});
