import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { discoverArtifacts } from '../core/binding-discovery.js';
import type { Entry } from '../types/index.js';

const FIXTURES = path.join(os.tmpdir(), 'loom-fixtures-discovery');

function makeRule(id: string, paths: string[]): Entry {
  return {
    id,
    type: 'Rule',
    version: 1,
    namespace: 'project',
    content: { l1_5: 'rule', l2: 'rule desc', l3: 'rule detail' },
    lifecycle: { state: 'active', created: new Date().toISOString(), updated: new Date().toISOString(), last_accessed: new Date().toISOString(), last_activated: new Date().toISOString(), activation_count: 1, verification_count: 0, promoted_from: null, demotion_reason: null },
    quality: { freshness: 1, trust: 0.9, activity: 1, composite_score: 0.95 },
    trust: { level: 'verified', source: 'human' },
    activation: { paths, keywords: [], intents: [], tools: [], entry_refs: [] },
    conflicts: { supersedes: [], conflicts_with: [], overridden_by: null, precedence: 0, resolution_policy: 'newest_wins' },
    bindings_out: [],
    bindings_in: [],
  };
}

before(() => {
  fs.rmSync(FIXTURES, { recursive: true, force: true });
  fs.mkdirSync(path.join(FIXTURES, 'sub'), { recursive: true });
  fs.writeFileSync(path.join(FIXTURES, 'sub', 'file.ts'), 'export const x = 1;\n');
});

after(() => {
  fs.rmSync(FIXTURES, { recursive: true, force: true });
});

describe('discoverArtifacts', () => {
  it('creates new artifact entries for unknown files', () => {
    const changedFiles = [path.join(FIXTURES, 'sub', 'file.ts')];
    const { entries, bindings } = discoverArtifacts(changedFiles, [], FIXTURES);

    assert.strictEqual(entries.length, 1);
    assert(entries[0].id.startsWith('art-'));
    assert.strictEqual(entries[0].artifact.path, 'sub/file.ts');
    assert.strictEqual(entries[0].artifact.category, 'source_code');
    assert(entries[0].artifact.fs.exists);
    assert.strictEqual(bindings.length, 0);
  });

  it('updates existing artifact entries instead of duplicating', () => {
    const changedFiles = [path.join(FIXTURES, 'sub', 'file.ts')];
    const existing = discoverArtifacts(changedFiles, [], FIXTURES).entries[0];
    existing.artifact.fs.exists = false;

    const { entries, bindings } = discoverArtifacts(changedFiles, [existing], FIXTURES);
    assert.strictEqual(entries.length, 1);
    assert.strictEqual(entries[0].id, existing.id);
    assert(entries[0].artifact.fs.exists);
    assert.strictEqual(bindings.length, 0);
  });

  it('creates Level 0 bindings for matching activation paths', () => {
    const changedFiles = [path.join(FIXTURES, 'sub', 'file.ts')];
    const rule = makeRule('rule-auth', ['sub/**']);
    const { entries, bindings } = discoverArtifacts(changedFiles, [rule], FIXTURES);

    assert.strictEqual(entries.length, 1);
    assert.strictEqual(bindings.length, 1);
    assert.strictEqual(bindings[0].source, 'rule-auth');
    assert.strictEqual(bindings[0].target, entries[0].id);
    assert.strictEqual(bindings[0].relationship, 'governs');
    assert(entries[0].bindings_in.some(b => b.source === 'rule-auth'));
  });

  it('does not create binding when path does not match', () => {
    const changedFiles = [path.join(FIXTURES, 'sub', 'file.ts')];
    const rule = makeRule('rule-other', ['other/**']);
    const { bindings } = discoverArtifacts(changedFiles, [rule], FIXTURES);
    assert.strictEqual(bindings.length, 0);
  });

  it('categorizes config and docs correctly', () => {
    const configFile = path.join(FIXTURES, 'app.config.ts');
    const docFile = path.join(FIXTURES, 'readme.md');
    fs.writeFileSync(configFile, '{}\n');
    fs.writeFileSync(docFile, '# Hello\n');

    const { entries } = discoverArtifacts([configFile, docFile], [], process.cwd());
    assert.strictEqual(entries.length, 2);
    const configArt = entries.find(e => e.artifact.path.endsWith('app.config.ts'));
    const docArt = entries.find(e => e.artifact.path.endsWith('readme.md'));
    assert(configArt);
    assert(docArt);
    assert.strictEqual(configArt!.artifact.category, 'config');
    assert.strictEqual(docArt!.artifact.category, 'docs');

    fs.unlinkSync(configFile);
    fs.unlinkSync(docFile);
  });
});
