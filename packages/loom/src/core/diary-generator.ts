import * as fs from 'node:fs';
import * as path from 'node:path';
import YAML from 'yaml';
import { getEntry, saveEntry, invalidateCache } from './store.js';
import { getPaths } from './paths.js';
import { readWalEvents } from './session-recall.js';
import { appendWalAsync } from './wal-queue.js';
import { callLlm } from './llm-client.js';
import type { TaskEntry, MemoryEntry, Binding } from '../types/index.js';

function todayStr(): string {
  return new Date().toISOString().split('T')[0];
}

function buildPrompt(task: TaskEntry, events: { type: string; t: string; [k: string]: unknown }[]): string {
  const date = todayStr();
  const p = task.task.progress;
  const eventLines = events.map((ev) => `- [${ev.t}] ${ev.type}: ${JSON.stringify(Object.fromEntries(Object.entries(ev).filter(([k]) => k !== 't' && k !== 'type')))}`).join('\n');

  return [
    'You are a terse engineering diary writer.',
    '',
    `Task: ${task.task.title}`,
    `Date: ${date}`,
    '',
    'Task Progress:',
    `- Completed: ${p.completed.join(', ') || 'None'}`,
    `- Current: ${p.current || 'None'}`,
    `- Next: ${p.next || 'None'}`,
    `- Blocked by: ${p.blocked_by || 'None'}`,
    '',
    'Recent WAL Events (last 24h):',
    eventLines || 'None',
    '',
    'Instructions:',
    '1. Write a short daily diary in Markdown.',
    '2. First line must be a plain-text micro-summary (under 100 chars) suitable for "l2".',
    '3. Return ONLY a JSON object with two fields:',
    '   { "l2": "...", "l3": "..." }',
    '4. "l3" should be the full Markdown diary, including bullet points for completed items, blockers, and next steps.',
  ].join('\n');
}

function parseJsonFromLlm(text: string): { l2: string; l3: string } {
  // Try to extract JSON block
  const blockMatch = text.match(/```json\s*([\s\S]*?)```/);
  const raw = blockMatch ? blockMatch[1].trim() : text.trim();
  // Find first `{` and last `}`
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) {
    throw new Error('LLM response did not contain valid JSON object.');
  }
  const parsed = JSON.parse(raw.slice(start, end + 1)) as { l2?: string; l3?: string };
  if (typeof parsed.l2 !== 'string' || typeof parsed.l3 !== 'string') {
    throw new Error('LLM response JSON missing l2 or l3 fields.');
  }
  return { l2: parsed.l2.trim(), l3: parsed.l3.trim() };
}

export interface GenerateDiaryResult {
  memoryId: string;
  l2: string;
  l3: string;
}

export async function generateDiary(
  taskId: string,
  projectRoot?: string,
  save = true
): Promise<GenerateDiaryResult> {
  const task = getEntry(taskId, projectRoot) as TaskEntry | null;
  if (!task || task.type !== 'Task') {
    throw new Error(`Invalid or missing task: ${taskId}`);
  }

  const events = readWalEvents(projectRoot || process.cwd(), 200).filter((ev) => {
    const evDate = ev.t.slice(0, 10);
    return evDate === todayStr();
  });

  const prompt = buildPrompt(task, events);
  const llmText = await callLlm([
    { role: 'system', content: 'You return only JSON. No extra commentary.' },
    { role: 'user', content: prompt },
  ]);

  const { l2, l3 } = parseJsonFromLlm(llmText);
  const date = todayStr();
  const memoryId = `diary-${date}-${taskId}`;

  if (!save) {
    return { memoryId, l2, l3 };
  }

  const now = new Date().toISOString();
  const entry: MemoryEntry = {
    id: memoryId,
    type: 'Memory',
    version: 1,
    namespace: 'project',
    content: {
      l1_5: l2.slice(0, 30),
      l2,
      l3,
    },
    lifecycle: {
      state: 'active',
      created: now,
      updated: now,
      last_accessed: now,
      last_activated: now,
      activation_count: 1,
      verification_count: 0,
      promoted_from: null,
      demotion_reason: null,
    },
    quality: {
      freshness: 1,
      trust: 0.85,
      activity: 1,
      composite_score: 0.92,
    },
    trust: {
      level: 'derived',
      source: 'model',
    },
    activation: {
      paths: [],
      keywords: ['diary', task.task.title],
      intents: ['review_progress'],
      tools: [],
      entry_refs: [taskId],
    },
    conflicts: {
      supersedes: [],
      conflicts_with: [],
      overridden_by: null,
      precedence: 0,
      resolution_policy: 'newest_wins',
    },
    bindings_out: [],
    bindings_in: [],
  };

  saveEntry(entry, projectRoot);

  const binding: Binding = {
    source: memoryId,
    target: taskId,
    relationship: 'realized_in',
    directionality: 'forward',
    status: 'active',
    confidence: 0.9,
    confidence_model: {
      base: 0.9,
      freshness_factor: 1,
      evidence_weight: 1,
      usage_boost: 0,
      drift_penalty: 0,
    },
    evidence: [
      {
        type: 'task_progress',
        detail: `Daily diary derived from task ${taskId} on ${date}`,
        weight: 1,
        discovered: now,
      },
    ],
    decay: {
      half_life_days: 30,
      last_reconfirmed: now,
    },
    invalidation: {
      invalidated_by: null,
      reason: null,
    },
    verification_history: [],
  };

  const paths = getPaths(projectRoot);
  const bindingFile = `bind-${memoryId}-${taskId}.yml`.replace(/[\\/]/g, '_');
  fs.writeFileSync(path.join(paths.bindings, bindingFile), YAML.stringify(binding));
  invalidateCache(projectRoot);

  await appendWalAsync({ type: 'diary_generated', task_id: taskId, memory_id: memoryId }, projectRoot);

  return { memoryId, l2, l3 };
}
