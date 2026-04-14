import * as fs from 'node:fs';
import * as path from 'node:path';
import * as YAML from 'yaml';
import { getEntry, saveEntry, appendWal } from './store.js';
import { getPaths } from './paths.js';
import type { TaskEntry, SkillEntry, Entry, Binding } from '../types/index.js';

function slugify(input: string): string {
  // Keep letters/numbers from any script, collapse punctuation to hyphen
  const base = input
    .trim()
    .replace(/[^\p{L}\p{N}\s]+/gu, ' ')
    .replace(/\s+/g, '-')
    .slice(0, 40);
  if (!base) return 'untitled';
  return base;
}

export function extractSkillFromTask(
  taskId: string,
  projectRoot?: string
): { skill: SkillEntry; bindings: Binding[] } | null {
  const task = getEntry(taskId, projectRoot);
  if (!task || task.type !== 'Task') return null;
  const t = task as TaskEntry;

  const now = new Date().toISOString();
  const skillId = `skill-${slugify(t.task.title)}`;

  // Gather related artifacts and decisions
  const relatedIds = [
    ...t.task.working_set,
    ...t.task.related_entries,
  ];
  const relatedEntries: Entry[] = [];
  for (const id of relatedIds) {
    const e = getEntry(id, projectRoot);
    if (e) relatedEntries.push(e);
  }

  const artifacts = relatedEntries.filter((e) => e.type === 'Artifact');
  const decisions = relatedEntries.filter((e) => e.type === 'Decision');

  const steps: string[] = [];
  if (t.task.progress.completed.length > 0) {
    steps.push('...Completed steps:');
    for (const c of t.task.progress.completed) steps.push(`- ${c}`);
  }
  if (t.task.progress.current) {
    steps.push(`- Current focus: ${t.task.progress.current}`);
  }
  if (t.task.acceptance_criteria.length > 0) {
    steps.push('- Acceptance criteria:');
    for (const ac of t.task.acceptance_criteria) steps.push(`  * ${ac}`);
  }

  const pitfalls: string[] = [];
  if (t.task.unresolved_questions.length > 0) {
    pitfalls.push('...Open questions / watch-outs:');
    for (const q of t.task.unresolved_questions) pitfalls.push(`- ${q}`);
  }

  const l3Lines: string[] = [
    `## Skill: ${t.task.title}`,
    '',
    `**Goal:** ${t.task.title}`,
    `**Intent:** ${t.task.intent}`,
    '',
    '**Procedure:**',
    ...steps,
    '',
    '**Key Artifacts:**',
    ...artifacts.map((a) => `- ↣${a.id}: ${a.content.l2}`),
    '',
    '**Key Decisions:**',
    ...decisions.map((d) => `- ↣${d.id}: ${d.content.l2}`),
  ];

  if (pitfalls.length > 0) {
    l3Lines.push('');
    l3Lines.push(...pitfalls);
  }

  const skill: SkillEntry = {
    id: skillId,
    type: 'Skill',
    version: 1,
    namespace: 'project',
    content: {
      l1_5: t.task.title.slice(0, 30),
      l2: t.task.title,
      l3: l3Lines.join('\n'),
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
      keywords: [t.task.intent, 'skill', t.task.title],
      intents: ['reuse_procedure'],
      tools: [],
      entry_refs: [taskId, ...relatedIds],
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

  const bindings: Binding[] = [];
  // Skill realized_in Task
  bindings.push({
    source: skillId,
    target: taskId,
    relationship: 'realized_in',
    directionality: 'forward',
    status: 'active',
    confidence: 0.95,
    confidence_model: {
      base: 0.95,
      freshness_factor: 1,
      evidence_weight: 1,
      usage_boost: 0,
      drift_penalty: 0,
    },
    evidence: [{ type: 'task_completion', detail: `Derived from task ${taskId}`, weight: 1, discovered: now }],
    decay: { half_life_days: 30, last_reconfirmed: now },
    invalidation: { invalidated_by: null, reason: null },
    verification_history: [],
  });

  // Skill depends_on Artifacts / Decisions
  for (const ref of relatedEntries) {
    bindings.push({
      source: skillId,
      target: ref.id,
      relationship: 'depends_on',
      directionality: 'forward',
      status: 'active',
      confidence: 0.85,
      confidence_model: {
        base: 0.85,
        freshness_factor: 1,
        evidence_weight: 0.9,
        usage_boost: 0,
        drift_penalty: 0,
      },
      evidence: [{ type: 'working_set_reference', detail: `Referenced in task ${taskId}`, weight: 0.9, discovered: now }],
      decay: { half_life_days: 30, last_reconfirmed: now },
      invalidation: { invalidated_by: null, reason: null },
      verification_history: [],
    });
  }

  return { skill, bindings };
}

export function saveExtractedSkill(
  taskId: string,
  projectRoot?: string,
  requestId?: string | number
): string | null {
  const result = extractSkillFromTask(taskId, projectRoot);
  if (!result) return null;
  const { skill, bindings } = result;

  const existing = getEntry(skill.id, projectRoot) as SkillEntry | null;
  if (existing && existing.type === 'Skill') {
    skill.version = (existing.version || 1) + 1;
    skill.lifecycle = {
      ...skill.lifecycle,
      created: existing.lifecycle.created,
      activation_count: existing.lifecycle.activation_count + 1,
      verification_count: existing.lifecycle.verification_count,
      last_accessed: new Date().toISOString(),
    };
  }

  saveEntry(skill, projectRoot);

  // Write bindings to disk, cleaning up stale ones first
  const paths = getPaths(projectRoot);
  if (fs.existsSync(paths.bindings)) {
    const prefix = `bind-${skill.id}-`;
    for (const file of fs.readdirSync(paths.bindings)) {
      if (file.startsWith(prefix) && file.endsWith('.yml')) {
        fs.unlinkSync(path.join(paths.bindings, file));
      }
    }
  }
  for (const b of bindings) {
    const fileName = `bind-${b.source}-${b.target}.yml`;
    fs.writeFileSync(path.join(paths.bindings, fileName), YAML.stringify(b));
  }

  appendWal({ type: 'skill_extracted', task_id: taskId, skill_id: skill.id, request_id: requestId }, projectRoot);
  return skill.id;
}
