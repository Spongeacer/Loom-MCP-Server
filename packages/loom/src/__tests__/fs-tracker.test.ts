import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { scanProjectFiles, getFsMeta, updateArtifactsFs, getRecentlyModifiedArtifacts } from '../core/fs-tracker.js';
import type { ArtifactEntry } from '../types/index.js';

const FIXTURES = path.join(os.tmpdir(), 'loom-fixtures-tracker');

function makeArtifact(relPath: string, exists: boolean): ArtifactEntry {
  return {
    id: `art-${relPath.replace(/[^a-zA-Z0-9]+/g, '-')}`,
    type: 'Artifact',
    version: 1,
    namespace: 'auto',
    content: { l1_5: path.basename(relPath), l2: relPath, l3: { file: relPath } },
    lifecycle: { state: 'active', created: new Date().toISOString(), updated: new Date().toISOString(), last_accessed: new Date().toISOString(), last_activated: new Date().toISOString(), activation_count: 1, verification_count: 0, promoted_from: null, demotion_reason: null },
    quality: { freshness: 1, trust: 0.6, activity: 0.5, composite_score: 0.7 },
    trust: { level: 'derived', source: 'tool' },
    activation: { paths: [relPath], keywords: [], intents: [], tools: [], entry_refs: [] },
    conflicts: { supersedes: [], conflicts_with: [], overridden_by: null, precedence: 0, resolution_policy: 'newest_wins' },
    bindings_out: [],
    bindings_in: [],
    artifact: {
      path: relPath,
      category: 'source_code',
      file_type: path.extname(relPath).replace('.', '') || 'ts',
      granularity: 'file',
      symbol: null,
      span: { start_line: null, end_line: null },
      line_count: 0,
      last_modifier: 'agent',
      content_hash: '',
      summary_hash: '',
      fs: { last_modified_at: new Date(0).toISOString(), last_seen_at: new Date(0).toISOString(), size_bytes: 0, exists },
      deps: { imports: [], imported_by: [] },
      health: { status: 'healthy', score: 1, reasons: [], suggested_action: 'keep' },
    },
  };
}

before(() => {
  fs.rmSync(FIXTURES, { recursive: true, force: true });
  fs.mkdirSync(path.join(FIXTURES, 'nested'), { recursive: true });
  fs.writeFileSync(path.join(FIXTURES, 'a.ts'), 'export const a = 1;\n');
  fs.writeFileSync(path.join(FIXTURES, 'nested', 'b.ts'), 'export const b = 2;\n');
});

after(() => {
  fs.rmSync(FIXTURES, { recursive: true, force: true });
});

describe('fs-tracker', () => {
  it('scanProjectFiles discovers files recursively', () => {
    const files = scanProjectFiles([FIXTURES], FIXTURES);
    assert(files.some(f => f.endsWith('a.ts')));
    assert(files.some(f => f.endsWith('nested/b.ts')));
    assert(!files.some(f => f.includes('node_modules')));
  });

  it('scanProjectFiles skips non-existent dirs', () => {
    const files = scanProjectFiles([path.join(FIXTURES, 'does-not-exist')], FIXTURES);
    assert.strictEqual(files.length, 0);
  });

  it('getFsMeta returns valid info for existing file', () => {
    const meta = getFsMeta(path.join(FIXTURES, 'a.ts'));
    assert(meta.exists);
    assert(meta.size_bytes > 0);
    assert(new Date(meta.last_modified_at).getTime() > 0);
  });

  it('getFsMeta returns missing for non-existent file', () => {
    const meta = getFsMeta(path.join(FIXTURES, 'no-file.ts'));
    assert(!meta.exists);
    assert.strictEqual(meta.size_bytes, 0);
  });

  it('updateArtifactsFs marks present and missing files correctly', () => {
    const artifacts = [
      makeArtifact('a.ts', false),
      makeArtifact('ghost.ts', false),
    ];
    const { artifacts: updated, missing } = updateArtifactsFs(artifacts, [FIXTURES], FIXTURES);

    assert(updated[0].artifact.fs.exists);
    assert(!updated[1].artifact.fs.exists);
    assert.strictEqual(missing.length, 1);
    assert.strictEqual(missing[0].id, updated[1].id);
  });

  it('getRecentlyModifiedArtifacts returns latest first', async () => {
    const artA = makeArtifact('a.ts', true);
    const artB = makeArtifact('nested/b.ts', true);

    await new Promise(r => setTimeout(r, 50));
    fs.utimesSync(path.join(FIXTURES, 'nested', 'b.ts'), new Date(), new Date());

    artA.artifact.fs = getFsMeta(path.join(FIXTURES, 'a.ts'));
    artB.artifact.fs = getFsMeta(path.join(FIXTURES, 'nested', 'b.ts'));

    const recent = getRecentlyModifiedArtifacts([artA, artB], 1);
    assert.strictEqual(recent.length, 1);
    assert.strictEqual(recent[0].id, artB.id);
  });
});
