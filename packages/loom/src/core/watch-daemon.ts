import * as cp from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as net from 'node:net';
import { getPaths } from './paths.js';
import { acquireLockSync, releaseLockSync, isProcessAlive } from './lock.js';

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

function getSocketPath(cwd?: string): string {
  return getPaths(cwd).root + '/cache/watch.sock';
}

function getHealthFile(cwd?: string): string {
  return getPaths(cwd).root + '/cache/watch-health.json';
}

function isWatchDaemonHealthy(cwd?: string): boolean {
  const healthFile = getHealthFile(cwd);
  if (!fs.existsSync(healthFile)) {
    return true; // backward compatibility: no health file means assume healthy
  }
  try {
    const health = JSON.parse(fs.readFileSync(healthFile, 'utf-8')) as { lastHeartbeat?: number; status?: string };
    const ageMs = Date.now() - (health.lastHeartbeat || 0);
    if (ageMs > 2 * 60 * 1000) return false; // no heartbeat for 2 minutes
    if (health.status === 'shutdown') return false;
    return true;
  } catch {
    return true;
  }
}

export function getWatchStatus(cwd?: string): WatchStatus {
  const pidFile = getPidFile(cwd);
  if (!fs.existsSync(pidFile)) {
    return { running: false };
  }
  const pid = parseInt(fs.readFileSync(pidFile, 'utf-8').trim(), 10);
  if (isNaN(pid)) {
    try { fs.unlinkSync(pidFile); } catch { /* ignore */ }
    return { running: false };
  }
  if (!isProcessAlive(pid)) {
    try { fs.unlinkSync(pidFile); } catch { /* ignore */ }
    return { running: false };
  }
  if (!isWatchDaemonHealthy(cwd)) {
    try { fs.unlinkSync(pidFile); } catch { /* ignore */ }
    return { running: false };
  }
  const dirsFile = getDirsFile(cwd);
  const dirs = fs.existsSync(dirsFile) ? fs.readFileSync(dirsFile, 'utf-8').trim().split('\n').filter(Boolean) : [];
  return { running: true, pid, dirs };
}

export async function getWatchStatusAsync(cwd?: string): Promise<WatchStatus> {
  const pidFile = getPidFile(cwd);
  if (!fs.existsSync(pidFile)) {
    return { running: false };
  }
  const pid = parseInt(fs.readFileSync(pidFile, 'utf-8').trim(), 10);
  if (isNaN(pid)) {
    return { running: false };
  }
  if (!isProcessAlive(pid)) {
    try { fs.unlinkSync(pidFile); } catch { /* ignore */ }
    return { running: false };
  }

  const socketPath = getSocketPath(cwd);
  if (fs.existsSync(socketPath)) {
    const alive = await new Promise<boolean>((resolve) => {
      const client = net.createConnection(socketPath);
      client.on('connect', () => { client.destroy(); resolve(true); });
      client.on('error', () => { resolve(false); });
      setTimeout(() => { client.destroy(); resolve(false); }, 500);
    });
    if (!alive) {
      // Socket is stale (daemon may still be starting or crashed).
      // Remove the stale socket file but keep the pid file; fall through
      // to the health-file check before declaring the daemon dead.
      try { fs.unlinkSync(socketPath); } catch { /* ignore */ }
    } else {
      // Socket answered: daemon is alive.
      const dirsFile = getDirsFile(cwd);
      const dirs = fs.existsSync(dirsFile) ? fs.readFileSync(dirsFile, 'utf-8').trim().split('\n').filter(Boolean) : [];
      return { running: true, pid, dirs };
    }
  }

  if (!isWatchDaemonHealthy(cwd)) {
    try { fs.unlinkSync(pidFile); } catch { /* ignore */ }
    return { running: false };
  }

  const dirsFile = getDirsFile(cwd);
  const dirs = fs.existsSync(dirsFile) ? fs.readFileSync(dirsFile, 'utf-8').trim().split('\n').filter(Boolean) : [];
  return { running: true, pid, dirs };
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
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return `Failed to stop watch daemon: ${message}`;
  }
}

export function startWatchDaemon(dirs: string[], cwd?: string): string {
  const projectRoot = cwd || process.cwd();
  const status = getWatchStatus(projectRoot);
  if (status.running) {
    return `Watch daemon already running (pid: ${status.pid}). Dirs: ${status.dirs?.join(', ')}`;
  }

  if (!acquireLockSync(projectRoot, 'watch-daemon-start')) {
    return 'Watch daemon start is already in progress in another process.';
  }

  // Double-check after acquiring lock
  const statusAfterLock = getWatchStatus(projectRoot);
  if (statusAfterLock.running) {
    releaseLockSync(projectRoot, 'watch-daemon-start');
    return `Watch daemon already running (pid: ${statusAfterLock.pid}). Dirs: ${statusAfterLock.dirs?.join(', ')}`;
  }

  // Resolve runner script: prefer local development paths, then fall back to
  // the globally-installed package directory (__dirname) so that global npm
  // installs work out of the box.
  const candidates = [
    path.resolve(projectRoot, 'packages/loom/dist/core/watch-daemon-runner.js'),
    path.resolve(projectRoot, 'dist/core/watch-daemon-runner.js'),
    path.join(__dirname, 'watch-daemon-runner.js'),
  ];
  const actualScript = candidates.find((p) => fs.existsSync(p));

  if (!actualScript) {
    releaseLockSync(projectRoot, 'watch-daemon-start');
    return 'Watch daemon runner not found.';
  }

  // Clear stale health file before starting fresh
  const healthFile = getHealthFile(projectRoot);
  if (fs.existsSync(healthFile)) {
    try { fs.unlinkSync(healthFile); } catch { /* ignore */ }
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

  releaseLockSync(projectRoot, 'watch-daemon-start');
  return `Watch daemon started (pid: ${child.pid}). Watching: ${dirs.join(', ')}`;
}

export function ensureWatchDaemon(dirs: string[] = ['src', 'tests', 'packages'], cwd?: string): string {
  const status = getWatchStatus(cwd);
  if (status.running) {
    return `Watch daemon already running (pid: ${status.pid}). Dirs: ${status.dirs?.join(', ')}`;
  }
  return startWatchDaemon(dirs, cwd);
}
