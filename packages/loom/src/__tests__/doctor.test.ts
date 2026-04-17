import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { runDoctor } from '../core/doctor.js';
import { initWorkspace } from '../core/store.js';
import { drainWalAsync } from '../core/wal-queue.js';

describe('doctor', () => {
  let tmpDir: string;

  before(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'loom-doctor-'));
  });

  after(async () => {
    await drainWalAsync();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('reports critical when watch daemon runner is missing', () => {
    fs.mkdirSync(path.join(tmpDir, 'packages', 'loom', 'src'), { recursive: true });
    fs.mkdirSync(path.join(tmpDir, 'packages', 'loom', 'dist'), { recursive: true });
    initWorkspace('test', tmpDir);

    const results = runDoctor(tmpDir);
    const runnerResult = results.find(r => r.message.includes('Watch daemon runner'));
    assert(runnerResult);
    // When loom is globally installed, the runner may be resolved from the
    // installed package root rather than the project root, in which case the
    // check should pass.
    const { getLoomPackageRoot } = require('../core/constants.js');
    const loomRoot = getLoomPackageRoot();
    const globalRunner = loomRoot
      ? fs.existsSync(path.join(loomRoot, 'dist', 'core', 'watch-daemon-runner.js'))
      : false;
    const localRunner = fs.existsSync(path.join(tmpDir, 'packages', 'loom', 'dist', 'core', 'watch-daemon-runner.js'));
    if (localRunner || globalRunner) {
      assert.strictEqual(runnerResult.level, 'ok');
    } else {
      assert.strictEqual(runnerResult.level, 'critical');
    }
  });

  it('reports ok when runner exists and build is fresh', () => {
    fs.mkdirSync(path.join(tmpDir, 'packages', 'loom', 'src'), { recursive: true });
    fs.mkdirSync(path.join(tmpDir, 'packages', 'loom', 'dist', 'core'), { recursive: true });
    fs.writeFileSync(path.join(tmpDir, 'packages', 'loom', 'dist', 'core', 'watch-daemon-runner.js'), '');
    initWorkspace('test', tmpDir);

    const results = runDoctor(tmpDir);
    const runnerResult = results.find(r => r.message.includes('Watch daemon runner'));
    assert(runnerResult);
    assert.strictEqual(runnerResult.level, 'ok');
  });

  it('detects stale hardcoded paths in source', () => {
    fs.mkdirSync(path.join(tmpDir, 'packages', 'loom', 'src'), { recursive: true });
    fs.writeFileSync(path.join(tmpDir, 'packages', 'loom', 'src', 'bad.ts'), 'const x = packages.sdp;');
    fs.mkdirSync(path.join(tmpDir, 'packages', 'loom', 'dist', 'core'), { recursive: true });
    fs.writeFileSync(path.join(tmpDir, 'packages', 'loom', 'dist', 'core', 'watch-daemon-runner.js'), '');
    initWorkspace('test', tmpDir);

    const results = runDoctor(tmpDir);
    const staleResult = results.find(r => r.message.includes('stale hardcoded paths'));
    assert(staleResult);
    assert.strictEqual(staleResult.level, 'critical');
    assert(staleResult.message.includes('packages.sdp'));
  });

  it('detects legacy .sdp naming in entries', () => {
    fs.mkdirSync(path.join(tmpDir, 'packages', 'loom', 'src'), { recursive: true });
    fs.mkdirSync(path.join(tmpDir, 'packages', 'loom', 'dist', 'core'), { recursive: true });
    fs.writeFileSync(path.join(tmpDir, 'packages', 'loom', 'dist', 'core', 'watch-daemon-runner.js'), '');
    initWorkspace('test', tmpDir);
    fs.writeFileSync(path.join(tmpDir, '.loom', 'entries', 'rules', 'old.sdp.yml'), '');

    const results = runDoctor(tmpDir);
    const legacyResult = results.find(r => r.message.includes('Legacy naming'));
    assert(legacyResult);
    assert.strictEqual(legacyResult.level, 'warning');
  });

  it('detects version drift between package.json and config', () => {
    fs.mkdirSync(path.join(tmpDir, 'packages', 'loom', 'src'), { recursive: true });
    fs.mkdirSync(path.join(tmpDir, 'packages', 'loom', 'dist', 'core'), { recursive: true });
    fs.writeFileSync(path.join(tmpDir, 'packages', 'loom', 'dist', 'core', 'watch-daemon-runner.js'), '');
    fs.writeFileSync(path.join(tmpDir, 'packages', 'loom', 'package.json'), JSON.stringify({ version: '0.2.0' }));
    initWorkspace('test', tmpDir);
    // Override config version to create drift
    fs.writeFileSync(path.join(tmpDir, '.loom', 'config.yml'), 'version: 0.1.0\nproject_name: test\ninitialized_at: 2024-01-01T00:00:00Z\ndefault_namespace: project\n');

    const results = runDoctor(tmpDir);
    const driftResult = results.find(r => r.message.includes('Version drift'));
    assert(driftResult);
    assert.strictEqual(driftResult.level, 'warning');
  });
});
