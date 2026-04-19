import type { StoreAdapter } from './store/adapter.js';
import type { RuleEntry, MemoryEntry, DecisionEntry } from './types/index.js';
import { randomUUID } from 'node:crypto';

function now(): string {
  return new Date().toISOString();
}

function makeRuleEntry(scope: string, rule: string, rationale: string): RuleEntry {
  const slug = scope.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 20);
  const id = `rule-loom-${slug || randomUUID().slice(0, 8)}`;
  const t = now();
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
      state: 'active', created: t, updated: t, last_accessed: t, last_activated: t,
      activation_count: 1, verification_count: 0, promoted_from: null, demotion_reason: null,
    },
    quality: { freshness: 1, trust: 0.95, activity: 1, composite_score: 0.95 },
    trust: { level: 'verified', source: 'human' },
    activation: { paths: ['.loom/'], keywords: ['loom', scope], intents: [], tools: [], entry_refs: [] },
    conflicts: { supersedes: [], conflicts_with: [], overridden_by: null, precedence: 0, resolution_policy: 'newest_wins' },
    bindings_out: [],
    bindings_in: [],
  };
}

function makeMemoryEntry(content: string, tags: string[]): MemoryEntry {
  const slug = content.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 30);
  const id = `memory-loom-${slug || randomUUID().slice(0, 8)}`;
  const t = now();
  return {
    id,
    type: 'Memory',
    version: 1,
    namespace: 'project',
    content: {
      l1_5: content.slice(0, 120),
      l2: content.slice(0, 500),
      l3: content,
    },
    lifecycle: {
      state: 'active', created: t, updated: t, last_accessed: t, last_activated: t,
      activation_count: 1, verification_count: 0, promoted_from: null, demotion_reason: null,
    },
    quality: { freshness: 1, trust: 0.9, activity: 1, composite_score: 0.9 },
    trust: { level: 'trusted', source: 'tool' },
    activation: { paths: ['.loom/'], keywords: tags, intents: [], tools: [], entry_refs: [] },
    conflicts: { supersedes: [], conflicts_with: [], overridden_by: null, precedence: 0, resolution_policy: 'newest_wins' },
    bindings_out: [],
    bindings_in: [],
  };
}

function makeDecisionEntry(question: string, chosen: string, rationale: string, impactScope: string[]): DecisionEntry {
  const slug = question.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 30);
  const id = `decision-loom-${slug || randomUUID().slice(0, 8)}`;
  const t = now();
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
      state: 'active', created: t, updated: t, last_accessed: t, last_activated: t,
      activation_count: 1, verification_count: 0, promoted_from: null, demotion_reason: null,
    },
    quality: { freshness: 1, trust: 0.95, activity: 1, composite_score: 0.95 },
    trust: { level: 'verified', source: 'human' },
    activation: { paths: ['.loom/'], keywords: ['loom', 'architecture'], intents: [], tools: [], entry_refs: [] },
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
      made_in: t,
    },
  };
}

