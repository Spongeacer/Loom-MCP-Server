import type { StoreAdapter } from '../store/adapter.js';
import { generateDiary } from '../diary-generator.js';

export interface DiaryResult {
  memoryId: string;
  l2: string;
  l3: string;
  saved: boolean;
}

export function runDiary(store: StoreAdapter, taskId: string, save: boolean): DiaryResult {
  const { memoryId, l2, l3 } = generateDiary(taskId, store, save);
  return { memoryId, l2, l3, saved: save };
}
