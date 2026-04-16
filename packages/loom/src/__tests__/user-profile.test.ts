import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { initWorkspace, getEntry } from '../core/store.js';
import { ensureUserProfile, updateUserProfileFromTask, updateUserProfileFromDecision } from '../core/user-profile.js';
import { drainWalAsync } from '../core/wal-queue.js';
import type { TaskEntry, DecisionEntry } from '../types/index.js';

describe('user-profile', () => {
  let tmpDir: string;

  before(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'loom-user-'));
    initWorkspace('test', tmpDir);
  });

  after(async () => {
    await drainWalAsync();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('ensureUserProfile creates profile if missing', () => {
    ensureUserProfile(tmpDir);
    const profile = getEntry('memory-user-profile', tmpDir);
    assert(profile);
    assert.strictEqual(profile!.type, 'Memory');
  });

  it('updateUserProfileFromTask accumulates task info', () => {
    const task: TaskEntry = {
      id: 'task-sample',
      type: 'Task',
      version: 1,
      namespace: 'project',
      content: { l1_5: 's', l2: 'Sample task', l3: 'Sample task detail' },
      lifecycle: { state: 'active', created: new Date().toISOString(), updated: new Date().toISOString(), last_accessed: new Date().toISOString(), last_activated: new Date().toISOString(), activation_count: 1, verification_count: 0, promoted_from: null, demotion_reason: null },
      quality: { freshness: 1, trust: 0.9, activity: 1, composite_score: 0.95 },
      trust: { level: 'verified', source: 'human' },
      activation: { paths: [], keywords: [], intents: [], tools: [], entry_refs: [] },
      conflicts: { supersedes: [], conflicts_with: [], overridden_by: null, precedence: 0, resolution_policy: 'newest_wins' },
      bindings_out: [],
      bindings_in: [],
      task: { title: 'Sample task', status: 'active', intent: 'feature', priority: 'high', working_set: [], related_entries: [], acceptance_criteria: [], unresolved_questions: [], progress: { completed: [], current: null, next: null, blocked_by: null }, started_in: new Date().toISOString(), last_touched: new Date().toISOString() },
    };
    updateUserProfileFromTask(task, tmpDir);
    const profile = getEntry('memory-user-profile', tmpDir);
    assert(profile);
    assert((profile!.content.l3 as string).includes('task-sample'));
  });

  it('updateUserProfileFromDecision accumulates decision info', () => {
    const decision: DecisionEntry = {
      id: 'dec-sample',
      type: 'Decision',
      version: 1,
      namespace: 'project',
      content: { l1_5: 's', l2: 'Use RBAC', l3: 'Use RBAC' },
      lifecycle: { state: 'active', created: new Date().toISOString(), updated: new Date().toISOString(), last_accessed: new Date().toISOString(), last_activated: new Date().toISOString(), activation_count: 1, verification_count: 0, promoted_from: null, demotion_reason: null },
      quality: { freshness: 1, trust: 0.9, activity: 1, composite_score: 0.95 },
      trust: { level: 'verified', source: 'human' },
      activation: { paths: [], keywords: [], intents: [], tools: [], entry_refs: [] },
      conflicts: { supersedes: [], conflicts_with: [], overridden_by: null, precedence: 0, resolution_policy: 'newest_wins' },
      bindings_out: [],
      bindings_in: [],
      decision: { question: 'Auth?', chosen: 'RBAC', rationale: 'Simple', rejected: [], assumptions: [], impact_scope: [], supersedes: null, made_in: new Date().toISOString() },
    };
    updateUserProfileFromDecision(decision, tmpDir);
    const profile = getEntry('memory-user-profile', tmpDir);
    assert(profile);
    assert((profile!.content.l3 as string).includes('RBAC'));
  });
});
