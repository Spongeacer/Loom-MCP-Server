import type { StoreAdapter } from '@spongeacer/loom-core';
import { runSkillList, runSkillExtract, formatSkillList } from '@spongeacer/loom-core';

export function runSkillCommand(args: string[], store: StoreAdapter): string {
  if (args.length === 0 || args[0] === 'list') {
    return formatSkillList(runSkillList(store));
  }

  if (args[0] === 'extract' && args[1]) {
    const { skillId, taskId } = runSkillExtract(store, args[1]);
    return `Extracted skill: ${skillId} from task ${taskId}`;
  }

  return 'Usage: loom skill [list | extract <task-id>]';
}
