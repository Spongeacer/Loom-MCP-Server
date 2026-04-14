import { listEntries, getEntry } from '../core/store.js';
import { saveExtractedSkill } from '../core/skill-extraction.js';
import type { SkillEntry, TaskEntry } from '../types/index.js';

export function runSkill(args: string[]): void {
  if (args.length === 0 || args[0] === 'list') {
    const skills = listEntries().filter((e) => e.type === 'Skill') as SkillEntry[];
    console.log(`=== Skills (${skills.length}) ===`);
    for (const s of skills) {
      console.log(`- ${s.id}: ${s.content.l2} (v${s.version}, trust=${s.trust.level})`);
    }
    return;
  }

  if (args[0] === 'extract' && args[1]) {
    const taskId = args[1];
    const task = getEntry(taskId);
    if (!task || task.type !== 'Task') {
      console.log(`Not a valid task: ${taskId}`);
      return;
    }
    const skillId = saveExtractedSkill(taskId);
    if (skillId) {
      console.log(`Extracted skill: ${skillId} from task ${taskId}`);
    } else {
      console.log('Failed to extract skill.');
    }
    return;
  }

  console.log('Usage:.loom skill [list | extract <task-id>]');
}
