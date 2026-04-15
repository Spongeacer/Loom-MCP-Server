import { getEntry, getWorkingSet, listBindings } from '../core/store.js';

export function runWhy(args: string[]): void {
  const id = args[0];
  if (!id) {
    console.log('Usage:.loom why <id>');
    return;
  }

  const entry = getEntry(id);
  if (!entry) {
    console.log(`Entry not found: ${id}`);
    return;
  }

  const ws = getWorkingSet();
  const reasons: string[] = [];

  if (ws.active_task === entry.id) {
    reasons.push('it is the current active task');
  }
  if (ws.pinned_entries.includes(entry.id)) {
    reasons.push('it is in the current working set (pinned)');
  }
  if (ws.hot_entries.includes(entry.id)) {
    reasons.push('it is a hot entry recently accessed');
  }

  const bindings = listBindings().filter((b) => b.source === entry.id || b.target === entry.id);
  const activeTask = ws.active_task ? getEntry(ws.active_task) : null;

  if (activeTask && activeTask.type === 'Task') {
    if (activeTask.task.working_set.includes(entry.id)) {
      reasons.push(`it is in the working set of active task ${activeTask.id}`);
    }
    if (activeTask.task.related_entries.includes(entry.id)) {
      reasons.push(`it is related to active task ${activeTask.id}`);
    }
    if (activeTask.bindings_out.some((b) => b.target === entry.id)) {
      reasons.push(`active task ${activeTask.id} has a binding to it`);
    }
  }

  for (const b of bindings) {
    if (b.status === 'active' && b.confidence > 0.5) {
      const other = b.source === entry.id ? b.target : b.source;
      reasons.push(`it has an active binding [${b.relationship}] with ${other} (conf=${b.confidence.toFixed(2)})`);
    }
  }

  if (entry.activation.paths.length > 0) {
    reasons.push(`its activation paths match current project files: ${entry.activation.paths.join(', ')}`);
  }

  if (reasons.length === 0) {
    reasons.push('it exists in the LOOM knowledge base but is not currently active or bound');
  }

  console.log(`Why ${entry.id} matters:`);
  for (const r of reasons) {
    console.log(`  - ${r}`);
  }
}
