import { describe, it } from 'node:test';
import assert from 'node:assert';

import { resolveConflict, isEntryDirty } from '../conflict-resolver.js';
import type { Entry, EntryType } from '../../../loom/dist/types/index.js';
import type { EntrySyncState } from '../types.js';

// ── Test helpers ─────────────────────────────────────────────────────────────

function makeEntry(
  id: string,
  overrides: Partial<Entry> & { cloudVersion?: number } = {},
): Entry {
  const now = new Date().toISOString();
  const base: Entry = {
    id,
    type: 'Decision' as const,
    version: 1,
    namespace: 'project',
    content: { l1_5: 'summary', l2: 'details', l3: 'full' },
    lifecycle: {
      state: 'active',
      created: now,
      updated: now,
      last_accessed: now,
      last_activated: now,
      activation_count: 0,
      verification_count: 0,
      promoted_from: null,
      demotion_reason: null,
    },
    quality: { freshness: 1, trust: 1, activity: 1, composite_score: 1 },
    trust: { level: 'trusted', source: 'human' },
    activation: { paths: [], keywords: [], intents: [], tools: [], entry_refs: [] },
    conflicts: {
      supersedes: [],
      conflicts_with: [],
      overridden_by: null,
      precedence: 0,
      resolution_policy: 'newest_wins',
    },
    bindings_out: [],
    bindings_in: [],
    decision: {
      question: 'q',
      chosen: 'a',
      rationale: 'r',
      rejected: [],
      assumptions: [],
      impact_scope: [],
      supersedes: null,
      made_in: 'test',
    },
  };

  const entry = { ...base, ...overrides } as Entry;

  // Inject cloudVersion into metadata if provided
  if (overrides.cloudVersion !== undefined) {
    (entry as unknown as Record<string, unknown>).metadata = {
      sync: { cloudVersion: overrides.cloudVersion },
    };
  }

  return entry;
}

function makeSyncState(overrides: Partial<EntrySyncState> = {}): EntrySyncState {
  return {
    cloudVersion: null,
    lastPushAt: null,
    lastPullAt: null,
    dirty: false,
    forkedTo: null,
    ...overrides,
  };
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('resolveConflict', () => {
  it('scenario 1: cloud only → adopt cloud', () => {
    const cloud = makeEntry('e1', { cloudVersion: 5 });
    const result = resolveConflict(null, cloud, undefined);

    assert.strictEqual(result.strategy, 'cloud-wins');
    assert.strictEqual(result.winner.id, 'e1');
    assert.strictEqual(result.fork, null);
    assert.ok(result.reason.includes('Cloud entry'));
  });

  it('scenario 2: local only → keep local', () => {
    const local = makeEntry('e1');
    const result = resolveConflict(local, null, undefined);

    assert.strictEqual(result.strategy, 'local-wins');
    assert.strictEqual(result.winner.id, 'e1');
    assert.strictEqual(result.fork, null);
    assert.ok(result.reason.includes('not yet pushed'));
  });

  it('scenario 3a: cloud newer, local not dirty → cloud wins', () => {
    const local = makeEntry('e1', { cloudVersion: 3 });
    const cloud = makeEntry('e1', { cloudVersion: 5 });
    const sync = makeSyncState({ cloudVersion: 3, dirty: false });

    const result = resolveConflict(local, cloud, sync);

    assert.strictEqual(result.strategy, 'cloud-wins');
    assert.strictEqual(result.winner.id, 'e1');
    assert.strictEqual(result.fork, null);
    assert.ok(result.reason.includes('5'));
  });

  it('scenario 3b: cloud newer, local dirty → fork', () => {
    const local = makeEntry('e1', { cloudVersion: 3 });
    const cloud = makeEntry('e1', { cloudVersion: 5 });
    const sync = makeSyncState({ cloudVersion: 3, dirty: true });

    const result = resolveConflict(local, cloud, sync);

    assert.strictEqual(result.strategy, 'fork-local');
    assert.strictEqual(result.winner.id, 'e1');
    assert.ok(result.fork);
    assert.ok(result.fork!.id.startsWith('e1-local-'));
    assert.strictEqual(result.fork!.namespace, 'local');
    assert.strictEqual(result.fork!.lifecycle.state, 'draft');
    assert.ok(result.reason.includes('offline edits forked'));
  });

  it('scenario 3d: cloud older or same → local wins', () => {
    const local = makeEntry('e1', { cloudVersion: 5, version: 2 });
    const cloud = makeEntry('e1', { cloudVersion: 5 });
    const sync = makeSyncState({ cloudVersion: 5, dirty: false });

    const result = resolveConflict(local, cloud, sync);

    assert.strictEqual(result.strategy, 'local-wins');
    assert.strictEqual(result.winner.id, 'e1');
    assert.strictEqual(result.fork, null);
  });

  it('both null → graceful no-op', () => {
    const result = resolveConflict(null, null, undefined);
    assert.strictEqual(result.strategy, 'cloud-wins');
    assert.strictEqual(result.fork, null);
    assert.ok(result.reason.includes('absent'));
  });
});

describe('isEntryDirty', () => {
  it('returns true when never synced', () => {
    const entry = makeEntry('e1');
    assert.strictEqual(isEntryDirty(entry, undefined), true);
  });

  it('returns true when updated after last push', () => {
    const entry = makeEntry('e1');
    entry.lifecycle.updated = new Date(Date.now() + 1000).toISOString();
    const sync = makeSyncState({ lastPushAt: new Date().toISOString() });
    assert.strictEqual(isEntryDirty(entry, sync), true);
  });

  it('returns false when not updated since last push', () => {
    const entry = makeEntry('e1');
    const sync = makeSyncState({ lastPushAt: new Date(Date.now() + 1000).toISOString() });
    assert.strictEqual(isEntryDirty(entry, sync), false);
  });
});
