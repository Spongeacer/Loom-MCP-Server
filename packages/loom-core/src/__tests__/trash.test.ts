import { describe, it } from 'node:test';
import assert from 'node:assert';
import * as path from 'node:path';
import * as fs from 'node:fs';
import { saveToTrash, listTrash, findTrashFile, purgeTrash } from '../store/trash.js';
import { safeMkdir, safeUnlink } from '../utils/fs-safe.js';
import type { RuleEntry } from '../types/index.js';

describe('trash', () => {
  const trashDir = path.join(process.cwd(), '.tmp-test-trash');

  function makeEntry(id: string): RuleEntry {
    return {
      id,
      type: 'Rule',
      version: 1,
      namespace: 'project',
      content: { l1_5: 'test', l2: 'test', l3: 'test' },
      lifecycle: {
        state: 'active',
        created: new Date().toISOString(),
        updated: new Date().toISOString(),
        last_accessed: new Date().toISOString(),
        last_activated: new Date().toISOString(),
        activation_count: 0,
        verification_count: 0,
        promoted_from: null,
        demotion_reason: null,
      },
      quality: { freshness: 1, trust: 1, activity: 1, composite_score: 1 },
      trust: { level: 'trusted', source: 'human' },
      activation: { paths: [], keywords: [], intents: [], tools: [], entry_refs: [] },
      conflicts: { supersedes: [], conflicts_with: [], overridden_by: null, precedence: 0, resolution_policy: 'newest_wins' },
      bindings_out: [],
      bindings_in: [],
    };
  }

  it('saveToTrash creates a trash file', () => {
    safeMkdir(trashDir);
    // Clean up any previous test files
    for (const f of fs.readdirSync(trashDir)) safeUnlink(path.join(trashDir, f));

    const entry = makeEntry('rule-1');
    saveToTrash(trashDir, entry);
    const items = listTrash(trashDir);
    assert.strictEqual(items.length, 1);
    assert.strictEqual(items[0].id, 'rule-1');
    assert.strictEqual(items[0].type, 'Rule');
  });

  it('findTrashFile returns the correct path', () => {
    const filePath = findTrashFile(trashDir, 'rule-1');
    assert.ok(filePath);
    assert.ok(filePath!.endsWith('.trash.yml'));
  });

  it('purgeTrash removes expired items', () => {
    // Create a fake expired trash file
    const expiredRaw = `id: old-rule\ntype: Rule\ndeletedAt: 2020-01-01T00:00:00.000Z\nexpiresAt: 2020-01-02T00:00:00.000Z\nentry: {}`;
    fs.writeFileSync(path.join(trashDir, 'old-rule.2020-01-01T00:00:00.000Z.trash.yml'), expiredRaw);

    purgeTrash(trashDir, 30);
    const items = listTrash(trashDir);
    assert.strictEqual(items.every((i) => i.id !== 'old-rule'), true);
  });
});
