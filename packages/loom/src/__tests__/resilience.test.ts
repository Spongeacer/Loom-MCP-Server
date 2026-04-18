import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { initWorkspace, getConfig, getWorkingSet, getEntry, saveEntry } from '../core/store.js';
import { readDirtySet } from '../core/dirty-tracker.js';
import { drainWalAsync } from '../core/wal-queue.js';

describe('resilience - corrupted files', () => {
  let tmpDir: string;

  before(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'loom-resilience-'));
  });

  after(async () => {
    await drainWalAsync();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('getConfig returns null when config.yml is corrupted YAML', () => {
    initWorkspace('test', tmpDir);
    const configPath = path.join(tmpDir, '.loom', 'config.yml');
    fs.writeFileSync(configPath, 'this is not: valid: yaml: [[[');
    const config = getConfig(tmpDir);
    assert.strictEqual(config, null);
  });

  it('getConfig returns null when config.yml is binary garbage', () => {
    initWorkspace('test', tmpDir);
    const configPath = path.join(tmpDir, '.loom', 'config.yml');
    fs.writeFileSync(configPath, Buffer.from([0x00, 0x01, 0xff, 0xfe]));
    const config = getConfig(tmpDir);
    assert.strictEqual(config, null);
  });

  it('getWorkingSet returns defaults when working-set.yml is corrupted', () => {
    initWorkspace('test', tmpDir);
    const wsPath = path.join(tmpDir, '.loom', 'working-set.yml');
    fs.writeFileSync(wsPath, 'not: valid yaml: {{');
    const ws = getWorkingSet(tmpDir);
    assert.strictEqual(ws.active_task, null);
    assert.deepStrictEqual(ws.pinned_entries, []);
  });

  it('getWorkingSet returns defaults when working-set.yml is empty', () => {
    initWorkspace('test', tmpDir);
    const wsPath = path.join(tmpDir, '.loom', 'working-set.yml');
    fs.writeFileSync(wsPath, '');
    const ws = getWorkingSet(tmpDir);
    assert.strictEqual(ws.active_task, null);
    assert.deepStrictEqual(ws.hot_entries, []);
  });

  it('readDirtySet returns defaults when dirty-set.yml is corrupted', () => {
    initWorkspace('test', tmpDir);
    const dirtyPath = path.join(tmpDir, '.loom', 'cache', 'dirty-set.yml');
    fs.mkdirSync(path.dirname(dirtyPath), { recursive: true });
    fs.writeFileSync(dirtyPath, 'garbage: [][');
    const ds = readDirtySet(tmpDir);
    assert.deepStrictEqual(ds.files, []);
    assert.deepStrictEqual(ds.artifacts, []);
    assert.strictEqual(ds.needs_dependency_scan, false);
  });

  it('readDirtySet returns defaults when dirty-set.yml does not exist', () => {
    initWorkspace('test', tmpDir);
    const ds = readDirtySet(tmpDir);
    assert.deepStrictEqual(ds.files, []);
  });
});

