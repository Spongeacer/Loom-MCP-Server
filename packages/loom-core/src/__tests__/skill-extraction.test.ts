import { describe, it } from 'node:test';
import assert from 'node:assert';
import { MemoryStoreAdapter } from '../store/memory-adapter.js';
import { saveExtractedSkill } from '../skill-extraction.js';
import type { TaskEntry } from '../types/index.js';

describe('skill-extraction', () => {
  function makeTask(id: string, title: string): TaskEntry {
    const now = new Date().toISOString();
    return {
      id, type: 'Task', version: 1, namespace: 'project',
      content: { l1_5: title.slice(0, 30), l2: title, l3: title },
      lifecycle: { state: 'active', created: now, updated: now, last_accessed: now, last_activated: now, activation_count: 0, verification_count: 0, promoted_from: null, demotion_reason: null },
      quality: { freshness: 1, trust: 0.9, activity: 1, composite_score: 0.95 },
      trust: { level: 'verified', source: 'human' },
      activation: { paths: [], keywords: [], intents: [], tools: [], entry_refs: [] },
      conflicts: { supersedes: [], conflicts_with: [], overridden_by: null, precedence: 0, resolution_policy: 'newest_wins' },
      bindings_out: [], bindings_in: [],
      task: {
        title, status: 'active', intent: 'feature', priority: 'medium',
        working_set: [], related_entries: [], acceptance_criteria: [], unresolved_questions: [],
        progress: { completed: ['step 1'], current: 'step 2', next: 'step 3', blocked_by: null },
        started_in: now, last_touched: now,
      },
    };
  }

  it('extracts skill from task', () => {
    const store = new MemoryStoreAdapter();
    store.initWorkspace('test');
    const task = makeTask('task-refactor-auth', 'Refactor auth module');
    store.saveEntry(task);

    const skillId = saveExtractedSkill('task-refactor-auth', store);
    assert.ok(skillId);
    assert.ok(skillId!.startsWith('skill-'));

    const skill = store.getEntry(skillId!);
    assert.ok(skill);
    assert.strictEqual(skill!.type, 'Skill');
    assert.ok(typeof skill!.content.l3 === 'string' && skill!.content.l3.includes('Refactor auth module'));

    const bindings = store.listBindings();
    assert.ok(bindings.some((b) => b.source === skillId && b.target === 'task-refactor-auth'));
  });

  it('increments version on re-extract', () => {
    const store = new MemoryStoreAdapter();
    store.initWorkspace('test');
    const task = makeTask('task-v2', 'Version test');
    store.saveEntry(task);

    const id1 = saveExtractedSkill('task-v2', store);
    const id2 = saveExtractedSkill('task-v2', store);
    assert.strictEqual(id1, id2);

    const skill = store.getEntry(id1!);
    assert.strictEqual(skill!.version, 2);
  });
});
