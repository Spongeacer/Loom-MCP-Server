import type { SkillListResult } from '../commands/skill.js';

export function formatSkillList(result: SkillListResult): string {
  const lines: string[] = [`=== Skills (${result.skills.length}) ===`];
  for (const s of result.skills) {
    lines.push(`- ${s.id}: ${s.title} (v${s.version}, trust=${s.trust})`);
  }
  return lines.join('\n');
}
