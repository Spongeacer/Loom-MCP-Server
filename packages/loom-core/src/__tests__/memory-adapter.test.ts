import { describe, it } from 'node:test';
import assert from 'node:assert';
import { MemoryStoreAdapter } from '../store/memory-adapter.js';
import type { RuleEntry } from '../types/index.js';

describe('MemoryStoreAdapter', () => {
  function makeEntry(id: string): RuleEntry {
    return {
      id,
      type: 'Rule',
      version: 1,
      namespace: 'project',
      content: { l1_5: 'test', l2: 'test', l3: 'test' },
      lifecycle: {
        state: 'active',
        created: new Date().toISOString(),
        updated: new Date().toISOString(),
        last_accessed: new Date().toISOString(),
        last_activated: new Date().toISOString(),
        activation_count: 0,
        verification_count: 0,
        promoted_from: null,
        demotion_reason: null,
      },
      quality: { freshness: 1, trust: 1, activity: 1, composite_score: 1 },
      trust: { level: 'trusted', source: 'human' },
      activation: { paths: [], keywords: [], intents: [], tools: [], entry_refs: [] },
      conflicts: { supersedes: [], conflicts_with: [], overridden_by: null, precedence: 0, resolution_policy: 'newest_wins' },
      bindings_out: [],
      bindings_in: [],
    };
  }

  it('initWorkspace and isInitialized', () => {
    const store = new MemoryStoreAdapter();
    assert.strictEqual(store.isInitialized(), false);
    store.initWorkspace('test-project');
    assert.strictEqual(store.isInitialized(), true);
    const config = store.getConfig();
    assert.ok(config);
    assert.strictEqual(config!.project_name, 'test-project');
  });

  it('saveEntry and getEntry', () => {
    const store = new MemoryStoreAdapter();
    store.initWorkspace('test');
    const entry = makeEntry('rule-1');
    store.saveEntry(entry);
    const found = store.getEntry('rule-1');
    assert.ok(found);
    assert.strictEqual(found!.id, 'rule-1');
  });

  it('removeEntry moves to trash', () => {
    const store = new MemoryStoreAdapter();
    store.initWorkspace('test');
    const entry = makeEntry('rule-1');
    store.saveEntry(entry);
    store.removeEntry('rule-1');
    assert.strictEqual(store.getEntry('rule-1'), null);
    const trash = store.listTrash();
    assert.strictEqual(trash.length, 1);
    assert.strictEqual(trash[0].id, 'rule-1');
  });

  it('restoreFromTrash', () => {
    const store = new MemoryStoreAdapter();
    store.initWorkspace('test');
    const entry = makeEntry('rule-1');
    store.saveEntry(entry);
    store.removeEntry('rule-1');
    store.restoreFromTrash('rule-1');
    assert.ok(store.getEntry('rule-1'));
    assert.strictEqual(store.listTrash().length, 0);
  });

  it('saveBinding and removeBinding', () => {
    const store = new MemoryStoreAdapter();
    store.initWorkspace('test');
    store.saveBinding({
      source: 'a',
      target: 'b',
      relationship: 'depends_on',
      directionality: 'forward',
      status: 'active',
      confidence: 1,
      confidence_model: { base: 1, freshness_factor: 1, evidence_weight: 1, usage_boost: 1, drift_penalty: 0 },
      evidence: [],
      decay: { half_life_days: 30, last_reconfirmed: new Date().toISOString() },
      invalidation: { invalidated_by: null, reason: null },
      verification_history: [],
    });
    assert.strictEqual(store.listBindings().length, 1);
    store.removeBinding('a', 'b');
    assert.strictEqual(store.listBindings().length, 0);
  });
});
