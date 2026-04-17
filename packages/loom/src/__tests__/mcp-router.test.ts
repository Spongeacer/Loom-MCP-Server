import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { dispatch, getVisibleTools } from '../mcp-router.js';
import { initWorkspace } from '../core/store.js';
import { drainWalAsync } from '../core/wal-queue.js';

describe('mcp-router', () => {
  let tmpDir: string;
  let originalCwd: string;

  before(() => {
    originalCwd = process.cwd();
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'loom-router-'));
    process.chdir(tmpDir);
    initWorkspace('test', tmpDir);
  });

  after(async () => {
    await drainWalAsync();
    process.chdir(originalCwd);
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('dispatch returns error for unknown tool', async () => {
    const result = await dispatch('non_existent_tool', {});
    assert.strictEqual(result.isError, true);
    assert(result.content[0].text.includes('Unknown tool'));
  });

  it('loom_ping returns pong with basic info', async () => {
    const result = await dispatch('loom_ping', {});
    assert.strictEqual(result.isError, undefined);
    assert(result.content[0].text.startsWith('pong'));
  });

  it('loom_doctor returns diagnostic lines', async () => {
    const result = await dispatch('loom_doctor', {});
    assert(!result.isError);
    assert(result.content[0].text.includes('['));
  });

  it('loom_expand rejects missing id', async () => {
    const result = await dispatch('loom_expand', {});
    assert.strictEqual(result.isError, true);
    assert(result.content[0].text.includes('Invalid or missing'));
  });

  it('loom_task_create rejects missing title', async () => {
    const result = await dispatch('loom_task_create', {});
    assert.strictEqual(result.isError, true);
    assert(result.content[0].text.includes('title'));
  });

  it('loom_record_decision rejects missing fields', async () => {
    const result = await dispatch('loom_record_decision', { question: 'Q?' });
    assert.strictEqual(result.isError, true);
    assert(result.content[0].text.includes('Missing or invalid required fields'));
  });

  it('loom_fs_deps rejects missing path', async () => {
    const result = await dispatch('loom_fs_deps', {});
    assert.strictEqual(result.isError, true);
    assert(result.content[0].text.includes('path'));
  });

  it('loom_watch_start handles default dirs', async () => {
    fs.mkdirSync(path.join(tmpDir, 'packages', 'loom', 'dist', 'core'), { recursive: true });
    fs.writeFileSync(path.join(tmpDir, 'packages', 'loom', 'dist', 'core', 'watch-daemon-runner.js'), '');
    const result = await dispatch('loom_watch_start', {});
    assert(result.content[0].text.includes('started') || result.content[0].text.includes('already running'));
  });

  it('loom_watch_start filters dangerous chars', async () => {
    const result = await dispatch('loom_watch_start', { dirs: ['src', 'foo;bar'] });
    assert(!result.content[0].text.includes('foo;bar'));
  });

  it('getVisibleTools returns full set when initialized', () => {
    const tools = getVisibleTools();
    const names = tools.map(t => t.name);
    assert(names.includes('loom_ping'));
    assert(names.includes('loom_task_create'));
  });

  it('loom_task_update updates task fields', async () => {
    // Create a task first
    const createResult = await dispatch('loom_task_create', { title: 'Test update' });
    assert(!createResult.isError);
    const taskId = (createResult.content[0].text as string).replace('Created and activated task: ', '');

    const updateResult = await dispatch('loom_task_update', {
      id: taskId,
      status: 'blocked',
      priority: 'high',
      current: 'Step 1',
      next: 'Step 2',
    });
    assert(!updateResult.isError);
    assert(updateResult.content[0].text.includes('Updated task'));
  });

  it('loom_task_update rejects invalid task id', async () => {
    const result = await dispatch('loom_task_update', { id: 'non-existent-task', status: 'blocked' });
    assert.strictEqual(result.isError, true);
    assert(result.content[0].text.includes('Not a valid task'));
  });

  it('loom_fs_clean dry_run returns without modifying files', async () => {
    const result = await dispatch('loom_fs_clean', { dry_run: true });
    assert(!result.isError);
    assert(result.content[0].text.includes('[DRY RUN]'));
  });
});
