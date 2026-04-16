import { getWorkingSet } from '../core/store.js';
import { generateDiary } from '../core/diary-generator.js';

export async function runDiary(args: string[]): Promise<string> {
  const projectRoot = process.cwd();
  const save = args.includes('--save');
  const positional = args.filter((a) => !a.startsWith('--'));

  let taskId = positional[0];
  if (!taskId) {
    const ws = getWorkingSet(projectRoot);
    if (ws.active_task) {
      taskId = ws.active_task;
    } else {
      throw new Error('Usage: loom diary [task-id] [--save]\nNo active task found. Please provide a task ID or set an active task first.');
    }
  }

  const { memoryId, l2, l3 } = await generateDiary(taskId, projectRoot, save);
  const lines: string[] = [];
  if (save) {
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
