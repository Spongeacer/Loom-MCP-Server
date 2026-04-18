import { describe, it } from 'node:test';
import assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { safeUnlink, safeMkdir, atomicWriteFile, readTextFile, pathExists, safeReaddir } from '../utils/fs-safe.js';

describe('fs-safe', () => {
  const tmpDir = path.join(process.cwd(), '.tmp-test-fs-safe');

  it('safeUnlink ignores ENOENT', () => {
    safeUnlink(path.join(tmpDir, 'nonexistent.txt'));
    assert.strictEqual(true, true); // no throw
  });

  it('safeMkdir creates nested dirs', () => {
    const nested = path.join(tmpDir, 'a', 'b', 'c');
    safeMkdir(nested);
    assert.strictEqual(fs.existsSync(nested), true);
  });

  it('atomicWriteFile writes and readTextFile reads', () => {
    const file = path.join(tmpDir, 'atomic.txt');
    atomicWriteFile(file, 'hello world');
    assert.strictEqual(readTextFile(file), 'hello world');
  });

  it('pathExists returns correct values', () => {
    const file = path.join(tmpDir, 'exists.txt');
    atomicWriteFile(file, 'x');
    assert.strictEqual(pathExists(file), true);
    assert.strictEqual(pathExists(path.join(tmpDir, 'no.txt')), false);
  });

  it('safeReaddir returns empty for missing dir', () => {
    const items = safeReaddir(path.join(tmpDir, 'missing-dir'));
    assert.deepStrictEqual(items, []);
  });
});
