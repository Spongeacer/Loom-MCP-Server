import { describe, it } from 'node:test';
import assert from 'node:assert';
import * as path from 'node:path';
import { getPaths } from '../core/paths.js';

describe('paths', () => {
  it('returns correct paths under .loom', () => {
    const cwd = '/tmp/demo-project';
    const paths = getPaths(cwd);

    assert.strictEqual(paths.root, '/tmp/demo-project/.loom');
    assert.strictEqual(paths.entries, '/tmp/demo-project/.loom/entries');
    assert.strictEqual(paths.entriesRules, '/tmp/demo-project/.loom/entries/rules');
    assert.strictEqual(paths.entriesArtifacts, '/tmp/demo-project/.loom/entries/artifacts');
    assert.strictEqual(paths.bindings, '/tmp/demo-project/.loom/bindings');
    assert.strictEqual(paths.cache, '/tmp/demo-project/.loom/cache');
    assert.strictEqual(paths.config, '/tmp/demo-project/.loom/config.yml');
    assert.strictEqual(paths.activePrompt, '/tmp/demo-project/.loom/cache/active-prompt.txt');
  });

  it('defaults to process.cwd()', () => {
    const paths = getPaths();
    assert(paths.root.endsWith('.loom'));
    assert.strictEqual(paths.root, path.join(process.cwd(), '.loom'));
  });
});
