import { randomUUID } from 'node:crypto';
import type { RuleEntry } from '../types/index.js';

export function createRuleEntry(
  scope: string,
  rule: string,
  rationale: string = ''
): RuleEntry {
  const slug = scope
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 20);
  const id = `rule-${slug || randomUUID().slice(0, 8)}-${randomUUID().slice(0, 8)}`;
  const now = new Date().toISOString();
  return {
    id,
    type: 'Rule',
    version: 1,
    namespace: 'project',
    content: {
      l1_5: `[${scope}] ${rule}`.slice(0, 120),
      l2: `${rule}\nRationale: ${rationale}`.slice(0, 500),
      l3: `Scope: ${scope}\nRule: ${rule}\nRationale: ${rationale}`,
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
  };
}
