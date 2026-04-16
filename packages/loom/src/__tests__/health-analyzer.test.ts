import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { runHealthAnalysis } from '../core/health-analyzer.js';
import type { ArtifactEntry, Entry, Binding } from '../types/index.js';

const FIXTURES = path.join(os.tmpdir(), 'loom-fixtures-health');

function createArtifact(id: string, fileName: string, exists: boolean): ArtifactEntry {
  return {
    id,
    type: 'Artifact',
    version: 1,
    namespace: 'auto',
    content: { l1_5: fileName, l2: fileName, l3: { file: fileName } },
    lifecycle: { state: 'active', created: new Date().toISOString(), updated: new Date().toISOString(), last_accessed: new Date().toISOString(), last_activated: new Date().toISOString(), activation_count: 1, verification_count: 0, promoted_from: null, demotion_reason: null },
    quality: { freshness: 1, trust: 0.6, activity: 0.5, composite_score: 0.7 },
    trust: { level: 'derived', source: 'tool' },
    activation: { paths: [fileName], keywords: [], intents: [], tools: [], entry_refs: [] },
    conflicts: { supersedes: [], conflicts_with: [], overridden_by: null, precedence: 0, resolution_policy: 'newest_wins' },
    bindings_out: [],
    bindings_in: [],
    artifact: {
      path: fileName,
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
      fs: { last_modified_at: new Date().toISOString(), last_seen_at: new Date().toISOString(), size_bytes: 0, exists },
      deps: { imports: [], imported_by: [] },
      health: { status: 'healthy', score: 1, reasons: [], suggested_action: 'keep' },
    },
  };
}

before(() => {
  fs.rmSync(FIXTURES, { recursive: true, force: true });
  fs.mkdirSync(FIXTURES, { recursive: true });
  fs.writeFileSync(path.join(FIXTURES, 'normal.ts'), 'export const a = 1;\n');
  fs.writeFileSync(path.join(FIXTURES, 'old_backup.ts'), 'export const b = 2;\n');
  fs.writeFileSync(path.join(FIXTURES, 'duplicate_a.ts'), 'export const same = 3;\n');
  fs.writeFileSync(path.join(FIXTURES, 'duplicate_b.ts'), 'export const same = 3;\n');
  fs.writeFileSync(path.join(FIXTURES, 'stale.ts'), 'export const old = 4;\n');

  const staleTime = new Date(Date.now() - 100 * 24 * 60 * 60 * 1000);
  fs.utimesSync(path.join(FIXTURES, 'stale.ts'), staleTime, staleTime);
});

after(() => {
  fs.rmSync(FIXTURES, { recursive: true, force: true });
});

