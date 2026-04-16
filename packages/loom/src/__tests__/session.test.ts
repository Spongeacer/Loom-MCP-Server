import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { runSession } from '../commands/session.js';
import { initWorkspace } from '../core/store.js';
import { appendWalAsync, drainWalAsync } from '../core/wal-queue.js';

describe('session command', () => {
  let tmpDir: string;
  let originalCwd: string;

  before(() => {
    originalCwd = process.cwd();
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'loom-session-cmd-'));
    process.chdir(tmpDir);
    initWorkspace('test', tmpDir);
  });

  after(async () => {
    await drainWalAsync();
    process.chdir(originalCwd);
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('summary subcommand prints session summary', async () => {
    await appendWalAsync({ type: 'test_summary', t: new Date().toISOString() }, tmpDir);
    await drainWalAsync();

    let output = '';
    const originalLog = console.log;
    console.log = (msg: string) => { output += msg + '\n'; };
    try {
      runSession([]);
    } finally {
      console.log = originalLog;
    }
    assert(output.includes('Session summary'));
  });

  it('recent subcommand prints WAL events', async () => {
    await appendWalAsync({ type: 'test_recent' }, tmpDir);
    await drainWalAsync();

    let output = '';
    const originalLog = console.log;
    console.log = (msg: string) => { output += msg + '\n'; };
    try {
      runSession(['recent', '10']);
    } finally {
      console.log = originalLog;
    }
    assert(output.includes('WAL events'));
  });
});
