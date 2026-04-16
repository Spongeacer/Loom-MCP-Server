import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { runExpand } from '../commands/expand.js';
import { initWorkspace, saveEntry } from '../core/store.js';
import { drainWalAsync } from '../core/wal-queue.js';

describe('expand command', () => {
  let tmpDir: string;
  let originalCwd: string;

  before(() => {
    originalCwd = process.cwd();
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'loom-expand-'));
    process.chdir(tmpDir);
    initWorkspace('test', tmpDir);
  });

  after(async () => {
    await drainWalAsync();
    process.chdir(originalCwd);
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('throws usage when no id given', () => {
    assert.throws(() => runExpand([]), /Usage/);
  });

  it('throws not found for missing entry', () => {
    assert.throws(() => runExpand(['missing-id']), /Entry not found/);
  });

  it('expands existing entry at l3', () => {
    const entry = {
      id: 'rule-test',
      type: 'Rule',
      version: 1,
      namespace: 'project',
      content: { l1_5: 't', l2: 'Test rule', l3: 'Detailed test rule content' },
      lifecycle: { state: 'active', created: new Date().toISOString(), updated: new Date().toISOString(), last_accessed: new Date().toISOString(), last_activated: new Date().toISOString(), activation_count: 1, verification_count: 0, promoted_from: null, demotion_reason: null },
      quality: { freshness: 1, trust: 0.9, activity: 1, composite_score: 0.95 },
      trust: { level: 'verified', source: 'human' },
      activation: { paths: [], keywords: [], intents: [], tools: [], entry_refs: [] },
      conflicts: { supersedes: [], conflicts_with: [], overridden_by: null, precedence: 0, resolution_policy: 'newest_wins' },
      bindings_out: [],
      bindings_in: [],
    };
    saveEntry(entry as any, tmpDir);

    const output = runExpand(['rule-test']);
    assert(output.includes('<loom_expand id="rule-test"'));
    assert(output.includes('Detailed test rule content'));
  });
});
