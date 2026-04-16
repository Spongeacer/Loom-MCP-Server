import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { runSkill } from '../commands/skill.js';
import { initWorkspace, saveEntry } from '../core/store.js';
import { drainWalAsync } from '../core/wal-queue.js';
import type { TaskEntry } from '../types/index.js';

describe('skill command', () => {
  let tmpDir: string;
  let originalCwd: string;

  before(() => {
    originalCwd = process.cwd();
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'loom-skill-cmd-'));
    process.chdir(tmpDir);
    initWorkspace('test', tmpDir);
  });

  after(async () => {
    await drainWalAsync();
    process.chdir(originalCwd);
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('lists skills when no args', () => {
    const output = runSkill([]);
    assert(output.includes('Skills'));
  });

  it('extracts skill from a valid task', () => {
    const task: TaskEntry = {
      id: 'task-sample',
      type: 'Task',
      version: 1,
      namespace: 'project',
      content: { l1_5: 's', l2: 'Sample', l3: 'Sample task detail' },
      lifecycle: { state: 'active', created: new Date().toISOString(), updated: new Date().toISOString(), last_accessed: new Date().toISOString(), last_activated: new Date().toISOString(), activation_count: 1, verification_count: 0, promoted_from: null, demotion_reason: null },
      quality: { freshness: 1, trust: 0.9, activity: 1, composite_score: 0.95 },
      trust: { level: 'verified', source: 'human' },
      activation: { paths: [], keywords: [], intents: [], tools: [], entry_refs: [] },
      conflicts: { supersedes: [], conflicts_with: [], overridden_by: null, precedence: 0, resolution_policy: 'newest_wins' },
      bindings_out: [],
      bindings_in: [],
      task: { title: 'Sample', status: 'done', intent: 'feature', priority: 'medium', working_set: [], related_entries: [], acceptance_criteria: [], unresolved_questions: [], progress: { completed: [], current: null, next: null, blocked_by: null }, started_in: new Date().toISOString(), last_touched: new Date().toISOString() },
    };
    saveEntry(task, tmpDir);

    const output = runSkill(['extract', 'task-sample']);
    assert(output.includes('Extracted skill'));
    assert(output.includes('task-sample'));
  });

  it('rejects extracting from non-task', () => {
    assert.throws(() => {
      runSkill(['extract', 'no-such-task']);
    }, /Not a valid task/);
  });
});