describe('runHealthAnalysis', () => {
  it('flags missing artifacts', () => {
    const artifacts = [createArtifact('art-missing', 'not-exist.ts', false)];
    const report = runHealthAnalysis(artifacts, [], artifacts, FIXTURES);
    assert.strictEqual(report.byStatus.missing.length, 1);
    assert.strictEqual(report.byStatus.missing[0].id, 'art-missing');
    assert(report.trashCandidates.some(a => a.id === 'art-missing'));
  });

  it('flags legacy naming', () => {
    const artifacts = [createArtifact('art-legacy', 'old_backup.ts', true)];
    const report = runHealthAnalysis(artifacts, [], artifacts, FIXTURES);
    assert.strictEqual(report.byStatus.legacy.length, 1);
    assert(report.byStatus.legacy[0].artifact.health.reasons.some(r => r.includes('legacy')));
  });

  it('flags stale files (> 90 days)', () => {
    const artifacts = [createArtifact('art-stale', 'stale.ts', true)];
    const staleTime = new Date(Date.now() - 100 * 24 * 60 * 60 * 1000).toISOString();
    artifacts[0].artifact.fs.last_modified_at = staleTime;
    const report = runHealthAnalysis(artifacts, [], artifacts, FIXTURES);
    assert.strictEqual(report.byStatus.stale.length, 1);
    assert(report.byStatus.stale[0].artifact.health.reasons.some(r => r.includes('90')));
  });

  it('flags redundant duplicates by content hash', () => {
    const artifacts = [
      createArtifact('art-dup-a', 'duplicate_a.ts', true),
      createArtifact('art-dup-b', 'duplicate_b.ts', true),
    ];
    // Provide a binding so they are not marked as orphan (which would mask redundant)
    const bindings: Binding[] = [
      {
        source: 'art-dup-a',
        target: 'art-dup-b',
        relationship: 'depends_on',
        directionality: 'forward',
        status: 'active',
        confidence: 0.75,
        confidence_model: { base: 0.75, freshness_factor: 1, evidence_weight: 0.6, usage_boost: 1, drift_penalty: 0 },
        evidence: [],
        decay: { half_life_days: 60, last_reconfirmed: new Date().toISOString() },
        invalidation: { invalidated_by: null, reason: null },
        verification_history: [],
      },
    ];
    const report = runHealthAnalysis(artifacts, bindings, artifacts, FIXTURES);
    // Only the second processed duplicate sees the first one already hashed
    assert.strictEqual(report.byStatus.redundant.length, 1);
    assert(report.byStatus.redundant[0].artifact.health.reasons.some(r => r.includes('identical')));
  });

  it('keeps healthy artifact when it has bindings', () => {
    const artifacts = [createArtifact('art-normal', 'normal.ts', true)];
    const bindings: Binding[] = [
      {
        source: 'art-normal',
        target: 'art-normal',
        relationship: 'depends_on',
        directionality: 'forward',
        status: 'active',
        confidence: 0.75,
        confidence_model: { base: 0.75, freshness_factor: 1, evidence_weight: 0.6, usage_boost: 1, drift_penalty: 0 },
        evidence: [],
        decay: { half_life_days: 60, last_reconfirmed: new Date().toISOString() },
        invalidation: { invalidated_by: null, reason: null },
        verification_history: [],
      },
    ];
    const report = runHealthAnalysis(artifacts, bindings, artifacts, FIXTURES);
    assert.strictEqual(report.byStatus.healthy.length, 1);
    assert.strictEqual(report.byStatus.healthy[0].id, 'art-normal');
  });

  it('comprehensive report with mixed statuses', () => {
    const artifacts = [
      createArtifact('art-normal', 'normal.ts', true),
      createArtifact('art-missing', 'missing.ts', false),
      createArtifact('art-legacy', 'old_backup.ts', true),
      createArtifact('art-stale', 'stale.ts', true),
      createArtifact('art-dup-a', 'duplicate_a.ts', true),
      createArtifact('art-dup-b', 'duplicate_b.ts', true),
    ];

    const bindings: Binding[] = [
      {
        source: 'art-normal',
        target: 'art-missing',
        relationship: 'depends_on',
        directionality: 'forward',
        status: 'active',
        confidence: 0.75,
        confidence_model: { base: 0.75, freshness_factor: 1, evidence_weight: 0.6, usage_boost: 1, drift_penalty: 0 },
        evidence: [],
        decay: { half_life_days: 60, last_reconfirmed: new Date().toISOString() },
        invalidation: { invalidated_by: null, reason: null },
        verification_history: [],
      },
      {
        source: 'art-dup-a',
        target: 'art-dup-b',
        relationship: 'depends_on',
        directionality: 'forward',
        status: 'active',
        confidence: 0.75,
        confidence_model: { base: 0.75, freshness_factor: 1, evidence_weight: 0.6, usage_boost: 1, drift_penalty: 0 },
        evidence: [],
        decay: { half_life_days: 60, last_reconfirmed: new Date().toISOString() },
        invalidation: { invalidated_by: null, reason: null },
        verification_history: [],
      },
    ];

    const staleTime = new Date(Date.now() - 100 * 24 * 60 * 60 * 1000).toISOString();
    artifacts.find(a => a.id === 'art-stale')!.artifact.fs.last_modified_at = staleTime;

    const entries: Entry[] = artifacts;
    const report = runHealthAnalysis(artifacts, bindings, entries, FIXTURES);

    assert.strictEqual(report.byStatus.missing.length, 1);
    assert.strictEqual(report.byStatus.legacy.length, 1);
    assert.strictEqual(report.byStatus.stale.length, 1);
    assert.strictEqual(report.byStatus.redundant.length, 1);
    assert.strictEqual(report.byStatus.orphan.length, 0);
    // art-dup-a has a binding and is not redundant, so it stays healthy
    assert.strictEqual(report.byStatus.healthy.length, 2);

    assert.strictEqual(report.trashCandidates.length, 2);
  });
});
