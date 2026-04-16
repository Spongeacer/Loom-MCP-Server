import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { runFsDeps, runFsHealth, runFsTrash } from '../commands/fs.js';
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

  it('runFsDeps prints usage when no path given', () => {
    let output = '';
    const originalLog = console.log;
    console.log = (msg: string) => { output += msg + '\n'; };
    try {
      runFsDeps([]);
    } finally {
      console.log = originalLog;
    }
    assert(output.includes('Usage'));
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
        git_tracked: false,
        last_git_commit: null,
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

    let output = '';
    const originalLog = console.log;
    console.log = (msg: string) => { output += msg + '\n'; };
    try {
      runFsDeps(['src/sample.ts']);
    } finally {
      console.log = originalLog;
    }
    assert(output.includes('Artifact: src/sample.ts'));
    assert(output.includes('utils.ts'));
    assert(output.includes('app.ts'));
  });

  it('runFsHealth prints report header', () => {
    let output = '';
    const originalLog = console.log;
    console.log = (msg: string) => { output += msg + '\n'; };
    try {
      runFsHealth();
    } finally {
      console.log = originalLog;
    }
    assert(output.includes('=== File Health Report ==='));
  });

  it('runFsTrash prints no candidates when healthy', () => {
    let output = '';
    const originalLog = console.log;
    console.log = (msg: string) => { output += msg + '\n'; };
    try {
      runFsTrash();
    } finally {
      console.log = originalLog;
    }
    assert(output.includes('No trash candidates'));
  });
});
