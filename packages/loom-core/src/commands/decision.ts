import { randomUUID } from 'node:crypto';
import type { DecisionEntry } from '../types/index.js';

export function createDecisionEntry(
  question: string,
  chosen: string,
  rationale: string,
  impactScope: string[] = []
): DecisionEntry {
  const slug = question
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 30);
  const id = `decision-${slug || randomUUID().slice(0, 8)}-${randomUUID().slice(0, 8)}`;
  const now = new Date().toISOString();
  return {
    id,
    type: 'Decision',
    version: 1,
    namespace: 'project',
    content: {
      l1_5: `${question} → ${chosen}`.slice(0, 120),
      l2: `${question}\nChosen: ${chosen}\nRationale: ${rationale}`.slice(0, 500),
      l3: `Question: ${question}\nChosen: ${chosen}\nRationale: ${rationale}\nImpact: ${impactScope.join(', ')}`,
    },
    lifecycle: {
      state: 'active', created: now, updated: now, last_accessed: now, last_activated: now,
      activation_count: 1, verification_count: 0, promoted_from: null, demotion_reason: null,
    },
    quality: { freshness: 1, trust: 0.95, activity: 1, composite_score: 0.95 },
    trust: { level: 'verified', source: 'human' },
    activation: { paths: [], keywords: [], intents: [], tools: [], entry_refs: [] },
    conflicts: { supersedes: [], conflicts_with: [], overridden_by: null, precedence: 0, resolution_policy: 'newest_wins' },
    bindings_out: [],
    bindings_in: [],
    decision: {
      question,
      chosen,
      rationale,
      rejected: [],
      assumptions: [],
      impact_scope: impactScope,
      supersedes: null,
      made_in: now,
    },
  };
}
