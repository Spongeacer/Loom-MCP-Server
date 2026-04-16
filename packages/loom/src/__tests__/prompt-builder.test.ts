import { describe, it } from 'node:test';
import assert from 'node:assert';
import { buildSlotPrompt, buildExpandedPrompt, computeRisks } from '../core/prompt-builder.js';
import type { Entry, Binding, ArtifactEntry, TaskDetails } from '../types/index.js';

function makeEntry(id: string, type: Entry['type'], overrides?: Partial<Entry>): Entry {
  const base: any = {
    id,
    type,
    version: 1,
    namespace: 'project',
    content: { l1_5: 'summary', l2: `${id} desc`, l3: 'details' },
    lifecycle: { state: 'active', created: '2024-01-01T00:00:00Z', updated: '2024-01-01T00:00:00Z', last_accessed: '2024-01-01T00:00:00Z', last_activated: '2024-01-01T00:00:00Z', activation_count: 1, verification_count: 0, promoted_from: null, demotion_reason: null },
    quality: { freshness: 1, trust: 0.9, activity: 1, composite_score: 0.95 },
    trust: { level: 'verified', source: 'human' },
    activation: { paths: [], keywords: [], intents: [], tools: [], entry_refs: [] },
    conflicts: { supersedes: [], conflicts_with: [], overridden_by: null, precedence: 0, resolution_policy: 'newest_wins' },
    bindings_out: [],
    bindings_in: [],
  };
  return { ...base, ...overrides } as Entry;
}

function makeArtifactEntry(id: string, overrides?: Partial<ArtifactEntry>): ArtifactEntry {
  const base: any = {
    id,
    type: 'Artifact',
    version: 1,
    namespace: 'project',
    content: { l1_5: 'summary', l2: `${id} desc`, l3: 'details' },
    lifecycle: { state: 'active', created: '2024-01-01T00:00:00Z', updated: '2024-01-01T00:00:00Z', last_accessed: '2024-01-01T00:00:00Z', last_activated: '2024-01-01T00:00:00Z', activation_count: 1, verification_count: 0, promoted_from: null, demotion_reason: null },
    quality: { freshness: 1, trust: 0.9, activity: 1, composite_score: 0.95 },
    trust: { level: 'verified', source: 'human' },
    activation: { paths: [], keywords: [], intents: [], tools: [], entry_refs: [] },
    conflicts: { supersedes: [], conflicts_with: [], overridden_by: null, precedence: 0, resolution_policy: 'newest_wins' },
    bindings_out: [],
    bindings_in: [],
    artifact: {
      path: `${id}.ts`,
      category: 'source_code',
      file_type: 'ts',
      granularity: 'file',
      symbol: null,
      span: { start_line: null, end_line: null },
      line_count: 0,
      git_tracked: false,
      last_git_commit: null,
      last_modifier: 'agent',
      content_hash: '',
      summary_hash: '',
      fs: { last_modified_at: new Date().toISOString(), last_seen_at: new Date().toISOString(), size_bytes: 0, exists: true },
      deps: { imports: [], imported_by: [] },
      health: { status: 'healthy', score: 1, reasons: [], suggested_action: 'keep' },
    },
  };
  return { ...base, ...overrides } as ArtifactEntry;
}

