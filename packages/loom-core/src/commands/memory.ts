import { randomUUID } from 'node:crypto';
import type { MemoryEntry } from '../types/index.js';

export function createMemoryEntry(
  content: string,
  tags: string[] = [],
  namespace: 'project' | 'user' | 'auto' = 'project'
): MemoryEntry {
  const slug = content
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 30);
  const id = `memory-${slug || randomUUID().slice(0, 8)}-${randomUUID().slice(0, 8)}`;
  const now = new Date().toISOString();
  return {
    id,
    type: 'Memory',
    version: 1,
    namespace,
    content: {
      l1_5: content.slice(0, 120),
      l2: content.slice(0, 500),
      l3: content,
    },
    lifecycle: {
      state: 'active', created: now, updated: now, last_accessed: now, last_activated: now,
      activation_count: 1, verification_count: 0, promoted_from: null, demotion_reason: null,
    },
    quality: { freshness: 1, trust: 0.9, activity: 1, composite_score: 0.9 },
    trust: { level: 'trusted', source: 'tool' },
    activation: { paths: [], keywords: tags, intents: [], tools: [], entry_refs: [] },
    conflicts: { supersedes: [], conflicts_with: [], overridden_by: null, precedence: 0, resolution_policy: 'newest_wins' },
    bindings_out: [],
    bindings_in: [],
  };
}
