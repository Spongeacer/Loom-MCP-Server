import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { runStatus } from '../commands/status.js';
import { initWorkspace } from '../core/store.js';
import { drainWalAsync } from '../core/wal-queue.js';

describe('status command', () => {
  let tmpDir: string;
  let originalCwd: string;

  before(() => {
    originalCwd = process.cwd();
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'loom-status-'));
    process.chdir(tmpDir);
    initWorkspace('test', tmpDir);
  });

  after(async () => {
    await drainWalAsync();
    process.chdir(originalCwd);
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('returns a prompt string when initialized', async () => {
    const output = await runStatus();
    assert(typeof output === 'string');
    assert(output.includes('<loom_context>'));
  });

  it('throws when not initialized', async () => {
    const uninitializedDir = fs.mkdtempSync(path.join(os.tmpdir(), 'loom-status-uninit-'));
    const prevCwd = process.cwd();
    process.chdir(uninitializedDir);
    try {
      await assert.rejects(async () => runStatus(), /LOOM not initialized/);
    } finally {
      process.chdir(prevCwd);
      fs.rmSync(uninitializedDir, { recursive: true, force: true });
    }
  });
});
