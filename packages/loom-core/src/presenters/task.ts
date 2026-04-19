import type { TaskEntry } from '../types/index.js';

export function formatTaskList(tasks: TaskEntry[], activeTaskId: string | null): string {
  const lines: string[] = [];
  lines.push('=== Active Task ===');
  lines.push(activeTaskId || '(none)');
  lines.push('\n=== All Tasks ===');
  for (const t of tasks) {
    const marker = t.id === activeTaskId ? '* ' : '  ';
    lines.push(`${marker}[${t.task.status}] ${t.id}: ${t.task.title}`);
  }
  return lines.join('\n');
}
