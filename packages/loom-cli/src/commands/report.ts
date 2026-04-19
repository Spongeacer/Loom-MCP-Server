import type { StoreAdapter } from '@spongeacer/loom-core';
import {
  runDoctor,
  formatDoctorReport,
  runSession,
  runSkillList,
  runSkillExtract,
  formatSkillList,
} from '@spongeacer/loom-core';

export function runDoctorCommand(_: string[], store: StoreAdapter): string {
  const report = runDoctor(store);
  return formatDoctorReport(report);
}

export function runSessionCommand(args: string[], _store: StoreAdapter): string {
  const sub = (args[0] as 'summary' | 'recent') || 'summary';
  if (sub === 'recent') {
    const limit = parseInt(args[1] || '20', 10);
    const filterType = args[2] || undefined;
    const result = runSession('recent', { limit, filterType });
    return result.content;
  }
  const hours = parseInt(args[1] || '24', 10);
  const result = runSession('summary', { hours });
  return result.content;
}

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
