import type { StoreAdapter } from './store/adapter.js';
import type { TaskEntry, MemoryEntry, Binding } from './types/index.js';
import { readWalEventsSince } from './session-recall.js';
import { appendWalAsync } from './wal-queue.js';

function todayStr(): string {
  return new Date().toISOString().split('T')[0];
}

export interface GenerateDiaryResult {
  memoryId: string;
  l2: string;
  l3: string;
}

export function generateDiary(taskId: string, store: StoreAdapter, save = true): GenerateDiaryResult {
  const task = store.getEntry(taskId) as TaskEntry | null;
  if (!task || task.type !== 'Task') {
    throw new Error(`Invalid or missing task: ${taskId}`);
  }

  const since = `${todayStr()}T00:00:00.000Z`;
  const events = readWalEventsSince(process.cwd(), since);
  const date = todayStr();
  const memoryId = `diary-${date}-${taskId}`;

  const p = task.task.progress;
  const eventSummary = events.length > 0
    ? events.map((ev) => `- [${ev.t}] ${ev.type}`).join('\n')
    : 'No events recorded today.';

  const l2 = `Diary: ${task.task.title} (${date})`;
  const l3Lines = [
    `# Diary: ${task.task.title}`,
    `**Date:** ${date}`, '',
    '## Progress',
    `- **Completed:** ${p.completed.join(', ') || 'None'}`,
    `- **Current:** ${p.current || 'None'}`,
    `- **Next:** ${p.next || 'None'}`,
    `- **Blocked by:** ${p.blocked_by || 'None'}`, '',
    '## Activity Log',
    eventSummary,
  ];

  if (task.task.unresolved_questions.length > 0) {
    l3Lines.push('', '## Open Questions', ...task.task.unresolved_questions.map((q) => `- ${q}`));
  }

  const l3 = l3Lines.join('\n');

  if (!save) {
    return { memoryId, l2, l3 };
  }

  const now = new Date().toISOString();
  const entry: MemoryEntry = {
    id: memoryId, type: 'Memory', version: 1, namespace: 'project',
    content: { l1_5: l2.slice(0, 30), l2, l3 },
    lifecycle: { state: 'active', created: now, updated: now, last_accessed: now, last_activated: now, activation_count: 1, verification_count: 0, promoted_from: null, demotion_reason: null },
    quality: { freshness: 1, trust: 0.85, activity: 1, composite_score: 0.92 },
    trust: { level: 'derived', source: 'model' },
    activation: { paths: [], keywords: ['diary', task.task.title], intents: ['review_progress'], tools: [], entry_refs: [taskId] },
    conflicts: { supersedes: [], conflicts_with: [], overridden_by: null, precedence: 0, resolution_policy: 'newest_wins' },
    bindings_out: [], bindings_in: [],
  };

  const binding: Binding = {
    source: memoryId, target: taskId, relationship: 'realized_in', directionality: 'forward', status: 'active',
    confidence: 0.9, confidence_model: { base: 0.9, freshness_factor: 1, evidence_weight: 1, usage_boost: 0, drift_penalty: 0 },
    evidence: [{ type: 'task_progress', detail: `Daily diary derived from task ${taskId} on ${date}`, weight: 1, discovered: now }],
    decay: { half_life_days: 30, last_reconfirmed: now },
    invalidation: { invalidated_by: null, reason: null },
    verification_history: [],
  };

  store.saveEntry(entry);
  store.saveBinding(binding);
  store.bumpCacheVersion();

  appendWalAsync({ type: 'diary_generated', task_id: taskId, memory_id: memoryId }, process.cwd()).catch(() => {});

  return { memoryId, l2, l3 };
}
