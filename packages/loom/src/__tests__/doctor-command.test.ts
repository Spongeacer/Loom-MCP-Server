import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { runDoctorCommand } from '../commands/doctor.js';
import { initWorkspace } from '../core/store.js';
import { drainWalAsync } from '../core/wal-queue.js';

describe('doctor command', () => {
  let tmpDir: string;
  let originalCwd: string;

  before(() => {
    originalCwd = process.cwd();
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'loom-doctor-cmd-'));
    process.chdir(tmpDir);
  });

  after(async () => {
    await drainWalAsync();
    process.chdir(originalCwd);
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('prints All checks passed when everything ok', () => {
    fs.mkdirSync(path.join(tmpDir, 'packages', 'loom', 'src'), { recursive: true });
    fs.mkdirSync(path.join(tmpDir, 'packages', 'loom', 'dist', 'core'), { recursive: true });
    fs.writeFileSync(path.join(tmpDir, 'packages', 'loom', 'dist', 'core', 'watch-daemon-runner.js'), '');
    initWorkspace('test', tmpDir);
    fs.writeFileSync(path.join(tmpDir, 'packages', 'loom', 'package.json'), JSON.stringify({ version: '0.1.0' }));

    const output = runDoctorCommand();
    assert(output.includes('[OK]') || output.includes('All checks passed'));
  });
});
