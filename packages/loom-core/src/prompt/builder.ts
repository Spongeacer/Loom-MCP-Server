import type { StoreAdapter } from '../store/adapter.js';
import { LOOM_VERSION } from '../constants.js';

export interface BuildOptions {
  includeDevMode?: boolean;
}

export function buildSlotPrompt(adapter: StoreAdapter, _options?: BuildOptions): string {
  const ws = adapter.getWorkingSet();
  const entries = adapter.listEntries();
  const config = adapter.getConfig();

  let prompt = '<loom_context>\n';

  // Protocol (static)
  prompt += `  <protocol>LOOM v${LOOM_VERSION}</protocol>\n`;

  // Project info
  if (config) {
    prompt += `  <project>${config.project_name}</project>\n`;
  }

  // Active task
  if (ws.active_task) {
    const task = entries.find((e) => e.id === ws.active_task && e.type === 'Task');
    if (task) {
      prompt += `  <task id="${task.id}">${task.content.l1_5}</task>\n`;
    }
  }

  // Working set
  const hotIds = [...ws.pinned_entries, ...ws.hot_entries].slice(0, 20);
  if (hotIds.length) {
    prompt += '  <working_set>\n';
    for (const id of hotIds) {
      const entry = entries.find((e) => e.id === id);
      if (entry) {
        prompt += `    <entry id="${entry.id}" type="${entry.type}">${entry.content.l1_5}</entry>\n`;
      }
    }
    prompt += '  </working_set>\n';
  }

  prompt += '</loom_context>';
  return prompt;
}
