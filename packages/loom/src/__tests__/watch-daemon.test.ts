import { describe, it, before, after, beforeEach } from 'node:test';
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

  beforeEach(() => {
    // Clean up any stale pid file from previous tests
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

  it('startWatchDaemon starts the daemon when runner is available', () => {
    const result = startWatchDaemon(['src'], tmpDir);
    assert(result.includes('started') || result.includes('already running'));
    if (result.includes('started')) {
      // Clean up the daemon we just started so later tests see a clean state
      stopWatchDaemon(tmpDir);
    }
  });

  it('ensureWatchDaemon starts the daemon or reports already running', () => {
    const result = ensureWatchDaemon(['src', 'tests'], tmpDir);
    assert(result.includes('started') || result.includes('already running'));
    if (result.includes('started')) {
      stopWatchDaemon(tmpDir);
    }
  });

  it('stopWatchDaemon returns not running when no daemon', () => {
    const result = stopWatchDaemon(tmpDir);
    assert(result.includes('not running'));
  });

  it('health socket survives abrupt client disconnect (EPIPE)', async () => {
    // Ensure clean state
    stopWatchDaemon(tmpDir);
    fs.mkdirSync(path.join(tmpDir, 'src'), { recursive: true });
    const socketPath = path.join(tmpDir, '.loom', 'cache', 'watch.sock');
    if (fs.existsSync(socketPath)) {
      try { fs.unlinkSync(socketPath); } catch { /* ignore */ }
    }

    const result = startWatchDaemon(['src'], tmpDir);
    assert(result.includes('started') || result.includes('already running'));

    // Give the runner a moment to boot before polling for the socket
    await new Promise((r) => setTimeout(r, 300));

    // Wait for socket to exist (up to ~5s)
    for (let i = 0; i < 100; i++) {
      if (fs.existsSync(socketPath)) break;
      await new Promise((r) => setTimeout(r, 50));
    }
    assert(fs.existsSync(socketPath), 'Socket should exist after daemon starts');

    // Abruptly disconnect multiple times to trigger EPIPE on the server side
    const net = require('node:net');
    for (let i = 0; i < 5; i++) {
      const client = net.createConnection(socketPath);
      client.on('connect', () => {
        client.destroy();
      });
      client.on('error', () => { /* ignore client-side errors */ });
      await new Promise((r) => setTimeout(r, 50));
    }

    // Give the daemon a moment to potentially crash
    await new Promise((r) => setTimeout(r, 300));

    const status = await getWatchStatusAsync(tmpDir);
    assert.strictEqual(status.running, true, 'Daemon should still be running after EPIPE');

    stopWatchDaemon(tmpDir);
  });
});
