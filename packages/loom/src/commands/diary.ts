import { getWorkingSet } from '../core/store.js';
import { generateDiary } from '../core/diary-generator.js';

export async function runDiary(args: string[]): Promise<void> {
  const projectRoot = process.cwd();
  const save = args.includes('--save');
  const positional = args.filter((a) => !a.startsWith('--'));

  let taskId = positional[0];
  if (!taskId) {
    const ws = getWorkingSet(projectRoot);
    if (ws.active_task) {
      taskId = ws.active_task;
    } else {
      console.log('Usage: loom diary [task-id] [--save]');
      console.log('No active task found. Please provide a task ID or set an active task first.');
      return;
    }
  }

  try {
    const { memoryId, l2, l3 } = await generateDiary(taskId, projectRoot, save);
    if (save) {
      console.log(`Diary saved: ${memoryId}`);
      console.log('---');
    } else {
      console.log('=== Preview (not saved) ===');
    }
    console.log(`l2: ${l2}`);
    console.log('');
    console.log(l3);
  } catch (err) {
    console.error('[LOOM] Failed to generate diary:', (err as Error).message);
    process.exitCode = 1;
  }
}