describe('prompt-builder', () => {
  it('buildSlotPrompt renders basic structure', () => {
    const ctx = {
      protocol: 'Test protocol',
      governance: [makeEntry('rule-1', 'Rule')],
      activeTask: makeEntry('task-1', 'Task', { task: { title: 'Do work', status: 'active', intent: 'feature', priority: 'high', working_set: [], related_entries: [], acceptance_criteria: [], unresolved_questions: [], progress: { completed: [], current: 'coding', next: null, blocked_by: null }, started_in: '2024-01-01T00:00:00Z', last_touched: '2024-01-01T00:00:00Z' } } as any),
      workingSet: [makeEntry('art-1', 'Artifact')],
      decisions: [makeEntry('dec-1', 'Decision')],
      risks: ['risk-1'],
      recovery: 'Last ended normally.',
      dictionary: [],
    };
    const prompt = buildSlotPrompt(ctx);
    assert(prompt.includes('<loom_context>'));
    assert(prompt.includes('</loom_context>'));
    assert(prompt.includes('Test protocol'));
    assert(prompt.includes('↣rule-1: rule-1 desc'));
    assert(prompt.includes('<task id="task-1" status="active">'));
    assert(prompt.includes('Goal: Do work'));
    assert(prompt.includes('Current: coding'));
    assert(prompt.includes('↣art-1: art-1 desc'));
    assert(prompt.includes('↣dec-1: dec-1 desc'));
    assert(prompt.includes('risk-1'));
    assert(prompt.includes('Last ended normally.'));
  });

  it('buildSlotPrompt sorts entries stably by id', () => {
    const entries = [
      makeEntry('zebra', 'Rule'),
      makeEntry('alpha', 'Rule'),
      makeEntry('mike', 'Rule'),
    ];
    const prompt = buildSlotPrompt({ protocol: '', governance: entries, activeTask: null, workingSet: [], decisions: [], risks: [], recovery: '', dictionary: [] });
    const idxAlpha = prompt.indexOf('↣alpha');
    const idxMike = prompt.indexOf('↣mike');
    const idxZebra = prompt.indexOf('↣zebra');
    assert(idxAlpha < idxMike && idxMike < idxZebra, 'Entries should be sorted alphabetically');
  });

  it('buildExpandedPrompt renders l2 and l3', () => {
    const entry = makeEntry('entry-1', 'Memory');
    const l2 = buildExpandedPrompt(entry, 'l2');
    assert(l2.includes('<loom_expand id="entry-1" type="Memory">'));
    assert(l2.includes('entry-1 desc'));

    const l3 = buildExpandedPrompt(entry, 'l3');
    assert(l3.includes('details'));
  });

  it('buildExpandedPrompt includes bindings sorted', () => {
    const entry = makeEntry('entry-1', 'Memory');
    entry.bindings_out = [
      { target: 'z-target', rel: 'depends_on', conf: 0.8 },
      { target: 'a-target', rel: 'governs', conf: 0.9 },
    ];
    entry.bindings_in = [
      { source: 'm-source', rel: 'realized_in', conf: 0.7 },
    ];
    const prompt = buildExpandedPrompt(entry, 'l3');
    const lines = prompt.split('\n');
    const bindingLines = lines.filter(l => l.trim().startsWith('→') || l.trim().startsWith('←'));
    assert.strictEqual(bindingLines.length, 3);
    // sorted by id
    assert(bindingLines[0].includes('a-target'));
    assert(bindingLines[1].includes('m-source'));
    assert(bindingLines[2].includes('z-target'));
  });

  it('computeRisks flags inferred artifacts', () => {
    const entries: Entry[] = [
      makeArtifactEntry('art-safe', { trust: { level: 'verified', source: 'human' } }),
      makeArtifactEntry('art-risk', { trust: { level: 'inferred', source: 'tool' } }),
    ];
    const risks = computeRisks(entries, []);
    assert.strictEqual(risks.length, 1);
    assert(risks[0].includes('art-risk'));
    assert(risks[0].includes('inferred'));
  });

  it('computeRisks flags weak and broken bindings', () => {
    const entries: Entry[] = [];
    const bindings: Binding[] = [
      { source: 'a', target: 'b', relationship: 'depends_on', directionality: 'forward', status: 'weak', confidence: 0.3, confidence_model: { base: 0.3, freshness_factor: 1, evidence_weight: 0.1, usage_boost: 1, drift_penalty: 0 }, evidence: [], decay: { half_life_days: 30, last_reconfirmed: new Date().toISOString() }, invalidation: { invalidated_by: null, reason: null }, verification_history: [] },
      { source: 'a', target: 'c', relationship: 'depends_on', directionality: 'forward', status: 'broken', confidence: 0.1, confidence_model: { base: 0.1, freshness_factor: 1, evidence_weight: 0.1, usage_boost: 1, drift_penalty: 0 }, evidence: [], decay: { half_life_days: 30, last_reconfirmed: new Date().toISOString() }, invalidation: { invalidated_by: null, reason: null }, verification_history: [] },
    ];
    const risks = computeRisks(entries, bindings);
    assert.strictEqual(risks.length, 2);
    assert(risks.some(r => r.includes('weakened')));
    assert(risks.some(r => r.includes('broken')));
  });
});
