import { describe, it, before, after } from 'node:test';
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

  after(async () => {
    await drainWalAsync();
    process.chdir(originalCwd);
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('runWatch reports runner missing when dist absent', async () => {
    let output = '';
    const originalLog = console.log;
    console.log = (msg: string) => { output += msg + '\n'; };
    try {
      await runWatch([]);
    } finally {
      console.log = originalLog;
    }
    assert(output.includes('not found'));
  });

  it('runWatchStop reports not running when no daemon', () => {
    let output = '';
    const originalLog = console.log;
    console.log = (msg: string) => { output += msg + '\n'; };
    try {
      runWatchStop();
    } finally {
      console.log = originalLog;
    }
    assert(output.includes('not running'));
  });

  it('runWatchStatus reports not running when no daemon', async () => {
    let output = '';
    const originalLog = console.log;
    console.log = (msg: string) => { output += msg + '\n'; };
    try {
      await runWatchStatus();
    } finally {
      console.log = originalLog;
    }
    assert(output.includes('not running'));
  });
});
