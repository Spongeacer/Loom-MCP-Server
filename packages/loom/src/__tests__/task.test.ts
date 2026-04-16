import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { initWorkspace, getWorkingSet, getEntry, saveEntry } from '../core/store.js';
import { runTask } from '../commands/task.js';
import { drainWalAsync } from '../core/wal-queue.js';
import type { TaskEntry } from '../types/index.js';

describe('task command', () => {
  let tmpDir: string;
  let originalCwd: string;

  before(() => {
    originalCwd = process.cwd();
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'loom-task-'));
    process.chdir(tmpDir);
    initWorkspace('test', tmpDir);
  });

  after(async () => {
    await drainWalAsync();
    process.chdir(originalCwd);
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('lists tasks when no args provided', async () => {
    let output = '';
    const originalLog = console.log;
    console.log = (msg: string) => { output += msg + '\n'; };
    try {
      await runTask([]);
    } finally {
      console.log = originalLog;
    }
    assert(output.includes('Active Task'));
    assert(output.includes('All Tasks'));
  });

  it('creates a new task and activates it', async () => {
    await runTask(['create', 'Fix auth bug']);

    const ws = getWorkingSet(tmpDir);
    assert.strictEqual(ws.active_task, 'task-fix-auth-bug');

    const task = getEntry('task-fix-auth-bug', tmpDir);
    assert(task);
    assert.strictEqual((task as TaskEntry).task.title, 'Fix auth bug');
  });

  it('sets active task by id', async () => {
    const task: TaskEntry = {
      id: 'task-existing',
      type: 'Task',
      version: 1,
      namespace: 'project',
      content: { l1_5: 'e', l2: 'Existing task', l3: 'Existing task' },
      lifecycle: { state: 'active', created: new Date().toISOString(), updated: new Date().toISOString(), last_accessed: new Date().toISOString(), last_activated: new Date().toISOString(), activation_count: 1, verification_count: 0, promoted_from: null, demotion_reason: null },
      quality: { freshness: 1, trust: 0.9, activity: 1, composite_score: 0.95 },
      trust: { level: 'verified', source: 'human' },
      activation: { paths: [], keywords: [], intents: [], tools: [], entry_refs: [] },
      conflicts: { supersedes: [], conflicts_with: [], overridden_by: null, precedence: 0, resolution_policy: 'newest_wins' },
      bindings_out: [],
      bindings_in: [],
      task: { title: 'Existing task', status: 'active', intent: 'feature', priority: 'medium', working_set: [], related_entries: [], acceptance_criteria: [], unresolved_questions: [], progress: { completed: [], current: null, next: null, blocked_by: null }, started_in: new Date().toISOString(), last_touched: new Date().toISOString() },
    };
    saveEntry(task, tmpDir);

    await runTask(['set', 'task-existing']);
    const ws = getWorkingSet(tmpDir);
    assert.strictEqual(ws.active_task, 'task-existing');
    assert(ws.pinned_entries.includes('task-existing'));
  });

  it('rejects setting non-task entry', async () => {
    let output = '';
    const originalLog = console.log;
    console.log = (msg: string) => { output += msg + '\n'; };
    try {
      await runTask(['set', 'not-a-task']);
    } finally {
      console.log = originalLog;
    }
    assert(output.includes('Not a valid task'));
  });
});
