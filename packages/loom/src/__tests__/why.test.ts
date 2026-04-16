import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { runWhy } from '../commands/why.js';
import { initWorkspace, saveEntry, saveWorkingSet } from '../core/store.js';
import { drainWalAsync } from '../core/wal-queue.js';

describe('why command', () => {
  let tmpDir: string;
  let originalCwd: string;

  before(() => {
    originalCwd = process.cwd();
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'loom-why-'));
    process.chdir(tmpDir);
    initWorkspace('test', tmpDir);
  });

  after(async () => {
    await drainWalAsync();
    process.chdir(originalCwd);
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('prints usage when no id given', () => {
    let output = '';
    const originalLog = console.log;
    console.log = (msg: string) => { output += msg + '\n'; };
    try {
      runWhy([]);
    } finally {
      console.log = originalLog;
    }
    assert(output.includes('Usage'));
  });

  it('explains why active task matters', () => {
    const entry = {
      id: 'task-active',
      type: 'Task',
      version: 1,
      namespace: 'project',
      content: { l1_5: 'a', l2: 'Active', l3: 'Active task' },
      lifecycle: { state: 'active', created: new Date().toISOString(), updated: new Date().toISOString(), last_accessed: new Date().toISOString(), last_activated: new Date().toISOString(), activation_count: 1, verification_count: 0, promoted_from: null, demotion_reason: null },
      quality: { freshness: 1, trust: 0.9, activity: 1, composite_score: 0.95 },
      trust: { level: 'verified', source: 'human' },
      activation: { paths: [], keywords: [], intents: [], tools: [], entry_refs: [] },
      conflicts: { supersedes: [], conflicts_with: [], overridden_by: null, precedence: 0, resolution_policy: 'newest_wins' },
      bindings_out: [],
      bindings_in: [],
      task: { title: 'Active', status: 'active', intent: 'feature', priority: 'high', working_set: [], related_entries: [], acceptance_criteria: [], unresolved_questions: [], progress: { completed: [], current: null, next: null, blocked_by: null }, started_in: new Date().toISOString(), last_touched: new Date().toISOString() },
    };
    saveEntry(entry as any, tmpDir);
    saveWorkingSet({ active_task: 'task-active', pinned_entries: [], hot_entries: [], recently_expanded: [], blocked_entries: [] }, tmpDir);

    let output = '';
    const originalLog = console.log;
    console.log = (msg: string) => { output += msg + '\n'; };
    try {
      runWhy(['task-active']);
    } finally {
      console.log = originalLog;
    }
    assert(output.includes('Why task-active matters'));
    assert(output.includes('current active task'));
  });
});
