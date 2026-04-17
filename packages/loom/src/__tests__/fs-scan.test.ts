import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { performFsScan, performFsScanInWorker, shouldAutoScan, getLastScanPath } from '../core/fs-scan.js';
import { initWorkspace, listEntries, invalidateCache } from '../core/store.js';
import { drainWalAsync } from '../core/wal-queue.js';

describe('fs-scan', () => {
  let tmpDir: string;
  let originalCwd: string;

  before(() => {
    originalCwd = process.cwd();
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'loom-fsscan-'));
    process.chdir(tmpDir);
    initWorkspace('test', tmpDir);
    fs.mkdirSync(path.join(tmpDir, 'src'), { recursive: true });
    fs.writeFileSync(path.join(tmpDir, 'src', 'a.ts'), 'export const a = 1;\n');
  });

  after(async () => {
    await drainWalAsync();
    process.chdir(originalCwd);
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('shouldAutoScan returns true when no last scan', () => {
    assert.strictEqual(shouldAutoScan(tmpDir), true);
  });

  it('shouldAutoScan returns false immediately after touch', () => {
    fs.writeFileSync(getLastScanPath(tmpDir), new Date().toISOString());
    assert.strictEqual(shouldAutoScan(tmpDir), false);
  });

  it('shouldAutoScan returns true when last-scan file is empty', () => {
    fs.writeFileSync(getLastScanPath(tmpDir), '');
    assert.strictEqual(shouldAutoScan(tmpDir), true);
  });

  it('performFsScan registers artifacts and updates metadata', async () => {
    await performFsScan(['src'], tmpDir, { silent: true, updateTimestamp: true });
    invalidateCache(tmpDir);
    const artifacts = listEntries(tmpDir).filter(e => e.type === 'Artifact');
    assert(artifacts.length > 0);
    assert(artifacts.some(a => (a as any).artifact.path.endsWith('a.ts')));
  });

  it('performFsScanInWorker falls back when worker missing', async () => {
    await performFsScanInWorker(['src'], tmpDir, { silent: true, updateTimestamp: true, timeoutMs: 5000 });
    invalidateCache(tmpDir);
    const artifacts = listEntries(tmpDir).filter(e => e.type === 'Artifact');
    assert(artifacts.some(a => (a as any).artifact.path.endsWith('a.ts')));
  });
});
