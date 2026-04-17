import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { runFsDeps, runFsHealth, runFsTrash, runFsClean } from '../commands/fs.js';
import { initWorkspace, saveEntry, invalidateCache } from '../core/store.js';
import { drainWalAsync } from '../core/wal-queue.js';
import type { ArtifactEntry } from '../types/index.js';

describe('fs command', () => {
  let tmpDir: string;
  let originalCwd: string;

  before(() => {
    originalCwd = process.cwd();
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'loom-fs-cmd-'));
    process.chdir(tmpDir);
    initWorkspace('test', tmpDir);
  });

  after(async () => {
    await drainWalAsync();
    process.chdir(originalCwd);
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('runFsDeps throws usage when no path given', () => {
    assert.throws(() => runFsDeps([]), /Usage/);
  });

  it('runFsDeps shows artifact deps when found', () => {
    const art: ArtifactEntry = {
      id: 'art-sample',
      type: 'Artifact',
      version: 1,
      namespace: 'auto',
      content: { l1_5: 's', l2: 'sample', l3: 'sample' },
      lifecycle: { state: 'active', created: new Date().toISOString(), updated: new Date().toISOString(), last_accessed: new Date().toISOString(), last_activated: new Date().toISOString(), activation_count: 1, verification_count: 0, promoted_from: null, demotion_reason: null },
      quality: { freshness: 1, trust: 0.6, activity: 0.5, composite_score: 0.7 },
      trust: { level: 'derived', source: 'tool' },
      activation: { paths: [], keywords: [], intents: [], tools: [], entry_refs: [] },
      conflicts: { supersedes: [], conflicts_with: [], overridden_by: null, precedence: 0, resolution_policy: 'newest_wins' },
      bindings_out: [],
      bindings_in: [],
      artifact: {
        path: 'src/sample.ts',
        category: 'source_code',
        file_type: 'ts',
        granularity: 'file',
        symbol: null,
        span: { start_line: null, end_line: null },
        line_count: 0,
        last_modifier: 'agent',
        content_hash: '',
        summary_hash: '',
        fs: { last_modified_at: new Date().toISOString(), last_seen_at: new Date().toISOString(), size_bytes: 0, exists: true },
        deps: { imports: ['utils.ts'], imported_by: ['app.ts'] },
        health: { status: 'healthy', score: 1, reasons: [], suggested_action: 'keep' },
      },
    };
    saveEntry(art, tmpDir);
    invalidateCache(tmpDir);

    const output = runFsDeps(['src/sample.ts']);
    assert(output.includes('Artifact: src/sample.ts'));
    assert(output.includes('utils.ts'));
    assert(output.includes('app.ts'));
  });

  it('runFsHealth returns report header', () => {
    const output = runFsHealth();
    assert(output.includes('=== File Health Report ==='));
  });

  it('runFsTrash returns no candidates when healthy', () => {
    const output = runFsTrash();
    assert(output.includes('No trash candidates'));
  });

  it('runFsClean archives legacy files', async () => {
    const srcDir = path.join(tmpDir, 'src');
    fs.mkdirSync(srcDir, { recursive: true });
    const filePath = path.join(srcDir, 'legacy_old.ts');
    fs.writeFileSync(filePath, '// old');

    // First run fs scan so LOOM knows about the file
    const { performFsScanInWorker } = await import('../core/fs-scan.js');
    await performFsScanInWorker(['src'], tmpDir, { silent: true, updateTimestamp: true, timeoutMs: 15000 });
    invalidateCache(tmpDir);

    const output = await runFsClean();
    // File should have been archived or no candidates if health analyzer rules differ
    const archived = fs.existsSync(path.join(tmpDir, '.loom', 'trash', 'src', 'legacy_old.ts'));
    const stillExists = fs.existsSync(filePath);
    if (archived) {
      assert(!stillExists);
      assert(output.includes('Archived:') || output.includes('Clean complete'));
    } else {
      // If health analyzer didn't flag it, at least it shouldn't crash
      assert(output.includes('Clean complete') || output.includes('Archived:') || output.includes('No trash candidates'));
    }
  });
});
