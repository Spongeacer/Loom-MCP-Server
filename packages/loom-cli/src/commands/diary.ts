import type { StoreAdapter } from '@loom/core';
import { runDiary } from '@loom/core';

export function runDiaryCommand(args: string[], store: StoreAdapter): string {
  const save = args.includes('--save');
  const positional = args.filter((a) => !a.startsWith('--'));

  let taskId = positional[0];
  if (!taskId) {
    const ws = store.getWorkingSet();
    if (ws.active_task) {
      taskId = ws.active_task;
    } else {
      throw new Error('Usage: loom diary [task-id] [--save]\nNo active task found. Please provide a task ID or set an active task first.');
    }
  }

  const { memoryId, l2, l3, saved } = runDiary(store, taskId, save);
  const lines: string[] = [];
  if (saved) {
    lines.push(`Diary saved: ${memoryId}`);
    lines.push('---');
  } else {
    lines.push('=== Preview (not saved) ===');
  }
  lines.push(`l2: ${l2}`);
  lines.push('');
  lines.push(l3);
  return lines.join('\n');
}
