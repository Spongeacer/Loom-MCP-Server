import { describe, it } from 'node:test';
import assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { buildDependencyGraph } from '../dependency-graph.js';
import type { ArtifactEntry } from '../types/index.js';

describe('dependency-graph', () => {
  const tmpDir = path.join(process.cwd(), '.tmp-test-deps');

  function makeArtifact(id: string, filePath: string, content: string): ArtifactEntry {
    const now = new Date().toISOString();
    return {
      id, type: 'Artifact', version: 1, namespace: 'project',
      content: { l1_5: filePath, l2: filePath, l3: filePath },
      lifecycle: { state: 'active', created: now, updated: now, last_accessed: now, last_activated: now, activation_count: 0, verification_count: 0, promoted_from: null, demotion_reason: null },
      quality: { freshness: 1, trust: 1, activity: 1, composite_score: 1 },
      trust: { level: 'trusted', source: 'human' },
      activation: { paths: [filePath], keywords: [], intents: [], tools: [], entry_refs: [] },
      conflicts: { supersedes: [], conflicts_with: [], overridden_by: null, precedence: 0, resolution_policy: 'newest_wins' },
      bindings_out: [], bindings_in: [],
      artifact: {
        path: filePath, category: 'source_code', file_type: 'ts', granularity: 'file', symbol: null,
        span: { start_line: null, end_line: null }, line_count: 1, last_modifier: 'agent',
        content_hash: '', summary_hash: '',
        fs: { last_modified_at: now, last_seen_at: now, size_bytes: content.length, exists: true },
        deps: { imports: [], imported_by: [] },
        health: { status: 'healthy', score: 1, reasons: [], suggested_action: 'keep' },
      },
    };
  }

  it('extracts JS/TS imports and creates bindings', () => {
    safeMkdir(tmpDir);
    fs.writeFileSync(path.join(tmpDir, 'a.ts'), "import { foo } from './b';\n");
    fs.writeFileSync(path.join(tmpDir, 'b.ts'), 'export const foo = 1;\n');

    const artifacts = [
      makeArtifact('art-a', 'a.ts', "import { foo } from './b';"),
      makeArtifact('art-b', 'b.ts', 'export const foo = 1;'),
    ];

    const { bindings } = buildDependencyGraph(artifacts, tmpDir);
    assert.strictEqual(bindings.length, 1);
    assert.strictEqual(bindings[0].source, 'art-a');
    assert.strictEqual(bindings[0].target, 'art-b');
    assert.strictEqual(bindings[0].relationship, 'depends_on');
  });

  it('ignores imports that do not resolve to tracked artifacts', () => {
    safeMkdir(tmpDir);
    fs.writeFileSync(path.join(tmpDir, 'c.ts'), "import fs from 'node:fs';\n");

    const artifacts = [makeArtifact('art-c', 'c.ts', "import fs from 'node:fs';")];
    const { bindings } = buildDependencyGraph(artifacts, tmpDir);
    assert.strictEqual(bindings.length, 0);
  });
});

function safeMkdir(dir: string) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}