export function seedDefaultEntries(store: StoreAdapter): void {
  // ── Rules ──
  // Explain the "why" behind each rule so the model understands and complies naturally,
  // rather than relying on heavy-handed MUSTs. Inspired by Anthropic skill-creator principles.

  store.saveEntry(makeRuleEntry(
    'loom-workflow',
    'Read active-prompt.txt at session start; before ending, scan for unrecorded decisions, memories, rules, or task updates.',
    'LOOM\'s value is continuity. Knowledge that isn\'t recorded before the session ends is lost — the next session starts from scratch, forcing repeated discussions. The active-prompt is the compressed state of everything the system knows right now.'
  ));

  store.saveEntry(makeRuleEntry(
    'loom-navigation',
    'When encountering a ↣id without understanding its details, call loom_entry_expand or loom_entry_explain before acting on it.',
    '↣ids are compressed references. Guessing their content leads to hallucination cascades — one wrong assumption propagates through the entire session. Expanding is cheap (single read) compared to recovering from a wrong inference.\n\nExample — good: "I see ↣decision-xyz but I\'m not sure what it covers. Let me expand it first." → calls loom_entry_expand.\nBad: "Based on the id name, this decision probably means..." → proceeds with guess.'
  ));

  store.saveEntry(makeRuleEntry(
    'loom-governance',
    'Before modifying artifacts referenced in governance or decisions slots, review those constraints first.',
    'Governance and decisions represent stable, validated project knowledge. They exist to prevent "I forgot we decided that" errors. Temporary ideas from a single session should not override collective decisions without explicit discussion.\n\nExample: User says "let\'s switch to Express instead of Hono" → check decisions slot → find "Use Hono over Express" → surface this to user rather than silently switching.'
  ));

  // ── Memories ──
  // Use progressive disclosure: l1_5 for quick recognition, l2 for core concept, l3 for detailed reference.
  // Include scenario-based examples so the model knows *when* and *how* to use each tool.

  store.saveEntry(makeMemoryEntry(
    'LOOM is a persistent collaborative memory system. It tracks 7 entry types (Artifact, Task, Decision, Rule, Memory, Skill, Pattern) and injects context via a slot-based XML prompt built with 2-hop graph diffusion from the active task.',
    ['loom', 'system', 'overview']
  ));

  store.saveEntry(makeMemoryEntry(
    'Artifact: auto-discovered from filesystem scan/watch. Task/Decision/Rule/Memory: created via explicit tool calls. Skill: extracted from completed tasks. Pattern: derived from code analysis. The prompt builder orders slots by stability — static slots (protocol, governance, decisions) at the top for KV-cache efficiency, dynamic slots (task, working_set, risks) at the bottom.',
    ['loom', 'entry-types', 'context']
  ));

  store.saveEntry(makeMemoryEntry(
    'Typical LOOM workflow with examples:\n\n1. Start: read active-prompt (already in context). Check loom_task_list for existing work. Create/set active task if needed.\n\n2. Work: implement while watch daemon auto-tracks file changes.\n\n3. Record knowledge immediately when it forms (don\'t wait):\n   - Decision: "Let\'s use JWT" → loom_decision_record right away. Why? In 3 sessions you\'ll forget why.\n   - Preference: "I prefer small functions" → loom_memory_add immediately.\n   - Convention: "All routes kebab-case" → loom_rule_create while fresh.\n\n4. Session wrap-up: 30-second mental scan for anything unrecorded.\n\nThe cost of recording now is 30 seconds. The cost of not recording is 10 minutes of rediscovery in the next session.',
    ['loom', 'workflow', 'examples']
  ));

  // ── Decisions ──
  // Record the architectural rationale clearly so future sessions understand *why* things are this way.

  store.saveEntry(makeDecisionEntry(
    'How should LOOM present context to the AI?',
    'Slot-based XML prompt with static-to-dynamic ordering',
    'Static slots (protocol, governance, decisions) change rarely and sit at the top for KV-cache / prompt-cache efficiency. Dynamic slots (task, working_set, risks) at the bottom minimize prefix invalidation when they change. All internal lists sorted by ID to prevent order jitter from breaking cache. This ordering maximizes cache hit rate across multiple sessions.',
    ['packages/loom-core/src/prompt/builder.ts', 'docs/ARCHITECTURE.md']
  ));

  store.saveEntry(makeDecisionEntry(
    'What persistence format should LOOM use for entries?',
    'One YAML file per entry in .loom/entries/<type>/',
    'Human-readable, git-diffable, no merge conflicts since each entry is independent. Atomic writes via temp-file rename prevent corruption. Easy to inspect and manually edit during debugging. The filesystem is the single source of truth — no database to manage, no migration scripts, version-controllable.',
    ['packages/loom-core/src/store/fs-adapter.ts', '.loom/entries/']
  ));

  store.bumpCacheVersion();
}
