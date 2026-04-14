import { getEntry, appendWal } from '../core/store.js';
import { buildExpandedPrompt } from '../core/prompt-builder.js';

export function runExpand(args: string[]): void {
  const id = args[0];
  if (!id) {
    console.log('Usage:.loom expand <id> [l2|l3]');
    return;
  }
  const level = (args[1] as 'l2' | 'l3') || 'l3';
  const entry = getEntry(id);
  if (!entry) {
    console.log(`Entry not found: ${id}`);
    return;
  }
  appendWal({ type: 'expand', id, level });
  console.log(buildExpandedPrompt(entry, level));
}
