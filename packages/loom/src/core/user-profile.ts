import { getEntry, saveEntry } from './store.js';
import type { MemoryEntry, DecisionEntry, TaskEntry } from '../types/index.js';

const USER_PROFILE_ID = 'memory-user-profile';

function createUserProfileEntry(now: string): MemoryEntry {
  return {
    id: USER_PROFILE_ID,
    type: 'Memory',
    version: 1,
    namespace: 'user',
    content: {
      l1_5: 'User preferences and work style',
      l2: 'User Profile: accumulated preferences from decisions and tasks',
      l3: '## User Profile\n\nInferred preferences based on recorded decisions and task patterns.\n',
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
      trust: 0.8,
      activity: 1,
      composite_score: 0.9,
    },
    trust: {
      level: 'inferred',
      source: 'model',
    },
    activation: {
      paths: [],
      keywords: ['user', 'preference', 'style', 'profile'],
      intents: ['recall_user_context'],
      tools: [],
      entry_refs: [],
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
}

export function ensureUserProfile(projectRoot?: string): MemoryEntry {
  const existing = getEntry(USER_PROFILE_ID, projectRoot);
  if (existing && existing.type === 'Memory') {
    return existing as MemoryEntry;
  }
  const now = new Date().toISOString();
  const entry = createUserProfileEntry(now);
  saveEntry(entry, projectRoot);
  return entry;
}

export function updateUserProfileFromDecision(
  decision: DecisionEntry,
  projectRoot?: string
): void {
  const profile = ensureUserProfile(projectRoot);
  const line = `- Decision signal (${decision.id}): prefers "${decision.decision.chosen}" regarding "${decision.decision.question}"`;
  const current = typeof profile.content.l3 === 'string' ? profile.content.l3 : '';
  if (!current.includes(line)) {
    profile.content.l3 = current + `\n${line}`;
    profile.lifecycle.updated = new Date().toISOString();
    saveEntry(profile, projectRoot);
  }
}

export function updateUserProfileFromTask(
  task: TaskEntry,
  projectRoot?: string
): void {
  const profile = ensureUserProfile(projectRoot);
  const line = `- Task signal (${task.id}): intent=${task.task.intent}, priority=${task.task.priority}`;
  const current = typeof profile.content.l3 === 'string' ? profile.content.l3 : '';
  if (!current.includes(line)) {
    profile.content.l3 = current + `\n${line}`;
    profile.lifecycle.updated = new Date().toISOString();
    saveEntry(profile, projectRoot);
  }
}
