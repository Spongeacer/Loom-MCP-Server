import { describe, it } from 'node:test';
import assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { readDirtySet, markArtifactDirty, clearDirtySet, removeFromDirtySet } from '../dirty-tracker.js';
import { getPaths } from '../paths.js';

describe('dirty-tracker', () => {
  const tmpDir = path.join(process.cwd(), '.tmp-test-dirty');

  it('markArtifactDirty adds files', () => {
    if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });
    const p = getPaths(tmpDir);
    fs.mkdirSync(p.cache, { recursive: true });

    markArtifactDirty('src/foo.ts', 'art-1', tmpDir);
    const ds = readDirtySet(tmpDir);
    assert.ok(ds.files.includes('src/foo.ts'));
    assert.ok(ds.artifacts.includes('art-1'));
    assert.strictEqual(ds.needs_dependency_scan, true);
  });

  it('clearDirtySet resets everything', () => {
    if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });
    const p = getPaths(tmpDir);
    fs.mkdirSync(p.cache, { recursive: true });

    markArtifactDirty('src/bar.ts', undefined, tmpDir);
    clearDirtySet(tmpDir);
    const ds = readDirtySet(tmpDir);
    assert.deepStrictEqual(ds.files, []);
    assert.deepStrictEqual(ds.artifacts, []);
    assert.strictEqual(ds.needs_dependency_scan, false);
  });

  it('removeFromDirtySet removes specific files', () => {
    if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });
    const p = getPaths(tmpDir);
    fs.mkdirSync(p.cache, { recursive: true });

    markArtifactDirty('src/a.ts', undefined, tmpDir);
    markArtifactDirty('src/b.ts', undefined, tmpDir);
    removeFromDirtySet(['src/a.ts'], [], tmpDir);
    const ds = readDirtySet(tmpDir);
    assert.ok(!ds.files.includes('src/a.ts'));
    assert.ok(ds.files.includes('src/b.ts'));
  });
});
