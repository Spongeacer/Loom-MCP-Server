import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { readDirtySet, clearDirtySet, markArtifactDirty } from '../core/dirty-tracker.js';
import { drainWalAsync } from '../core/wal-queue.js';

describe('dirty-tracker', () => {
  let tmpDir: string;

  before(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'loom-dirty-'));
    fs.mkdirSync(path.join(tmpDir, '.loom', 'cache'), { recursive: true });
  });

  after(async () => {
    await drainWalAsync();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('readDirtySet returns defaults when missing', () => {
    const ds = readDirtySet(tmpDir);
    assert(Array.isArray(ds.files));
    assert(Array.isArray(ds.artifacts));
    assert.strictEqual(ds.needs_dependency_scan, false);
  });

  it('readDirtySet returns defaults when file is empty', () => {
    const p = path.join(tmpDir, '.loom', 'cache', 'dirty-set.yml');
    fs.writeFileSync(p, '');
    const ds = readDirtySet(tmpDir);
    assert(Array.isArray(ds.files));
    assert.strictEqual(ds.files.length, 0);
    assert(Array.isArray(ds.artifacts));
    assert.strictEqual(ds.needs_dependency_scan, false);
  });

  it('markArtifactDirty appends files and sets flag', () => {
    markArtifactDirty(path.join(tmpDir, 'src', 'foo.ts'), 'art-foo', tmpDir);
    const ds = readDirtySet(tmpDir);
    assert(ds.files.includes('src/foo.ts'));
    assert(ds.artifacts.includes('art-foo'));
    assert.strictEqual(ds.needs_dependency_scan, true);
    clearDirtySet(tmpDir);
  });

  it('clearDirtySet resets state', () => {
    markArtifactDirty(path.join(tmpDir, 'src', 'bar.ts'), undefined, tmpDir);
    clearDirtySet(tmpDir);
    const ds = readDirtySet(tmpDir);
    assert.strictEqual(ds.files.length, 0);
    assert.strictEqual(ds.artifacts.length, 0);
    assert.strictEqual(ds.needs_dependency_scan, false);
  });


});
