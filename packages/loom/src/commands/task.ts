import { getWorkingSet, saveWorkingSet, listEntries, appendWal, getEntry } from '../core/store.js';
import type { TaskEntry } from '../types/index.js';

export async function runTask(args: string[]): Promise<void> {
  const ws = getWorkingSet();
  const tasks = listEntries().filter((e) => e.type === 'Task') as TaskEntry[];

  if (args.length === 0) {
    console.log('=== Active Task ===');
    console.log(ws.active_task || '(none)');
    console.log('\n=== All Tasks ===');
    for (const t of tasks) {
      const marker = t.id === ws.active_task ? '* ' : '  ';
      console.log(`${marker}[${t.task.status}] ${t.id}: ${t.task.title}`);
    }
    return;
  }

  const sub = args[0];

  if (sub === 'set' && args[1]) {
    const targetId = args[1];
    const target = getEntry(targetId);
    if (!target || target.type !== 'Task') {
      console.log(`Not a valid task: ${targetId}`);
      return;
    }
    ws.active_task = targetId;
    ws.pinned_entries = [targetId];
    if (!ws.hot_entries.includes(targetId)) {
      ws.hot_entries.push(targetId);
    }
    saveWorkingSet(ws);
    appendWal({ type: 'task_set', id: targetId });
    console.log(`Active task set to: ${targetId}`);
    return;
  }

  if (sub === 'create' && args[1]) {
    const title = args.slice(1).join(' ');
    const id = `task-${title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
    const now = new Date().toISOString();
    const newTask: TaskEntry = {
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
        intent: 'feature',
        priority: 'medium',
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

    const { saveEntry } = await import('../core/store.js');
    const { updateUserProfileFromTask } = await import('../core/user-profile.js');
    saveEntry(newTask);
    updateUserProfileFromTask(newTask);
    ws.active_task = id;
    ws.pinned_entries = [id];
    if (!ws.hot_entries.includes(id)) {
      ws.hot_entries.push(id);
    }
    saveWorkingSet(ws);
    appendWal({ type: 'task_create', id });
    console.log(`Created and activated task: ${id}`);
    return;
  }

  console.log('Usage:.loom task [set <id> | create <title>]');
}
