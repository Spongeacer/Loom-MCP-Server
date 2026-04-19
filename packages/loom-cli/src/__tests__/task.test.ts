import { describe, it } from 'node:test';
import assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { MemoryStoreAdapter, createTaskEntry, updateTaskEntry } from '@spongeacer/loom-core';
import { runTask } from '../commands/task.js';
import type { TaskEntry } from '@spongeacer/loom-core';

describe('task commands', () => {
  it('createTaskEntry generates correct structure', () => {
    const task = createTaskEntry('Test feature', 'feature', 'high');
    assert.strictEqual(task.type, 'Task');
    assert.strictEqual(task.task.title, 'Test feature');
    assert.strictEqual(task.task.intent, 'feature');
    assert.strictEqual(task.task.priority, 'high');
    assert.ok(task.id.startsWith('task-'));
  });

  it('updateTaskEntry updates fields', () => {
    const task = createTaskEntry('Original');
    updateTaskEntry(task, { title: 'Updated', status: 'done', current: 'step 1' });
    assert.strictEqual(task.task.title, 'Updated');
    assert.strictEqual(task.task.status, 'done');
    assert.strictEqual(task.task.progress.current, 'step 1');
  });

  it('runTask lists tasks', async () => {
    const store = new MemoryStoreAdapter();
    store.initWorkspace('test');
    store.saveEntry(createTaskEntry('Task A'));
    store.saveEntry(createTaskEntry('Task B'));
    const output = await runTask([], store);
    assert.ok(output.includes('Task A'));
    assert.ok(output.includes('Task B'));
  });

  it('runTask sets active task', async () => {
    // Ensure WAL directory exists for appendWalAsync
    fs.mkdirSync(path.join(process.cwd(), '.loom', 'events'), { recursive: true });
    const store = new MemoryStoreAdapter();
    store.initWorkspace('test');
    const task = createTaskEntry('Active Task');
    store.saveEntry(task);
    const output = await runTask(['set', task.id], store);
    assert.ok(output.includes('Active task set to'));
    const ws = store.getWorkingSet();
    assert.strictEqual(ws.active_task, task.id);
  });
});
