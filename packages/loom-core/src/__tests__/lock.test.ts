import { describe, it } from 'node:test';
import assert from 'node:assert';
import * as path from 'node:path';
import { acquireLockSync, releaseLockSync, withFileLockSync, isProcessAlive } from '../utils/lock.js';
import { safeMkdir, safeUnlink } from '../utils/fs-safe.js';

describe('lock', () => {
  const tmpDir = path.join(process.cwd(), '.tmp-test-lock');

  it('acquire and release lock', () => {
    safeMkdir(tmpDir);
    assert.strictEqual(acquireLockSync(tmpDir, 'test-lock'), true);
    releaseLockSync(tmpDir, 'test-lock');
    // Should be able to acquire again after release
    assert.strictEqual(acquireLockSync(tmpDir, 'test-lock'), true);
    releaseLockSync(tmpDir, 'test-lock');
  });

  it('reentrant lock in same process', () => {
    safeMkdir(tmpDir);
    assert.strictEqual(acquireLockSync(tmpDir, 'reentrant'), true);
    assert.strictEqual(acquireLockSync(tmpDir, 'reentrant'), true);
    releaseLockSync(tmpDir, 'reentrant');
    releaseLockSync(tmpDir, 'reentrant');
    // Now fully released
    assert.strictEqual(acquireLockSync(tmpDir, 'reentrant'), true);
    releaseLockSync(tmpDir, 'reentrant');
  });

  it('withFileLockSync executes fn and releases', () => {
    safeMkdir(tmpDir);
    let executed = false;
    const result = withFileLockSync(tmpDir, 'with-lock', () => {
      executed = true;
      return 42;
    });
    assert.strictEqual(result, 42);
    assert.strictEqual(executed, true);
    // Lock should be released
    assert.strictEqual(acquireLockSync(tmpDir, 'with-lock'), true);
    releaseLockSync(tmpDir, 'with-lock');
  });

  it('isProcessAlive detects current process', () => {
    assert.strictEqual(isProcessAlive(process.pid), true);
    assert.strictEqual(isProcessAlive(99999999), false);
  });
});
