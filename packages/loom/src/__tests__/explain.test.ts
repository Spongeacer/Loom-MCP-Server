import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { runExplain } from '../commands/explain.js';
import { initWorkspace, saveEntry } from '../core/store.js';
import { drainWalAsync } from '../core/wal-queue.js';

describe('explain command', () => {
  let tmpDir: string;
  let originalCwd: string;

  before(() => {
    originalCwd = process.cwd();
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'loom-explain-'));
    process.chdir(tmpDir);
    initWorkspace('test', tmpDir);
  });

  after(async () => {
    await drainWalAsync();
    process.chdir(originalCwd);
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('throws usage when no id given', () => {
    assert.throws(() => runExplain([]), /Usage/);
  });

  it('explains an existing entry', () => {
    const entry = {
      id: 'dec-test',
      type: 'Decision',
      version: 1,
      namespace: 'project',
      content: { l1_5: 't', l2: 'Test decision', l3: 'Details' },
      lifecycle: { state: 'active', created: new Date().toISOString(), updated: new Date().toISOString(), last_accessed: new Date().toISOString(), last_activated: new Date().toISOString(), activation_count: 1, verification_count: 0, promoted_from: null, demotion_reason: null },
      quality: { freshness: 1, trust: 0.9, activity: 1, composite_score: 0.95 },
      trust: { level: 'verified', source: 'human' },
      activation: { paths: [], keywords: [], intents: [], tools: [], entry_refs: [] },
      conflicts: { supersedes: [], conflicts_with: [], overridden_by: null, precedence: 0, resolution_policy: 'newest_wins' },
      bindings_out: [],
      bindings_in: [],
      decision: { question: 'Q?', chosen: 'A', rationale: 'Because', rejected: [], assumptions: [], impact_scope: [], supersedes: null, made_in: new Date().toISOString() },
    };
    saveEntry(entry as any, tmpDir);

    const output = runExplain(['dec-test']);
    assert(output.includes('Entry: dec-test'));
    assert(output.includes('Decision'));
    assert(output.includes('Q?'));
    assert(output.includes('Because'));
  });
});
