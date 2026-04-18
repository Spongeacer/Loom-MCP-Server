import { describe, it } from 'node:test';
import assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { runHealthAnalysis } from '../health-analyzer.js';
import type { ArtifactEntry, Binding, Entry } from '../types/index.js';

describe('health-analyzer', () => {
  function makeArtifact(id: string, path: string, exists: boolean, hash: string = ''): ArtifactEntry {
    const now = new Date().toISOString();
    return {
      id, type: 'Artifact', version: 1, namespace: 'project',
      content: { l1_5: path, l2: path, l3: path },
      lifecycle: { state: 'active', created: now, updated: now, last_accessed: now, last_activated: now, activation_count: 0, verification_count: 0, promoted_from: null, demotion_reason: null },
      quality: { freshness: 1, trust: 1, activity: 1, composite_score: 1 },
      trust: { level: 'trusted', source: 'human' },
      activation: { paths: [path], keywords: [], intents: [], tools: [], entry_refs: [] },
      conflicts: { supersedes: [], conflicts_with: [], overridden_by: null, precedence: 0, resolution_policy: 'newest_wins' },
      bindings_out: [], bindings_in: [],
      artifact: {
        path, category: 'source_code', file_type: 'ts', granularity: 'file', symbol: null,
        span: { start_line: null, end_line: null }, line_count: 1, last_modifier: 'agent',
        content_hash: hash, summary_hash: '',
        fs: { last_modified_at: now, last_seen_at: now, size_bytes: 0, exists },
        deps: { imports: [], imported_by: [] },
        health: { status: 'healthy', score: 1, reasons: [], suggested_action: 'keep' },
      },
    };
  }

  it('marks missing files as missing', () => {
    const artifacts = [makeArtifact('art-1', 'missing.ts', false)];
    const report = runHealthAnalysis(artifacts, [], [], '/tmp');
    assert.strictEqual(report.artifacts[0].artifact.health.status, 'missing');
    assert.strictEqual(report.artifacts[0].artifact.health.suggested_action, 'delete');
  });

  it('marks legacy filenames as legacy', () => {
    const artifacts = [makeArtifact('art-1', 'old_backup.ts', true)];
    const report = runHealthAnalysis(artifacts, [], [], '/tmp');
    assert.strictEqual(report.artifacts[0].artifact.health.status, 'legacy');
  });

  it('detects redundant content', () => {
    const tmpDir = path.join(process.cwd(), '.tmp-test-redundant');
    if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });
    fs.writeFileSync(path.join(tmpDir, 'a.ts'), 'same content');
    fs.writeFileSync(path.join(tmpDir, 'b.ts'), 'same content');
    const artifacts = [
      makeArtifact('art-1', 'a.ts', true, 'samehash'),
      makeArtifact('art-2', 'b.ts', true, 'samehash'),
    ];
    // Add a binding so artifacts are not flagged as orphan before redundant check
    const binding: import('../types/index.js').Binding = {
      source: 'art-1', target: 'art-2', relationship: 'depends_on', directionality: 'forward', status: 'active',
      confidence: 1, confidence_model: { base: 1, freshness_factor: 1, evidence_weight: 1, usage_boost: 1, drift_penalty: 0 },
      evidence: [], decay: { half_life_days: 30, last_reconfirmed: new Date().toISOString() },
      invalidation: { invalidated_by: null, reason: null }, verification_history: [],
    };
    const report = runHealthAnalysis(artifacts, [binding], [], tmpDir);
    const statuses = report.artifacts.map((a) => a.artifact.health.status);
    assert.ok(statuses.includes('redundant'));
  });

  it('detects orphan files', () => {
    const artifacts = [makeArtifact('art-1', 'orphan.ts', true)];
    const report = runHealthAnalysis(artifacts, [], [], '/tmp');
    assert.strictEqual(report.artifacts[0].artifact.health.status, 'orphan');
  });

  it('does not mark node_modules as orphan', () => {
    const artifacts = [makeArtifact('art-1', 'node_modules/foo.ts', true)];
    const report = runHealthAnalysis(artifacts, [], [], '/tmp');
    assert.strictEqual(report.artifacts[0].artifact.health.status, 'healthy');
  });
});
