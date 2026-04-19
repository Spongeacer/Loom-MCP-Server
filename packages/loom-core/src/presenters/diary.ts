import type { DiaryResult } from '../commands/diary.js';

export function formatDiary(input: DiaryResult): string {
  const lines: string[] = [];
  if (input.saved) {
    lines.push(`Diary saved: ${input.memoryId}`);
    lines.push('---');
  } else {
    lines.push('=== Preview (not saved) ===');
  }
  lines.push(`l2: ${input.l2}`);
  lines.push('');
  lines.push(input.l3);
  return lines.join('\n');
}
