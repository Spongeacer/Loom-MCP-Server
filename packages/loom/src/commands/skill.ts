import { listEntries, getEntry } from '../core/store.js';
import { saveExtractedSkill } from '../core/skill-extraction.js';
import type { SkillEntry } from '../types/index.js';

export function runSkill(args: string[]): string {
  if (args.length === 0 || args[0] === 'list') {
    const skills = listEntries().filter((e) => e.type === 'Skill') as SkillEntry[];
    const lines: string[] = [];
    lines.push(`=== Skills (${skills.length}) ===`);
    for (const s of skills) {
      lines.push(`- ${s.id}: ${s.content.l2} (v${s.version}, trust=${s.trust.level})`);
    }
    return lines.join('\n');
  }

  if (args[0] === 'extract' && args[1]) {
    const taskId = args[1];
    const task = getEntry(taskId);
    if (!task || task.type !== 'Task') {
      throw new Error(`Not a valid task: ${taskId}`);
    }
    const skillId = saveExtractedSkill(taskId);
    if (skillId) {
      return `Extracted skill: ${skillId} from task ${taskId}`;
    } else {
      throw new Error('Failed to extract skill.');
    }
  }

  return 'Usage:.loom skill [list | extract <task-id>]';
}
