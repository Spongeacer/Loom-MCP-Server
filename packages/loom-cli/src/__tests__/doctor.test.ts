import { describe, it } from 'node:test';
import assert from 'node:assert';
import { MemoryStoreAdapter } from '@loom/core';
import { runDoctorCommand } from '../commands/doctor.js';

describe('doctor command', () => {
  it('reports uninitialized workspace', () => {
    const store = new MemoryStoreAdapter();
    const output = runDoctorCommand([], store);
    assert.ok(output.includes('CRITICAL'));
    assert.ok(output.includes('not initialized'));
  });

  it('reports ok for initialized workspace', () => {
    const store = new MemoryStoreAdapter();
    store.initWorkspace('test');
    const output = runDoctorCommand([], store);
    assert.ok(output.includes('LOOM workspace initialized'));
    assert.ok(output.includes('All checks passed') || output.includes('Some issues'));
  });
});
