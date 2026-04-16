import * as cp from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as net from 'node:net';
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
    const health = JSON.parse(fs.readFileSync(healthFile, 'utf-8'));
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
  try {
    process.kill(pid, 0);
    if (!isWatchDaemonHealthy(cwd)) {
      try { fs.unlinkSync(pidFile); } catch { /* ignore */ }
      return { running: false };
    }
    const dirsFile = getDirsFile(cwd);
    const dirs = fs.existsSync(dirsFile) ? fs.readFileSync(dirsFile, 'utf-8').trim().split('\n').filter(Boolean) : [];
    return { running: true, pid, dirs };
  } catch {
    try { fs.unlinkSync(pidFile); } catch { /* ignore */ }
    return { running: false };
  }
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
  try {
    process.kill(pid, 0);
  } catch {
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
      try { fs.unlinkSync(pidFile); } catch { /* ignore */ }
      try { fs.unlinkSync(socketPath); } catch { /* ignore */ }
      return { running: false };
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

  return `Watch daemon started (pid: ${child.pid}). Watching: ${dirs.join(', ')}`;
}

export function ensureWatchDaemon(dirs: string[] = ['src', 'tests', 'packages'], cwd?: string): string {
  const status = getWatchStatus(cwd);
  if (status.running) {
    return `Watch daemon already running (pid: ${status.pid}). Dirs: ${status.dirs?.join(', ')}`;
  }
  return startWatchDaemon(dirs, cwd);
}
