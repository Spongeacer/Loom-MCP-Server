import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { initWorkspace, saveEntry, getEntry } from '../core/store.js';
import { saveExtractedSkill } from '../core/skill-extraction.js';
import { drainWalAsync } from '../core/wal-queue.js';
import type { TaskEntry } from '../types/index.js';

describe('skill-extraction', () => {
  let tmpDir: string;

  before(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'loom-skill-'));
    initWorkspace('test', tmpDir);
  });

  after(async () => {
    await drainWalAsync();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('returns null for non-existent task', () => {
    const skillId = saveExtractedSkill('task-missing', tmpDir);
    assert.strictEqual(skillId, null);
  });

  it('extracts skill from a valid task entry', () => {
    const task: TaskEntry = {
      id: 'task-refactor-auth',
      type: 'Task',
      version: 1,
      namespace: 'project',
      content: { l1_5: 'refactor', l2: 'Refactor auth middleware', l3: 'Refactored auth middleware and kept tests green.' },
      lifecycle: { state: 'active', created: new Date().toISOString(), updated: new Date().toISOString(), last_accessed: new Date().toISOString(), last_activated: new Date().toISOString(), activation_count: 1, verification_count: 0, promoted_from: null, demotion_reason: null },
      quality: { freshness: 1, trust: 0.9, activity: 1, composite_score: 0.95 },
      trust: { level: 'verified', source: 'human' },
      activation: { paths: [], keywords: [], intents: [], tools: [], entry_refs: [] },
      conflicts: { supersedes: [], conflicts_with: [], overridden_by: null, precedence: 0, resolution_policy: 'newest_wins' },
      bindings_out: [],
      bindings_in: [],
      task: { title: 'Refactor auth middleware', status: 'done', intent: 'refactor', priority: 'high', working_set: [], related_entries: [], acceptance_criteria: [], unresolved_questions: [], progress: { completed: [], current: null, next: null, blocked_by: null }, started_in: new Date().toISOString(), last_touched: new Date().toISOString() },
    };
    saveEntry(task, tmpDir);

    const skillId = saveExtractedSkill('task-refactor-auth', tmpDir);
    assert(skillId);
    assert(skillId!.startsWith('skill-'));

    const skill = getEntry(skillId!, tmpDir);
    assert(skill);
    assert.strictEqual(skill!.type, 'Skill');
    assert((skill!.content.l3 as string).includes('auth middleware'));
  });
});
