import { describe, it } from 'node:test';
import assert from 'node:assert';
import { resolveConflict } from '../conflict-resolver.js';
import type { Entry } from '@loom/core';

function makeEntry(id: string, version: number): Entry {
  const now = new Date().toISOString();
  return {
    id, type: 'Rule', version, namespace: 'project',
    content: { l1_5: 'test', l2: 'test', l3: 'test' },
    lifecycle: { state: 'active', created: now, updated: now, last_accessed: now, last_activated: now, activation_count: 0, verification_count: 0, promoted_from: null, demotion_reason: null },
    quality: { freshness: 1, trust: 1, activity: 1, composite_score: 1 },
    trust: { level: 'trusted', source: 'human' },
    activation: { paths: [], keywords: [], intents: [], tools: [], entry_refs: [] },
    conflicts: { supersedes: [], conflicts_with: [], overridden_by: null, precedence: 0, resolution_policy: 'newest_wins' },
    bindings_out: [], bindings_in: [],
  };
}

describe('conflict-resolver', () => {
  it('cloud wins when local absent', () => {
    const cloud = makeEntry('e1', 2);
    const result = resolveConflict(null, cloud, undefined);
    assert.strictEqual(result.strategy, 'cloud-wins');
    assert.strictEqual(result.winner, cloud);
  });

  it('local wins when cloud absent', () => {
    const local = makeEntry('e1', 1);
    const result = resolveConflict(local, null, undefined);
    assert.strictEqual(result.strategy, 'local-wins');
    assert.strictEqual(result.winner, local);
  });

  it('cloud wins when newer and local clean', () => {
    const local = makeEntry('e1', 1);
    const cloud = makeEntry('e1', 2);
    const result = resolveConflict(local, cloud, { cloudVersion: 1, lastSyncedAt: new Date().toISOString(), dirty: false });
    assert.strictEqual(result.strategy, 'cloud-wins');
  });

  it('fork-local when newer and local dirty', () => {
    const local = makeEntry('e1', 1);
    const cloud = makeEntry('e1', 2);
    const result = resolveConflict(local, cloud, { cloudVersion: 1, lastSyncedAt: new Date().toISOString(), dirty: true });
    assert.strictEqual(result.strategy, 'fork-local');
    assert.ok(result.fork);
  });

  it('local wins when same or newer', () => {
    const local = makeEntry('e1', 2);
    const cloud = makeEntry('e1', 1);
    const result = resolveConflict(local, cloud, undefined);
    assert.strictEqual(result.strategy, 'local-wins');
  });
});
