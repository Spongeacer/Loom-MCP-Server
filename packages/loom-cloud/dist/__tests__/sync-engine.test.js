import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';
import { rmSync, existsSync } from 'node:fs';
import { createSyncEngine } from '../sync-engine.js';
// ── Mock StoreAdapter ────────────────────────────────────────────────────────
function createMockStore() {
    const entries = new Map();
    const bindings = [];
    let workingSet = { active_task: null, pinned_entries: [], hot_entries: [], recently_expanded: [], blocked_entries: [] };
    let config = null;
    return {
        initWorkspace: () => { },
        isInitialized: () => true,
        listEntries: () => Array.from(entries.values()),
        getEntry: (id) => entries.get(id) ?? null,
        saveEntry: (e) => entries.set(e.id, e),
        listBindings: () => bindings,
        saveBinding: (b) => bindings.push(b),
        removeBinding: () => { },
        getWorkingSet: () => workingSet,
        saveWorkingSet: (ws) => { workingSet = ws; },
        getConfig: () => config,
        writeActivePrompt: () => { },
        readCacheVersion: () => '0',
        bumpCacheVersion: () => { },
    };
}
// ── Mock CloudApiClient ──────────────────────────────────────────────────────
function createMockApi() {
    const pushed = [];
    const pulled = [];
    return {
        pushed,
        pulled,
        async registerDevice(payload) {
            return { accessToken: 'tok_' + payload.deviceId, expiresAt: Date.now() / 1000 + 3600 };
        },
        async push(payload) {
            pushed.push(payload);
            return {
                newCloudVersion: (payload.baseCloudVersion ?? 0) + 1,
                accepted: payload.entries.map((e) => e.id),
                rejected: [],
            };
        },
        async pull(payload) {
            pulled.push(payload);
            return {
                cloudVersion: payload.sinceCloudVersion + 1,
                entries: [],
                pipelinePending: false,
            };
        },
        async validateLicense() {
            return null;
        },
    };
}
// ── Test helpers ─────────────────────────────────────────────────────────────
function makeEntry(id) {
    const now = new Date().toISOString();
    return {
        id,
        type: 'Skill',
        version: 1,
        namespace: 'project',
        content: { l1_5: 'summary', l2: 'details', l3: 'full' },
        lifecycle: { state: 'active', created: now, updated: now, last_accessed: now, last_activated: now, activation_count: 0, verification_count: 0, promoted_from: null, demotion_reason: null },
        quality: { freshness: 1, trust: 1, activity: 1, composite_score: 1 },
        trust: { level: 'trusted', source: 'human' },
        activation: { paths: [], keywords: [], intents: [], tools: [], entry_refs: [] },
        conflicts: { supersedes: [], conflicts_with: [], overridden_by: null, precedence: 0, resolution_policy: 'newest_wins' },
        bindings_out: [],
        bindings_in: [],
    };
}
// ── Tests ────────────────────────────────────────────────────────────────────
describe('SyncEngine', () => {
    let store;
    let api;
    let engine;
    const config = {
        apiBaseUrl: 'https://test.loom.dev',
        pullIntervalMs: 60_000,
        pushTimeoutMs: 10_000,
        backgroundSync: false,
        llmMergeEnabled: true,
    };
    beforeEach(() => {
        // Clean up sync-index from previous tests
        if (existsSync('.loom/cache/sync-index.yml')) {
            rmSync('.loom/cache/sync-index.yml');
        }
        store = createMockStore();
        api = createMockApi();
        engine = createSyncEngine({ store, api, config, projectName: 'test-proj', projectRoot: process.cwd() });
    });
    it('initializes with empty sync index', () => {
        assert.strictEqual(engine.index.cloudVersion, 0);
        assert.deepStrictEqual(engine.index.entries, {});
    });
    it('pushes dirty entries on sync', async () => {
        const entry = makeEntry('skill-001');
        store.saveEntry(entry);
        engine.markDirty('skill-001');
        const result = await engine.sync();
        assert.strictEqual(result.pushed, 1);
        assert.strictEqual(result.pulled, 0);
        assert.strictEqual(api.pushed.length, 1);
        const payload = api.pushed[0];
        assert.strictEqual(payload.entries[0].id, 'skill-001');
    });
    it('pulls cloud entries on sync', async () => {
        const cloudEntry = {
            entry: { ...makeEntry('user-skill-001'), namespace: 'user' },
            cloud: { cloudVersion: 5, sourceProjects: ['test-proj'], seenByDevices: [], provenance: 'llm-merged' },
        };
        // Override mock pull to return an entry
        api.pull = async (payload) => {
            api.pulled.push(payload);
            return {
                cloudVersion: 5,
                entries: [cloudEntry],
                pipelinePending: false,
            };
        };
        const result = await engine.sync();
        assert.strictEqual(result.pulled, 1);
        assert.strictEqual(store.getEntry('user-skill-001')?.namespace, 'user');
    });
    it('does not sync if already syncing', async () => {
        // Manually mark as syncing
        engine._isSyncing = true;
        const result = await engine.sync();
        assert.strictEqual(result.errors[0], 'Sync already in progress');
    });
    it('forks local draft on offline-edit conflict', async () => {
        // Local entry modified while offline
        const local = makeEntry('decision-001');
        local.lifecycle.updated = new Date().toISOString();
        store.saveEntry(local);
        // Cloud has newer merged version
        const cloudEntry = {
            entry: {
                ...makeEntry('decision-001'),
                content: { l1_5: 'merged summary', l2: 'merged details', l3: 'merged full' },
            },
            cloud: { cloudVersion: 5, sourceProjects: ['test-proj'], seenByDevices: [], provenance: 'llm-merged' },
        };
        // Pre-populate sync index with older cloud version and dirty flag
        engine._index.entries['decision-001'] = {
            cloudVersion: 3,
            lastPushAt: new Date(Date.now() - 3600_000).toISOString(),
            lastPullAt: new Date(Date.now() - 3600_000).toISOString(),
            dirty: true,
            forkedTo: null,
        };
        api.pull = async (payload) => {
            api.pulled.push(payload);
            return {
                cloudVersion: 5,
                entries: [cloudEntry],
                pipelinePending: false,
            };
        };
        const result = await engine.sync();
        assert.strictEqual(result.pulled, 1);
        assert.strictEqual(result.conflicts.length, 1);
        assert.ok(result.conflicts[0].fork);
        assert.strictEqual(result.conflicts[0].strategy, 'fork-local');
        // Winner is cloud version
        const winner = store.getEntry('decision-001');
        assert.strictEqual(winner?.content.l1_5, 'merged summary');
        // Fork is local draft
        const forkId = result.conflicts[0].fork.id;
        const fork = store.getEntry(forkId);
        assert.ok(fork);
        assert.strictEqual(fork?.namespace, 'local');
        assert.strictEqual(fork?.lifecycle.state, 'draft');
    });
});
//# sourceMappingURL=sync-engine.test.js.map