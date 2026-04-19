import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import * as path from 'node:path';
import * as fs from 'node:fs';
import * as os from 'node:os';
import { FileSystemStoreAdapter } from '../store/fs-adapter.js';
import type { RuleEntry, TaskEntry, Binding, WorkingSet } from '../types/index.js';
import { getPaths } from '../paths.js';
import { readTextFile } from '../utils/fs-safe.js';

describe('FileSystemStoreAdapter', () => {
  let tmpDir: string;
  let store: FileSystemStoreAdapter;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'loom-fs-adapter-test-'));
    store = new FileSystemStoreAdapter(tmpDir);
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function makeRuleEntry(id: string): RuleEntry {
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

  function makeTaskEntry(id: string): TaskEntry {
    return {
      id,
      type: 'Task',
      version: 1,
      namespace: 'project',
      content: { l1_5: 'task', l2: 'task', l3: 'task' },
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
      task: {
        title: 'Test Task',
        status: 'open',
        intent: 'feature',
        priority: 'medium',
        working_set: [],
        related_entries: [],
        acceptance_criteria: [],
        unresolved_questions: [],
        progress: { completed: [], current: null, next: null, blocked_by: null },
        started_in: 'test-session',
        last_touched: new Date().toISOString(),
      },
    };
  }

  function makeBinding(source: string, target: string): Binding {
    return {
      source,
      target,
      relationship: 'depends_on',
      directionality: 'forward',
      status: 'active',
      confidence: 1,
      confidence_model: { base: 1, freshness_factor: 1, evidence_weight: 1, usage_boost: 1, drift_penalty: 0 },
      evidence: [],
      decay: { half_life_days: 30, last_reconfirmed: new Date().toISOString() },
      invalidation: { invalidated_by: null, reason: null },
      verification_history: [],
    };
  }

  describe('initWorkspace', () => {
    it('creates the .loom directory structure', () => {
      assert.strictEqual(store.isInitialized(), false);
      store.initWorkspace('test-project');
      assert.strictEqual(store.isInitialized(), true);

      const p = getPaths(tmpDir);
      assert.ok(fs.existsSync(p.root), '.loom directory should exist');
      assert.ok(fs.existsSync(p.entriesRules), 'entries/rules should exist');
      assert.ok(fs.existsSync(p.entriesMemories), 'entries/memories should exist');
      assert.ok(fs.existsSync(p.entriesSkills), 'entries/skills should exist');
      assert.ok(fs.existsSync(p.entriesPatterns), 'entries/patterns should exist');
      assert.ok(fs.existsSync(p.entriesArtifacts), 'entries/artifacts should exist');
      assert.ok(fs.existsSync(p.entriesTasks), 'entries/tasks should exist');
      assert.ok(fs.existsSync(p.entriesDecisions), 'entries/decisions should exist');
      assert.ok(fs.existsSync(p.bindings), 'bindings should exist');
      assert.ok(fs.existsSync(p.events), 'events should exist');
      assert.ok(fs.existsSync(p.cache), 'cache should exist');
      assert.ok(fs.existsSync(p.trash), 'trash should exist');
    });

    it('writes config, working set, wal, and active prompt', () => {
      store.initWorkspace('my-project');
      const p = getPaths(tmpDir);

      const configRaw = readTextFile(p.config);
      assert.ok(configRaw);
      assert.ok(configRaw.includes('my-project'));

      const wsRaw = readTextFile(p.workingSet);
      assert.ok(wsRaw);
      assert.ok(wsRaw.includes('active_task'));

      const walRaw = readTextFile(p.wal);
      assert.strictEqual(walRaw, '');

      const promptRaw = readTextFile(p.activePrompt);
      assert.ok(promptRaw);
      assert.ok(promptRaw.includes('loom_context'));
    });
  });

  describe('getConfig', () => {
    it('returns null before initialization', () => {
      assert.strictEqual(store.getConfig(), null);
    });

    it('returns the config after initialization', () => {
      store.initWorkspace('test-project');
      const config = store.getConfig();
      assert.ok(config);
      assert.strictEqual(config.project_name, 'test-project');
      assert.strictEqual(config.default_namespace, 'project');
      assert.ok(config.initialized_at);
    });
  });

  describe('Entry CRUD', () => {
    beforeEach(() => {
      store.initWorkspace('test');
    });

    it('saveEntry writes a YAML file without bindings', () => {
      const entry = makeRuleEntry('rule-1');
      store.saveEntry(entry);

      const p = getPaths(tmpDir);
      const filePath = path.join(p.entriesRules, 'rule-1.loom.yml');
      assert.ok(fs.existsSync(filePath));

      const raw = readTextFile(filePath)!;
      assert.ok(raw.includes('rule-1'));
      assert.ok(!raw.includes('bindings_out'));
      assert.ok(!raw.includes('bindings_in'));
    });

    it('getEntry returns the saved entry', () => {
      const entry = makeRuleEntry('rule-1');
      store.saveEntry(entry);

      const found = store.getEntry('rule-1');
      assert.ok(found);
      assert.strictEqual(found!.id, 'rule-1');
      assert.strictEqual(found!.type, 'Rule');
    });

    it('getEntry returns null for missing entry', () => {
      assert.strictEqual(store.getEntry('missing'), null);
    });

    it('listEntries returns all saved entries', () => {
      store.saveEntry(makeRuleEntry('rule-1'));
      store.saveEntry(makeRuleEntry('rule-2'));
      store.saveEntry(makeTaskEntry('task-1'));

      const entries = store.listEntries();
      assert.strictEqual(entries.length, 3);
      const ids = entries.map((e) => e.id).sort();
      assert.deepStrictEqual(ids, ['rule-1', 'rule-2', 'task-1']);
    });

    it('saveEntry updates an existing entry', () => {
      const entry = makeRuleEntry('rule-1');
      store.saveEntry(entry);

      const updated = { ...entry, content: { l1_5: 'updated', l2: 'updated', l3: 'updated' } };
      store.saveEntry(updated);

      const found = store.getEntry('rule-1');
      assert.ok(found);
      assert.strictEqual(found!.content.l1_5, 'updated');
    });

    it('saveEntry throws on invalid id with path separators', () => {
      const entry = makeRuleEntry('bad/id');
      assert.throws(() => store.saveEntry(entry), /Invalid entry id/);
    });

    it('saveEntry throws on unknown entry type', () => {
      const entry = { ...makeRuleEntry('x'), type: 'Unknown' as any };
      assert.throws(() => store.saveEntry(entry), /Unknown entry type/);
    });

    it('removeEntry deletes the file and moves entry to trash', () => {
      const entry = makeRuleEntry('rule-1');
      store.saveEntry(entry);

      store.removeEntry('rule-1');
      assert.strictEqual(store.getEntry('rule-1'), null);

      const trash = store.listTrash();
      assert.strictEqual(trash.length, 1);
      assert.strictEqual(trash[0].id, 'rule-1');
      assert.strictEqual(trash[0].type, 'Rule');
    });

    it('removeEntry is a no-op for missing entry', () => {
      store.removeEntry('missing');
      assert.strictEqual(store.listTrash().length, 0);
    });

    it('removeEntry removes associated bindings', () => {
      store.saveEntry(makeRuleEntry('rule-1'));
      store.saveEntry(makeRuleEntry('rule-2'));
      store.saveBinding(makeBinding('rule-1', 'rule-2'));

      store.removeEntry('rule-1');

      assert.strictEqual(store.listBindings().length, 0);
    });
  });

  describe('Binding CRUD', () => {
    beforeEach(() => {
      store.initWorkspace('test');
    });

    it('saveBinding writes a YAML file', () => {
      const binding = makeBinding('a', 'b');
      store.saveBinding(binding);

      const p = getPaths(tmpDir);
      const files = fs.readdirSync(p.bindings);
      assert.strictEqual(files.length, 1);
      assert.ok(files[0].startsWith('a→b'));
    });

    it('listBindings returns all bindings', () => {
      store.saveBinding(makeBinding('a', 'b'));
      store.saveBinding(makeBinding('c', 'd'));

      const bindings = store.listBindings();
      assert.strictEqual(bindings.length, 2);
    });

    it('removeBinding deletes the file', () => {
      store.saveBinding(makeBinding('a', 'b'));
      store.removeBinding('a', 'b');

      assert.strictEqual(store.listBindings().length, 0);
    });

    it('removeBinding is a no-op for missing binding', () => {
      store.removeBinding('x', 'y');
      assert.strictEqual(store.listBindings().length, 0);
    });

    it('bindings are hydrated on listEntries', () => {
      store.saveEntry(makeRuleEntry('rule-1'));
      store.saveEntry(makeRuleEntry('rule-2'));
      store.saveBinding(makeBinding('rule-1', 'rule-2'));

      const entries = store.listEntries();
      const r1 = entries.find((e) => e.id === 'rule-1');
      const r2 = entries.find((e) => e.id === 'rule-2');
      assert.ok(r1);
      assert.ok(r2);
      assert.strictEqual(r1!.bindings_out.length, 1);
      assert.strictEqual(r1!.bindings_out[0].target, 'rule-2');
      assert.strictEqual(r2!.bindings_in.length, 1);
      assert.strictEqual(r2!.bindings_in[0].source, 'rule-1');
    });
  });

  describe('WorkingSet', () => {
    beforeEach(() => {
      store.initWorkspace('test');
    });

    it('getWorkingSet returns default after init', () => {
      const ws = store.getWorkingSet();
      assert.strictEqual(ws.active_task, null);
      assert.deepStrictEqual(ws.pinned_entries, []);
      assert.deepStrictEqual(ws.hot_entries, []);
      assert.deepStrictEqual(ws.recently_expanded, []);
      assert.deepStrictEqual(ws.blocked_entries, []);
    });

    it('saveWorkingSet persists changes', () => {
      const ws: WorkingSet = {
        active_task: 'task-1',
        pinned_entries: ['rule-1'],
        hot_entries: ['rule-2'],
        recently_expanded: [],
        blocked_entries: [],
      };
      store.saveWorkingSet(ws);

      const found = store.getWorkingSet();
      assert.strictEqual(found.active_task, 'task-1');
      assert.deepStrictEqual(found.pinned_entries, ['rule-1']);
    });
  });

  describe('Cache version', () => {
    beforeEach(() => {
      store.initWorkspace('test');
    });

    it('readCacheVersion returns empty string initially', () => {
      const v = store.readCacheVersion();
      assert.ok(typeof v === 'string');
    });

    it('bumpCacheVersion changes the version', () => {
      const before = store.readCacheVersion();
      store.bumpCacheVersion();
      const after = store.readCacheVersion();
      assert.notStrictEqual(after, before);
      assert.ok(Number(after) > Number(before) || before === '');
    });
  });

  describe('Trash', () => {
    beforeEach(() => {
      store.initWorkspace('test');
    });

    it('listTrash returns empty array initially', () => {
      assert.deepStrictEqual(store.listTrash(), []);
    });

    it('restoreFromTrash brings entry back and clears trash', () => {
      const entry = makeRuleEntry('rule-1');
      store.saveEntry(entry);
      store.removeEntry('rule-1');

      assert.strictEqual(store.getEntry('rule-1'), null);
      assert.strictEqual(store.listTrash().length, 1);

      store.restoreFromTrash('rule-1');

      const restored = store.getEntry('rule-1');
      assert.ok(restored);
      assert.strictEqual(restored!.id, 'rule-1');
      assert.strictEqual(store.listTrash().length, 0);
    });

    it('restoreFromTrash is a no-op for missing id', () => {
      store.restoreFromTrash('missing');
      assert.strictEqual(store.listTrash().length, 0);
    });

    it('purgeTrash removes expired items', () => {
      const entry = makeRuleEntry('rule-1');
      store.saveEntry(entry);
      store.removeEntry('rule-1');

      // Create an explicitly expired trash file
      const p = getPaths(tmpDir);
      const expiredRaw = `id: old-rule\ntype: Rule\ndeletedAt: 2020-01-01T00:00:00.000Z\nexpiresAt: 2020-01-02T00:00:00.000Z\nentry: {}`;
      fs.writeFileSync(path.join(p.trash, 'old-rule.2020-01-01T00:00:00.000Z.trash.yml'), expiredRaw);

      store.purgeTrash(30);
      const items = store.listTrash();
      assert.strictEqual(items.every((i) => i.id !== 'old-rule'), true);
    });
  });

  describe('Active Prompt', () => {
    beforeEach(() => {
      store.initWorkspace('test');
    });

    it('readActivePrompt returns initial content after init', () => {
      const content = store.readActivePrompt();
      assert.ok(content.includes('loom_context'));
    });

    it('writeActivePrompt overwrites the file', () => {
      store.writeActivePrompt('<loom_context>\n  <custom>hello</custom>\n</loom_context>');
      const content = store.readActivePrompt();
      assert.ok(content.includes('hello'));
      assert.ok(!content.includes('No active task'));
    });
  });

  describe('Cache invalidation', () => {
    it('listEntries reflects external changes after cache bump', () => {
      store.initWorkspace('test');
      store.saveEntry(makeRuleEntry('rule-1'));

      // Populate cache
      const before = store.listEntries();
      assert.strictEqual(before.length, 1);

      // Simulate external change by directly writing to filesystem
      const p = getPaths(tmpDir);
      const filePath = path.join(p.entriesRules, 'rule-2.loom.yml');
      fs.writeFileSync(filePath, `id: rule-2\ntype: Rule\nversion: 1\nnamespace: project\ncontent:\n  l1_5: x\n  l2: x\n  l3: x\nlifecycle:\n  state: active\n  created: '2024-01-01T00:00:00.000Z'\n  updated: '2024-01-01T00:00:00.000Z'\n  last_accessed: '2024-01-01T00:00:00.000Z'\n  last_activated: '2024-01-01T00:00:00.000Z'\n  activation_count: 0\n  verification_count: 0\n  promoted_from: null\n  demotion_reason: null\nquality:\n  freshness: 1\n  trust: 1\n  activity: 1\n  composite_score: 1\ntrust:\n  level: trusted\n  source: human\nactivation:\n  paths: []\n  keywords: []\n  intents: []\n  tools: []\n  entry_refs: []\nconflicts:\n  supersedes: []\n  conflicts_with: []\n  overridden_by: null\n  precedence: 0\n  resolution_policy: newest_wins\n`);

      // Without bump, cache still returns 1
      const stillBefore = store.listEntries();
      assert.strictEqual(stillBefore.length, 1);

      // After bump, cache is invalidated
      store.bumpCacheVersion();
      const after = store.listEntries();
      assert.strictEqual(after.length, 2);
    });
  });
});
