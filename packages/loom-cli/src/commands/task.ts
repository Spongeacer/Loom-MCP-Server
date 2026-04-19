import type { StoreAdapter, TaskEntry } from '@spongeacer/loom-core';
import { appendWalAsync, createTaskEntry, updateTaskEntry, formatTaskList } from '@spongeacer/loom-core';

export async function runTask(args: string[], store: StoreAdapter): Promise<string> {
  const ws = store.getWorkingSet();
  const tasks = store.listEntries().filter((e) => e.type === 'Task') as TaskEntry[];

  if (args.length === 0) {
    return formatTaskList(tasks, ws.active_task);
  }

  const sub = args[0];

  if (sub === 'set' && args[1]) {
    const targetId = args[1];
    const target = store.getEntry(targetId);
    if (!target || target.type !== 'Task') {
      throw new Error(`Not a valid task: ${targetId}`);
    }
    ws.active_task = targetId;
    if (!ws.pinned_entries.includes(targetId)) {
      ws.pinned_entries.unshift(targetId);
    }
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
    if (!ws.pinned_entries.includes(newTask.id)) {
      ws.pinned_entries.unshift(newTask.id);
    }
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
