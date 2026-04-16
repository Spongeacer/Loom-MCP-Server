import { getEntry, appendWalAsync } from '../core/store.js';
import { buildExpandedPrompt } from '../core/prompt-builder.js';

export function runExpand(args: string[]): string {
  const id = args[0];
  if (!id) {
    throw new Error('Usage:.loom expand <id> [l2|l3]');
  }
  const level = (args[1] as 'l2' | 'l3') || 'l3';
  const entry = getEntry(id);
  if (!entry) {
    throw new Error(`Entry not found: ${id}`);
  }
  appendWalAsync({ type: 'expand', id, level }).catch(() => {});
  return buildExpandedPrompt(entry, level);
}
