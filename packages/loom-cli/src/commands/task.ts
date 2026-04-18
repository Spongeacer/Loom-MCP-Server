import type { StoreAdapter } from '@spongeacer/loom-core';
import { appendWalAsync } from '@spongeacer/loom-core';
import type { TaskEntry } from '@spongeacer/loom-core';

export function createTaskEntry(
  title: string,
  intent: TaskEntry['task']['intent'] = 'feature',
  priority: TaskEntry['task']['priority'] = 'medium'
): TaskEntry {
  const id = `task-${title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
  const now = new Date().toISOString();
  return {
    id,
    type: 'Task',
    version: 1,
    namespace: 'project',
    content: { l1_5: title.slice(0, 30), l2: title, l3: title },
    lifecycle: {
      state: 'active', created: now, updated: now, last_accessed: now, last_activated: now,
      activation_count: 1, verification_count: 0, promoted_from: null, demotion_reason: null,
    },
    quality: { freshness: 1, trust: 0.9, activity: 1, composite_score: 0.95 },
    trust: { level: 'verified', source: 'human' },
    activation: { paths: [], keywords: [], intents: [], tools: [], entry_refs: [] },
    conflicts: { supersedes: [], conflicts_with: [], overridden_by: null, precedence: 0, resolution_policy: 'newest_wins' },
    bindings_out: [],
    bindings_in: [],
    task: {
      title, status: 'active', intent, priority,
      working_set: [], related_entries: [], acceptance_criteria: [], unresolved_questions: [],
      progress: { completed: [], current: null, next: null, blocked_by: null },
      started_in: now, last_touched: now,
    },
  };
}

export function updateTaskEntry(
  task: TaskEntry,
  updates: Partial<{
    title: string | null | undefined;
    status: TaskEntry['task']['status'] | null | undefined;
    intent: TaskEntry['task']['intent'] | null | undefined;
    priority: TaskEntry['task']['priority'] | null | undefined;
    current: string | null | undefined;
    next: string | null | undefined;
    blocked_by: string | null | undefined;
    completed: string[] | null | undefined;
    acceptance_criteria: string[] | null | undefined;
    unresolved_questions: string[] | null | undefined;
  }>
): TaskEntry {
  const now = new Date().toISOString();
  if (updates.title != null) {
    task.content.l1_5 = updates.title.slice(0, 30);
    task.content.l2 = updates.title;
    task.content.l3 = updates.title;
    task.task.title = updates.title;
  }
  if (updates.status != null) task.task.status = updates.status;
  if (updates.intent != null) task.task.intent = updates.intent;
  if (updates.priority != null) task.task.priority = updates.priority;
  if (updates.current !== undefined) task.task.progress.current = updates.current;
  if (updates.next !== undefined) task.task.progress.next = updates.next;
  if (updates.blocked_by !== undefined) task.task.progress.blocked_by = updates.blocked_by;
  if (updates.completed != null) task.task.progress.completed = updates.completed;
  if (updates.acceptance_criteria != null) task.task.acceptance_criteria = updates.acceptance_criteria;
  if (updates.unresolved_questions != null) task.task.unresolved_questions = updates.unresolved_questions;
  task.lifecycle.updated = now;
  task.task.last_touched = now;
  return task;
}

export async function runTask(args: string[], store: StoreAdapter): Promise<string> {
  const ws = store.getWorkingSet();
  const tasks = store.listEntries().filter((e) => e.type === 'Task') as TaskEntry[];

  if (args.length === 0) {
    const lines: string[] = [];
    lines.push('=== Active Task ===');
    lines.push(ws.active_task || '(none)');
    lines.push('\n=== All Tasks ===');
    for (const t of tasks) {
      const marker = t.id === ws.active_task ? '* ' : '  ';
      lines.push(`${marker}[${t.task.status}] ${t.id}: ${t.task.title}`);
    }
    return lines.join('\n');
  }

  const sub = args[0];

  if (sub === 'set' && args[1]) {
    const targetId = args[1];
    const target = store.getEntry(targetId);
    if (!target || target.type !== 'Task') {
      throw new Error(`Not a valid task: ${targetId}`);
    }
    ws.active_task = targetId;
    ws.pinned_entries = [targetId];
    if (!ws.hot_entries.includes(targetId)) {
      ws.hot_entries.push(targetId);
    }
    store.saveWorkingSet(ws);
    await appendWalAsync({ type: 'task_set', id: targetId });
    return `Active task set to: ${targetId}`;
  }

  if (sub === 'create' && args[1]) {
    const title = args.slice(1).join(' ');
    const newTask = createTaskEntry(title);
    store.saveEntry(newTask);
    ws.active_task = newTask.id;
    ws.pinned_entries = [newTask.id];
    if (!ws.hot_entries.includes(newTask.id)) {
      ws.hot_entries.push(newTask.id);
    }
    store.saveWorkingSet(ws);
    await appendWalAsync({ type: 'task_create', id: newTask.id });
    return `Created and activated task: ${newTask.id}`;
  }

  if (sub === 'update' && args[1]) {
    const targetId = args[1];
    const target = store.getEntry(targetId);
    if (!target || target.type !== 'Task') {
      throw new Error(`Not a valid task: ${targetId}`);
    }
    const updates: Record<string, string | string[] | null> = {};
    let key: string | null = null;
    for (let i = 2; i < args.length; i++) {
      const arg = args[i];
      if (arg.startsWith('--')) {
        key = arg.slice(2);
        updates[key] = '';
      } else if (key) {
        updates[key] = arg;
        key = null;
      }
    }
    const typedUpdates: Parameters<typeof updateTaskEntry>[1] = {};
    if (updates.title !== undefined) typedUpdates.title = updates.title as string;
    if (updates.status !== undefined) typedUpdates.status = updates.status as any;
    if (updates.intent !== undefined) typedUpdates.intent = updates.intent as any;
    if (updates.priority !== undefined) typedUpdates.priority = updates.priority as any;
    if (updates.current !== undefined) typedUpdates.current = updates.current as string || null;
    if (updates.next !== undefined) typedUpdates.next = updates.next as string || null;
    if (updates.blocked_by !== undefined) typedUpdates.blocked_by = updates.blocked_by as string || null;
    if (updates.completed !== undefined) typedUpdates.completed = (updates.completed as string).split(',').filter(Boolean);
    if (updates.acceptance_criteria !== undefined) typedUpdates.acceptance_criteria = (updates.acceptance_criteria as string).split(',').filter(Boolean);
    if (updates.unresolved_questions !== undefined) typedUpdates.unresolved_questions = (updates.unresolved_questions as string).split(',').filter(Boolean);
    updateTaskEntry(target, typedUpdates);
    store.saveEntry(target);
    return `Updated task: ${targetId}`;
  }

  throw new Error('Usage: loom task [set <id> | create <title> | update <id> --current ...]');
}
