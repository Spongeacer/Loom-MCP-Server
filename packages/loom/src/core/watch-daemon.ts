import * as cp from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { getPaths } from './paths.js';

interface WatchStatus {
  running: boolean;
  pid?: number;
  dirs?: string[];
}

function getPidFile(cwd?: string): string {
  return getPaths(cwd).root + '/cache/watch-pid.txt';
}

function getDirsFile(cwd?: string): string {
  return getPaths(cwd).root + '/cache/watch-dirs.txt';
}

export function getWatchStatus(cwd?: string): WatchStatus {
  const pidFile = getPidFile(cwd);
  if (!fs.existsSync(pidFile)) {
    return { running: false };
  }
  const pid = parseInt(fs.readFileSync(pidFile, 'utf-8').trim(), 10);
  if (isNaN(pid)) {
    return { running: false };
  }
  try {
    process.kill(pid, 0);
    const dirsFile = getDirsFile(cwd);
    const dirs = fs.existsSync(dirsFile) ? fs.readFileSync(dirsFile, 'utf-8').trim().split('\n').filter(Boolean) : [];
    return { running: true, pid, dirs };
  } catch (err) {
    try { fs.unlinkSync(pidFile); } catch {}
    return { running: false };
  }
}

export function stopWatchDaemon(cwd?: string): string {
  const status = getWatchStatus(cwd);
  if (!status.running || !status.pid) {
    return 'Watch daemon is not running.';
  }
  try {
    process.kill(status.pid, 'SIGTERM');
    const pidFile = getPidFile(cwd);
    if (fs.existsSync(pidFile)) fs.unlinkSync(pidFile);
    return `Watch daemon stopped (pid: ${status.pid}).`;
  } catch (e: any) {
    return `Failed to stop watch daemon: ${e.message}`;
  }
}

export function startWatchDaemon(dirs: string[], cwd?: string): string {
  const projectRoot = cwd || process.cwd();
  const status = getWatchStatus(projectRoot);
  if (status.running) {
    return `Watch daemon already running (pid: ${status.pid}). Dirs: ${status.dirs?.join(', ')}`;
  }

  const scriptPath = path.resolve(projectRoot, 'packages/loom/dist/core/watch-daemon-runner.js');
  const actualScript = fs.existsSync(scriptPath)
    ? scriptPath
    : path.resolve(projectRoot, 'dist/core/watch-daemon-runner.js');

  if (!fs.existsSync(actualScript)) {
    return `Watch daemon runner not found at ${actualScript}`;
  }

  const child = cp.spawn('node', [actualScript, ...dirs], {
    detached: true,
    stdio: 'ignore',
    cwd: projectRoot,
  });
  child.unref();

  const pidFile = getPidFile(projectRoot);
  const dirsFile = getDirsFile(projectRoot);
  fs.writeFileSync(pidFile, String(child.pid));
  fs.writeFileSync(dirsFile, dirs.join('\n'));

  return `Watch daemon started (pid: ${child.pid}). Watching: ${dirs.join(', ')}`;
}