describe('resilience - CAS concurrency', () => {
  let tmpDir: string;

  before(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'loom-cas-'));
    initWorkspace('cas-test', tmpDir);
  });

  after(async () => {
    await drainWalAsync();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('saveEntry with wrong expectedVersion throws Conflict', () => {
    const entry = {
      id: 'task-cas',
      type: 'Task' as const,
      version: 1,
      namespace: 'project' as const,
      content: { l1_5: 'test', l2: 'test', l3: 'test' },
      lifecycle: {
        state: 'active' as const,
        created: new Date().toISOString(),
        updated: new Date().toISOString(),
        last_accessed: new Date().toISOString(),
        last_activated: new Date().toISOString(),
        activation_count: 1,
        verification_count: 0,
        promoted_from: null,
        demotion_reason: null,
      },
      quality: { freshness: 1, trust: 1, activity: 1, composite_score: 1 },
      trust: { level: 'verified' as const, source: 'model' as const },
      activation: { paths: [], keywords: [], intents: [], tools: [], entry_refs: [] },
      conflicts: { supersedes: [], conflicts_with: [], overridden_by: null, precedence: 0, resolution_policy: 'newest_wins' as const },
      bindings_out: [],
      bindings_in: [],
      task: {
        title: 'CAS test',
        intent: 'feature' as const,
        priority: 'medium' as const,
        status: 'active' as const,
        current: null,
        next: null,
        blocked_by: null,
        completed: [],
        acceptance_criteria: [],
        unresolved_questions: [],
        working_set: [],
        related_entries: [],
        progress: { completed: [], current: null, next: null, blocked_by: null },
        started_in: new Date().toISOString(),
        last_touched: new Date().toISOString(),
      },
    };

    saveEntry(entry, tmpDir);
    const v1 = getEntry('task-cas', tmpDir)!.version;
    assert.strictEqual(v1, 2); // saveEntry auto-increments from 1 -> 2

    // Second save: version goes 2 -> 3
    saveEntry(entry, tmpDir);
    const v2 = getEntry('task-cas', tmpDir)!.version;
    assert.strictEqual(v2, 3);

    // Now try to save with stale expectedVersion=2 (should fail, current is 3)
    const staleEntry = { ...entry, version: 2 };
    assert.throws(
      () => saveEntry(staleEntry, tmpDir, false, 2),
      /Conflict.*Expected version 2, found 3/
    );
  });

  it('saveEntry with correct expectedVersion succeeds', () => {
    const entry = {
      id: 'task-cas-ok',
      type: 'Task' as const,
      version: 1,
      namespace: 'project' as const,
      content: { l1_5: 'test', l2: 'test', l3: 'test' },
      lifecycle: {
        state: 'active' as const,
        created: new Date().toISOString(),
        updated: new Date().toISOString(),
        last_accessed: new Date().toISOString(),
        last_activated: new Date().toISOString(),
        activation_count: 1,
        verification_count: 0,
        promoted_from: null,
        demotion_reason: null,
      },
      quality: { freshness: 1, trust: 1, activity: 1, composite_score: 1 },
      trust: { level: 'verified' as const, source: 'model' as const },
      activation: { paths: [], keywords: [], intents: [], tools: [], entry_refs: [] },
      conflicts: { supersedes: [], conflicts_with: [], overridden_by: null, precedence: 0, resolution_policy: 'newest_wins' as const },
      bindings_out: [],
      bindings_in: [],
      task: {
        title: 'CAS OK test',
        intent: 'feature' as const,
        priority: 'medium' as const,
        status: 'active' as const,
        current: null,
        next: null,
        blocked_by: null,
        completed: [],
        acceptance_criteria: [],
        unresolved_questions: [],
        working_set: [],
        related_entries: [],
        progress: { completed: [], current: null, next: null, blocked_by: null },
        started_in: new Date().toISOString(),
        last_touched: new Date().toISOString(),
      },
    };

    saveEntry(entry, tmpDir);
    const expectedVersion = getEntry('task-cas-ok', tmpDir)!.version;

    entry.task.title = 'Updated';
    saveEntry(entry, tmpDir, false, expectedVersion);
    assert.strictEqual(getEntry('task-cas-ok', tmpDir)!.version, expectedVersion + 1);
  });
});

describe('resilience - entry ID validation', () => {
  let tmpDir: string;

  before(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'loom-id-'));
    initWorkspace('id-test', tmpDir);
  });

  after(async () => {
    await drainWalAsync();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('saveEntry rejects IDs with path separators', () => {
    const entry = {
      id: '../etc/passwd',
      type: 'Rule' as const,
      version: 1,
      namespace: 'project' as const,
      content: { l1_5: 'x', l2: 'x', l3: 'x' },
      lifecycle: {
        state: 'active' as const,
        created: new Date().toISOString(),
        updated: new Date().toISOString(),
        last_accessed: new Date().toISOString(),
        last_activated: new Date().toISOString(),
        activation_count: 1,
        verification_count: 0,
        promoted_from: null,
        demotion_reason: null,
      },
      quality: { freshness: 1, trust: 1, activity: 1, composite_score: 1 },
      trust: { level: 'verified' as const, source: 'model' as const },
      activation: { paths: [], keywords: [], intents: [], tools: [], entry_refs: [] },
      conflicts: { supersedes: [], conflicts_with: [], overridden_by: null, precedence: 0, resolution_policy: 'newest_wins' as const },
      bindings_out: [],
      bindings_in: [],
    };

    assert.throws(
      () => saveEntry(entry as unknown as import('../types/index.js').Entry, tmpDir),
      /Invalid entry id contains path separators/
    );
  });

  it('saveEntry rejects dot-only IDs', () => {
    const entry = {
      id: '.',
      type: 'Rule' as const,
      version: 1,
      namespace: 'project' as const,
      content: { l1_5: 'x', l2: 'x', l3: 'x' },
      lifecycle: {
        state: 'active' as const,
        created: new Date().toISOString(),
        updated: new Date().toISOString(),
        last_accessed: new Date().toISOString(),
        last_activated: new Date().toISOString(),
        activation_count: 1,
        verification_count: 0,
        promoted_from: null,
        demotion_reason: null,
      },
      quality: { freshness: 1, trust: 1, activity: 1, composite_score: 1 },
      trust: { level: 'verified' as const, source: 'model' as const },
      activation: { paths: [], keywords: [], intents: [], tools: [], entry_refs: [] },
      conflicts: { supersedes: [], conflicts_with: [], overridden_by: null, precedence: 0, resolution_policy: 'newest_wins' as const },
      bindings_out: [],
      bindings_in: [],
    };

    assert.throws(
      () => saveEntry(entry as unknown as import('../types/index.js').Entry, tmpDir),
      /Invalid entry id contains path separators/
    );
  });
});
