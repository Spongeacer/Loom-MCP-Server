import type { StoreAdapter } from '@spongeacer/loom-core';
import { buildSlotPrompt } from '@spongeacer/loom-core';

export async function runStatus(store: StoreAdapter): Promise<string> {
  if (!store.isInitialized()) {
    return 'LOOM not initialized. Run: loom init <project-name>';
  }
  const prompt = buildSlotPrompt(store);
  store.writeActivePrompt(prompt);
  return prompt;
}
