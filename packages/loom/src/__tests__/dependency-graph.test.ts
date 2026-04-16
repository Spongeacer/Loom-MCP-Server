import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { buildDependencyGraph, updateDependencyGraphIncremental } from '../core/dependency-graph.js';
import type { ArtifactEntry } from '../types/index.js';

const FIXTURES = path.join(os.tmpdir(), 'loom-fixtures-graph');

function createArtifact(id: string, fileName: string): ArtifactEntry {
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
      file_type: path.extname(fileName).replace('.', '') || 'ts',
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
}

before(() => {
  fs.rmSync(FIXTURES, { recursive: true, force: true });
  fs.mkdirSync(path.join(FIXTURES, 'utils'), { recursive: true });
  fs.writeFileSync(path.join(FIXTURES, 'a.ts'), "import { helper } from './utils/helper';\nexport const foo = 1;\n");
  fs.writeFileSync(path.join(FIXTURES, 'b.ts'), "import { foo } from './a';\nexport const bar = foo + 1;\n");
  fs.writeFileSync(path.join(FIXTURES, 'utils', 'helper.ts'), 'export function helper() {}\n');
  fs.writeFileSync(path.join(FIXTURES, 'c.py'), 'import os\n');
});

after(() => {
  fs.rmSync(FIXTURES, { recursive: true, force: true });
});

describe('buildDependencyGraph', () => {
  it('resolves TS imports and creates bindings', () => {
    const artifacts = [
      createArtifact('art-a', 'a.ts'),
      createArtifact('art-b', 'b.ts'),
      createArtifact('art-utils', 'utils/helper.ts'),
      createArtifact('art-c', 'c.py'),
    ];

    const { bindings } = buildDependencyGraph(artifacts, FIXTURES);

    assert.strictEqual(artifacts[0].artifact.deps.imports.length, 1);
    assert(artifacts[0].artifact.deps.imports[0].includes('utils/helper.ts'));

    assert.strictEqual(artifacts[1].artifact.deps.imports.length, 1);
    assert(artifacts[1].artifact.deps.imports[0].includes('a.ts'));

    assert.strictEqual(artifacts[2].artifact.deps.imported_by.length, 1);
    assert(artifacts[2].artifact.deps.imported_by[0].includes('a.ts'));

    const bindingPairs = bindings.map(b => [b.source, b.target].sort().join('-'));
    assert(bindingPairs.some(id => id.includes('art-a') && id.includes('art-utils')));
    assert(bindingPairs.some(id => id.includes('art-b') && id.includes('art-a')));
  });

  it('handles Python files without local bindings for bare modules', () => {
    const artifacts = [
      createArtifact('art-c', 'c.py'),
    ];

    const { bindings } = buildDependencyGraph(artifacts, FIXTURES);
    assert.strictEqual(bindings.length, 0);
    assert.strictEqual(artifacts[0].artifact.deps.imports.length, 0);
  });
});

describe('updateDependencyGraphIncremental', () => {
  it('removes stale imports and adds new ones', () => {
    const artifacts = [
      createArtifact('art-a', 'a.ts'),
      createArtifact('art-b', 'b.ts'),
      createArtifact('art-utils', 'utils/helper.ts'),
    ];

    buildDependencyGraph(artifacts, FIXTURES);
    assert(artifacts[1].artifact.deps.imports.some(p => p.includes('a.ts')));

    fs.writeFileSync(path.join(FIXTURES, 'b.ts'), "import { helper } from './utils/helper';\nexport const bar = 2;\n");

    const result = updateDependencyGraphIncremental([artifacts[1]], artifacts, FIXTURES);

    assert(!artifacts[1].artifact.deps.imports.some(p => p.includes('a.ts')));
    assert(artifacts[1].artifact.deps.imports.some(p => p.includes('utils/helper.ts')));

    assert(result.removedBindingIds.some(id => id.includes('art-b') && id.includes('art-a')));
    assert(result.bindings.some(b => b.source === 'art-b' && b.target === 'art-utils'));
  });
});
