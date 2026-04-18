import type { StoreAdapter } from '../store/adapter.js';
import type { SkillEntry } from '../types/index.js';
import { saveExtractedSkill } from '../skill-extraction.js';

export interface SkillListResult {
  skills: { id: string; title: string; version: number; trust: string }[];
}

export interface SkillExtractResult {
  skillId: string;
  taskId: string;
}

export function runSkillList(store: StoreAdapter): SkillListResult {
  const skills = store.listEntries().filter((e) => e.type === 'Skill') as SkillEntry[];
  return {
    skills: skills.map((s) => ({
      id: s.id,
      title: s.content.l2,
      version: s.version,
      trust: s.trust.level,
    })),
  };
}

export function runSkillExtract(store: StoreAdapter, taskId: string): SkillExtractResult {
  const task = store.getEntry(taskId);
  if (!task || task.type !== 'Task') {
    throw new Error(`Not a valid task: ${taskId}`);
  }
  const skillId = saveExtractedSkill(taskId, store);
  if (!skillId) {
    throw new Error('Failed to extract skill.');
  }
  return { skillId, taskId };
}
