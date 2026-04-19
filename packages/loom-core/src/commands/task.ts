import { randomUUID } from 'node:crypto';
import type { TaskEntry } from '../types/index.js';

function makeTaskSlug(title: string): string {
  // Keep ASCII alphanumerics; for non-ASCII (e.g. CJK), use a short hash segment
  const asciiSlug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  if (asciiSlug.length >= 4) {
    return asciiSlug;
  }
  // Title is mostly non-ASCII; generate a readable hash
  const hash = randomUUID().slice(0, 8);
  return asciiSlug ? `${asciiSlug}-${hash}` : hash;
}

export function createTaskEntry(
  title: string,
  intent: TaskEntry['task']['intent'] = 'feature',
  priority: TaskEntry['task']['priority'] = 'medium'
): TaskEntry {
  const slug = makeTaskSlug(title);
  const id = `task-${slug}-${randomUUID().slice(0, 8)}`;
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
