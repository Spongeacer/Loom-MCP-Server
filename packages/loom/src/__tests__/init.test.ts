import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { runInit } from '../commands/init.js';
import { isInitialized } from '../core/store.js';
import { drainWalAsync } from '../core/wal-queue.js';

describe('init command', () => {
  let tmpDir: string;
  let originalCwd: string;

  before(() => {
    originalCwd = process.cwd();
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'loom-init-'));
    process.chdir(tmpDir);
  });

  after(async () => {
    await drainWalAsync();
    process.chdir(originalCwd);
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('initializes workspace with default name', () => {
    const output = runInit([]);

    assert(isInitialized(tmpDir));
    assert(output.includes('unnamed-project'));
    assert(fs.existsSync(path.join(tmpDir, '.loom', 'config.yml')));
  });

  it('does not re-initialize existing workspace', () => {
    assert.throws(() => runInit(['another-project']), /already initialized/);
    const config = fs.readFileSync(path.join(tmpDir, '.loom', 'config.yml'), 'utf-8');
    assert(config.includes('unnamed-project'));
  });
});
