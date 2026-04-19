import type { StoreAdapter } from '@spongeacer/loom-core';
import { runDiary, formatDiary } from '@spongeacer/loom-core';

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

  return formatDiary(runDiary(store, taskId, save));
}
