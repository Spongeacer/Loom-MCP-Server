import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { generateDiary } from '../core/diary-generator.js';
import { initWorkspace, saveEntry, getEntry, saveWorkingSet } from '../core/store.js';
import { drainWalAsync } from '../core/wal-queue.js';
import type { TaskEntry } from '../types/index.js';

describe('diary-generator', () => {
  let tmpDir: string;
  let originalCwd: string;
  let originalFetch: typeof fetch;

  before(() => {
    originalCwd = process.cwd();
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'loom-diary-'));
    process.chdir(tmpDir);
    initWorkspace('test', tmpDir);
    originalFetch = global.fetch;
    process.env.KIMI_API_KEY = 'test-key';
  });

  after(async () => {
    global.fetch = originalFetch;
    delete process.env.KIMI_API_KEY;
    await drainWalAsync();
    process.chdir(originalCwd);
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function createTask(id: string): TaskEntry {
    const now = new Date().toISOString();
    return {
      id,
      type: 'Task',
      version: 1,
      namespace: 'project',
      content: { l1_5: 'Test task', l2: 'Test task', l3: 'Test task l3' },
      lifecycle: { state: 'active', created: now, updated: now, last_accessed: now, last_activated: now, activation_count: 1, verification_count: 0, promoted_from: null, demotion_reason: null },
      quality: { freshness: 1, trust: 0.9, activity: 1, composite_score: 0.95 },
      trust: { level: 'verified', source: 'human' },
      activation: { paths: [], keywords: [], intents: [], tools: [], entry_refs: [] },
      conflicts: { supersedes: [], conflicts_with: [], overridden_by: null, precedence: 0, resolution_policy: 'newest_wins' },
      bindings_out: [],
      bindings_in: [],
      task: {
        title: 'Test task',
        status: 'active',
        intent: 'feature',
        priority: 'high',
        working_set: [],
        related_entries: [],
        acceptance_criteria: [],
        unresolved_questions: [],
        progress: { completed: ['step 1'], current: 'step 2', next: 'step 3', blocked_by: null },
        started_in: now,
        last_touched: now,
      },
    };
  }

  it('returns preview without saving when save=false', async () => {
    const task = createTask('task-diary-preview');
    saveEntry(task, tmpDir);

    global.fetch = async () =>
      new Response(
        JSON.stringify({
          choices: [{ message: { content: '{"l2": "Today we finished step 1.", "l3": "## Diary\\n- step 1 done"}' } }],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      ) as unknown as Response;

    const result = await generateDiary('task-diary-preview', tmpDir, false);
    assert.strictEqual(result.memoryId.startsWith('diary-'), true);
    assert.strictEqual(result.l2, 'Today we finished step 1.');
    assert.strictEqual(result.l3, '## Diary\n- step 1 done');

    const mem = getEntry(result.memoryId, tmpDir);
    assert.strictEqual(mem, null);
  });

  it('saves Memory entry and binding when save=true', async () => {
    const task = createTask('task-diary-save');
    saveEntry(task, tmpDir);

    global.fetch = async () =>
      new Response(
        JSON.stringify({
          choices: [{ message: { content: '```json\n{"l2": "Good progress.", "l3": "## Diary\\n- good"}\n```' } }],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      ) as unknown as Response;

    const result = await generateDiary('task-diary-save', tmpDir, true);
    assert.strictEqual(result.l2, 'Good progress.');
    assert.strictEqual(result.l3, '## Diary\n- good');

    const mem = getEntry(result.memoryId, tmpDir);
    assert(mem);
    assert.strictEqual(mem?.type, 'Memory');
    assert.strictEqual(mem?.content.l2, 'Good progress.');

    // Verify binding file exists
    const bindingFile = fs.readdirSync(path.join(tmpDir, '.loom', 'bindings')).find((f) => f.includes(result.memoryId));
    assert(bindingFile);
  });

  it('throws when no LLM API key is set', async () => {
    const task = createTask('task-diary-nokey');
    saveEntry(task, tmpDir);

    delete process.env.KIMI_API_KEY;
    global.fetch = originalFetch;
    await assert.rejects(async () => {
      await generateDiary('task-diary-nokey', tmpDir, false);
    }, /No LLM API key found/);
    process.env.KIMI_API_KEY = 'test-key';
  });

  it('CLI runDiary uses active task when no id given', async () => {
    const task = createTask('task-diary-active');
    saveEntry(task, tmpDir);
    saveWorkingSet({ active_task: 'task-diary-active', pinned_entries: [], hot_entries: [], recently_expanded: [], blocked_entries: [] }, tmpDir);

    global.fetch = async () =>
      new Response(
        JSON.stringify({
          choices: [{ message: { content: '{"l2": "Active task diary.", "l3": "## Diary"}' } }],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      ) as unknown as Response;

    const { runDiary } = await import('../commands/diary.js');
    const output = await runDiary([]);
    assert(output.includes('Preview'));
    assert(output.includes('Active task diary.'));
  });
});
