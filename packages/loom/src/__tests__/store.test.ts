import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { initWorkspace, isInitialized, saveEntry, getEntry, listEntries, getWorkingSet, saveWorkingSet, getConfig, invalidateCache } from '../core/store.js';
import { drainWalAsync } from '../core/wal-queue.js';
import type { RuleEntry, TaskEntry } from '../types/index.js';

describe('store', () => {
  let tmpDir: string;

  before(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'loom-store-'));
  });

  after(async () => {
    await drainWalAsync();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('isInitialized returns false before init', () => {
    assert.strictEqual(isInitialized(tmpDir), false);
  });

  it('initWorkspace creates .loom structure', () => {
    initWorkspace('test-project', tmpDir);
    assert.strictEqual(isInitialized(tmpDir), true);
    assert(fs.existsSync(path.join(tmpDir, '.loom', 'config.yml')));
    assert(fs.existsSync(path.join(tmpDir, '.loom', 'cache', 'active-prompt.txt')));
  });

  it('getConfig reads initialized config', () => {
    const config = getConfig(tmpDir);
    assert(config);
    assert.strictEqual(config!.project_name, 'test-project');
    assert.strictEqual(config!.version, '0.2.4');
  });

  it('getConfig returns null when config file is empty', () => {
    const configPath = path.join(tmpDir, '.loom', 'config.yml');
    fs.writeFileSync(configPath, '');
    assert.strictEqual(getConfig(tmpDir), null);
  });

  it('saveEntry and getEntry roundtrip', () => {
    const entry: RuleEntry = {
      id: 'rule-test',
      type: 'Rule',
      version: 1,
      namespace: 'project',
      content: { l1_5: 'test', l2: 'test rule', l3: 'detail' },
      lifecycle: { state: 'active', created: new Date().toISOString(), updated: new Date().toISOString(), last_accessed: new Date().toISOString(), last_activated: new Date().toISOString(), activation_count: 1, verification_count: 0, promoted_from: null, demotion_reason: null },
      quality: { freshness: 1, trust: 0.9, activity: 1, composite_score: 0.95 },
      trust: { level: 'verified', source: 'human' },
      activation: { paths: [], keywords: [], intents: [], tools: [], entry_refs: [] },
      conflicts: { supersedes: [], conflicts_with: [], overridden_by: null, precedence: 0, resolution_policy: 'newest_wins' },
      bindings_out: [],
      bindings_in: [],
    };
    saveEntry(entry, tmpDir);
    const retrieved = getEntry('rule-test', tmpDir);
    assert(retrieved);
    assert.strictEqual(retrieved!.id, 'rule-test');
    assert.strictEqual(retrieved!.type, 'Rule');
  });

  it('listEntries includes saved entries', () => {
    const entries = listEntries(tmpDir);
    assert(entries.some(e => e.id === 'rule-test'));
  });

  it('saveWorkingSet and getWorkingSet roundtrip', () => {
    const ws = {
      active_task: 'task-1',
      pinned_entries: ['task-1'],
      hot_entries: ['task-1'],
      recently_expanded: [],
      blocked_entries: [],
    };
    saveWorkingSet(ws, tmpDir);
    const retrieved = getWorkingSet(tmpDir);
    assert.deepStrictEqual(retrieved, ws);
  });

  it('getWorkingSet returns defaults when file is empty', () => {
    const wsPath = path.join(tmpDir, '.loom', 'cache', 'working-set.yml');
    fs.writeFileSync(wsPath, '');
    const ws = getWorkingSet(tmpDir);
    assert.strictEqual(ws.active_task, null);
    assert.deepStrictEqual(ws.pinned_entries, []);
    assert.deepStrictEqual(ws.hot_entries, []);
    assert.deepStrictEqual(ws.recently_expanded, []);
    assert.deepStrictEqual(ws.blocked_entries, []);
  });

  it('listEntries skips empty entry files', () => {
    const entriesDir = path.join(tmpDir, '.loom', 'entries', 'rules');
    fs.writeFileSync(path.join(entriesDir, 'empty.loom.yml'), '');
    const entries = listEntries(tmpDir);
    assert(!entries.some(e => e.id === 'empty'));
  });

  it('invalidateCache clears cached state', () => {
    invalidateCache(tmpDir);
    const entries = listEntries(tmpDir);
    assert(entries.some(e => e.id === 'rule-test'));
  });

  it('saveEntry strips bindings on disk', () => {
    const entry: TaskEntry = {
      id: 'task-bindings',
      type: 'Task',
      version: 1,
      namespace: 'project',
      content: { l1_5: 't', l2: 'task', l3: 'task detail' },
      lifecycle: { state: 'active', created: new Date().toISOString(), updated: new Date().toISOString(), last_accessed: new Date().toISOString(), last_activated: new Date().toISOString(), activation_count: 1, verification_count: 0, promoted_from: null, demotion_reason: null },
      quality: { freshness: 1, trust: 0.9, activity: 1, composite_score: 0.95 },
      trust: { level: 'verified', source: 'human' },
      activation: { paths: [], keywords: [], intents: [], tools: [], entry_refs: [] },
      conflicts: { supersedes: [], conflicts_with: [], overridden_by: null, precedence: 0, resolution_policy: 'newest_wins' },
      bindings_out: [{ target: 'x', rel: 'depends_on', conf: 0.8 }],
      bindings_in: [{ source: 'y', rel: 'governs', conf: 0.7 }],
      task: { title: 't', status: 'active', intent: 'feature', priority: 'medium', working_set: [], related_entries: [], acceptance_criteria: [], unresolved_questions: [], progress: { completed: [], current: null, next: null, blocked_by: null }, started_in: new Date().toISOString(), last_touched: new Date().toISOString() },
    };
    saveEntry(entry, tmpDir);
    const filePath = path.join(tmpDir, '.loom', 'entries', 'tasks', 'task-bindings.loom.yml');
    const raw = fs.readFileSync(filePath, 'utf-8');
    assert(!raw.includes('bindings_out'));
    assert(!raw.includes('bindings_in'));
  });

  it('saveEntry rejects path separators in id', () => {
    const entry: RuleEntry = {
      id: '../escape',
      type: 'Rule',
      version: 1,
      namespace: 'project',
      content: { l1_5: 'bad', l2: 'bad', l3: 'bad' },
      lifecycle: { state: 'active', created: new Date().toISOString(), updated: new Date().toISOString(), last_accessed: new Date().toISOString(), last_activated: new Date().toISOString(), activation_count: 1, verification_count: 0, promoted_from: null, demotion_reason: null },
      quality: { freshness: 1, trust: 0.9, activity: 1, composite_score: 0.95 },
      trust: { level: 'verified', source: 'human' },
      activation: { paths: [], keywords: [], intents: [], tools: [], entry_refs: [] },
      conflicts: { supersedes: [], conflicts_with: [], overridden_by: null, precedence: 0, resolution_policy: 'newest_wins' },
      bindings_out: [],
      bindings_in: [],
    };
    assert.throws(() => saveEntry(entry, tmpDir), /Invalid entry id/);
  });
});
