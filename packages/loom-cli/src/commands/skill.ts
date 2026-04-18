import type { StoreAdapter } from '@spongeacer/loom-core';
import { runSkillList, runSkillExtract } from '@spongeacer/loom-core';

export function runSkillCommand(args: string[], store: StoreAdapter): string {
  if (args.length === 0 || args[0] === 'list') {
    const result = runSkillList(store);
    const lines: string[] = [`=== Skills (${result.skills.length}) ===`];
    for (const s of result.skills) {
      lines.push(`- ${s.id}: ${s.title} (v${s.version}, trust=${s.trust})`);
    }
    return lines.join('\n');
  }

  if (args[0] === 'extract' && args[1]) {
    const { skillId, taskId } = runSkillExtract(store, args[1]);
    return `Extracted skill: ${skillId} from task ${taskId}`;
  }

  return 'Usage: loom skill [list | extract <task-id>]';
}
