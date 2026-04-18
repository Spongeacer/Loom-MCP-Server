import { describe, it } from 'node:test';
import assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { discoverArtifacts } from '../binding-discovery.js';
import type { Entry } from '../types/index.js';

describe('binding-discovery', () => {
  const tmpDir = path.join(process.cwd(), '.tmp-test-binding-discovery');

  it('discovers new artifacts from files', () => {
    if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });
    const filePath = path.join(tmpDir, 'new-file.ts');
    fs.writeFileSync(filePath, 'export const x = 1;');

    const existing: Entry[] = [];
    const { entries, bindings } = discoverArtifacts([filePath], existing, tmpDir);

    assert.strictEqual(entries.length, 1);
    assert.strictEqual(entries[0].type, 'Artifact');
    assert.ok((entries[0] as any).artifact.path.includes('new-file.ts'));
    assert.strictEqual(bindings.length, 0); // no non-artifact entries to match
  });

  it('creates L0 bindings for matching activation paths', () => {
    if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });
    const filePath = path.join(tmpDir, 'src', 'utils.ts');
    fs.mkdirSync(path.join(tmpDir, 'src'), { recursive: true });
    fs.writeFileSync(filePath, 'export const util = 1;');

    const rule: Entry = {
      id: 'rule-1', type: 'Rule', version: 1, namespace: 'project',
      content: { l1_5: 'test', l2: 'test', l3: 'test' },
      lifecycle: { state: 'active', created: new Date().toISOString(), updated: new Date().toISOString(), last_accessed: new Date().toISOString(), last_activated: new Date().toISOString(), activation_count: 0, verification_count: 0, promoted_from: null, demotion_reason: null },
      quality: { freshness: 1, trust: 1, activity: 1, composite_score: 1 },
      trust: { level: 'trusted', source: 'human' },
      activation: { paths: ['src/utils.ts'], keywords: [], intents: [], tools: [], entry_refs: [] },
      conflicts: { supersedes: [], conflicts_with: [], overridden_by: null, precedence: 0, resolution_policy: 'newest_wins' },
      bindings_out: [], bindings_in: [],
    };

    const { entries, bindings } = discoverArtifacts([filePath], [rule], tmpDir);
    assert.strictEqual(entries.length, 1);
    assert.strictEqual(bindings.length, 1);
    assert.strictEqual(bindings[0].source, 'rule-1');
    assert.strictEqual(bindings[0].relationship, 'governs');
  });
});
