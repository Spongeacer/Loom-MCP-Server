import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { runWatch, runWatchStop, runWatchStatus } from '../commands/watch.js';
import { initWorkspace } from '../core/store.js';
import { drainWalAsync } from '../core/wal-queue.js';

describe('watch command', () => {
  let tmpDir: string;
  let originalCwd: string;

  before(() => {
    originalCwd = process.cwd();
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'loom-watch-cmd-'));
    process.chdir(tmpDir);
    initWorkspace('test', tmpDir);
  });

  beforeEach(() => {
    const pidFile = path.join(tmpDir, '.loom', 'cache', 'watch-pid.txt');
    if (fs.existsSync(pidFile)) {
      try { fs.unlinkSync(pidFile); } catch { /* ignore */ }
    }
    const socketPath = path.join(tmpDir, '.loom', 'cache', 'watch.sock');
    if (fs.existsSync(socketPath)) {
      try { fs.unlinkSync(socketPath); } catch { /* ignore */ }
    }
  });

  after(async () => {
    await drainWalAsync();
    process.chdir(originalCwd);
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('runWatch starts the daemon when runner is available', async () => {
    const output = await runWatch([]);
    assert(output.includes('started') || output.includes('already running'));
    if (output.includes('started')) {
      runWatchStop();
    }
  });

  it('runWatchStop reports not running when no daemon', () => {
    const output = runWatchStop();
    assert(output.includes('not running'));
  });

  it('runWatchStatus reports not running when no daemon', async () => {
    const output = await runWatchStatus();
    assert(output.includes('not running'));
  });
});
