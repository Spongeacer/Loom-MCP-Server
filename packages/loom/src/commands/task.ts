import { getWorkingSet, saveWorkingSet, listEntries, getEntry, saveEntry } from '../core/store.js';
import { appendWalAsync } from '../core/wal-queue.js';
import { updateUserProfileFromTask } from '../core/user-profile.js';
import type { TaskEntry } from '../types/index.js';

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
    content: {
      l1_5: title.slice(0, 30),
      l2: title,
      l3: title,
    },
    lifecycle: {
      state: 'active',
      created: now,
      updated: now,
      last_accessed: now,
      last_activated: now,
      activation_count: 1,
      verification_count: 0,
      promoted_from: null,
      demotion_reason: null,
    },
    quality: {
      freshness: 1,
      trust: 0.9,
      activity: 1,
      composite_score: 0.95,
    },
    trust: {
      level: 'verified',
      source: 'human',
    },
    activation: {
      paths: [],
      keywords: [],
      intents: [],
      tools: [],
      entry_refs: [],
    },
    conflicts: {
      supersedes: [],
      conflicts_with: [],
      overridden_by: null,
      precedence: 0,
      resolution_policy: 'newest_wins',
    },
    bindings_out: [],
    bindings_in: [],
    task: {
      title,
      status: 'active',
      intent,
      priority,
      working_set: [],
      related_entries: [],
      acceptance_criteria: [],
      unresolved_questions: [],
      progress: {
        completed: [],
        current: null,
        next: null,
        blocked_by: null,
      },
      started_in: now,
      last_touched: now,
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

export async function runTask(args: string[]): Promise<string> {
  const ws = getWorkingSet();
  const tasks = listEntries().filter((e) => e.type === 'Task') as TaskEntry[];

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
    const target = getEntry(targetId);
    if (!target || target.type !== 'Task') {
      throw new Error(`Not a valid task: ${targetId}`);
    }
    ws.active_task = targetId;
    ws.pinned_entries = [targetId];
    if (!ws.hot_entries.includes(targetId)) {
      ws.hot_entries.push(targetId);
    }
    saveWorkingSet(ws);
    await appendWalAsync({ type: 'task_set', id: targetId });
    return `Active task set to: ${targetId}`;
  }

  if (sub === 'create' && args[1]) {
    const title = args.slice(1).join(' ');
    const newTask = createTaskEntry(title);

    saveEntry(newTask);
    updateUserProfileFromTask(newTask);
    ws.active_task = newTask.id;
    ws.pinned_entries = [newTask.id];
    if (!ws.hot_entries.includes(newTask.id)) {
      ws.hot_entries.push(newTask.id);
    }
    saveWorkingSet(ws);
    await appendWalAsync({ type: 'task_create', id: newTask.id });
    return `Created and activated task: ${newTask.id}`;
  }

  throw new Error('Usage: .loom task [set <id> | create <title> | update <id> --current ...]');
}
