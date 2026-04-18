import type { StoreAdapter } from '@loom/core';
import { buildSlotPrompt } from '@loom/core';

export async function runStatus(store: StoreAdapter): Promise<string> {
  if (!store.isInitialized()) {
    return 'LOOM not initialized. Run: loom init <project-name>';
  }
  const prompt = buildSlotPrompt(store);
  store.writeActivePrompt(prompt);
  return prompt;
}
