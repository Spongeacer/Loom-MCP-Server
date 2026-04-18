import * as fs from 'node:fs';
import * as path from 'node:path';
import { safeUnlink, readTextFile, atomicWriteFile } from './fs-safe.js';

export interface DaemonStatus {
  pid: number | null;
  healthy: boolean;
  startedAt: string | null;
}

/**
 * Write PID file and health timestamp file for a background daemon.
 */
export function writePidFile(pidPath: string, healthPath: string): void {
  atomicWriteFile(pidPath, String(process.pid));
  atomicWriteFile(healthPath, new Date().toISOString());
}

/**
 * Touch the health file to signal the daemon is alive.
 */
export function touchHealthFile(healthPath: string): void {
  atomicWriteFile(healthPath, new Date().toISOString());
}

/**
 * Read daemon status from PID and health files.
 */
export function readDaemonStatus(pidPath: string, healthPath: string): DaemonStatus {
  const pidRaw = readTextFile(pidPath);
  const pid = pidRaw ? parseInt(pidRaw.trim(), 10) : null;

  if (!pid || isNaN(pid)) {
    return { pid: null, healthy: false, startedAt: null };
  }

  // Check if process is actually running (synchronous, POSIX only)
  let running = false;
  try {
    process.kill(pid, 0);
    running = true;
  } catch {
    running = false;
  }

  if (!running) {
    // Stale PID file
    safeUnlink(pidPath);
    safeUnlink(healthPath);
    return { pid: null, healthy: false, startedAt: null };
  }

  const healthRaw = readTextFile(healthPath);
  const startedAt = healthRaw ?? null;

  // Consider healthy if health file was touched within last 30s
  let healthy = false;
  if (startedAt) {
    const lastTouch = new Date(startedAt).getTime();
    healthy = Date.now() - lastTouch < 30000;
  }

  return { pid, healthy, startedAt };
}

/**
 * Stop a daemon by PID. Returns true if a signal was sent.
 */
export function stopDaemon(pidPath: string, healthPath: string): boolean {
  const { pid } = readDaemonStatus(pidPath, healthPath);
  if (!pid) return false;
  try {
    process.kill(pid, 'SIGTERM');
    return true;
  } catch {
    return false;
  }
}
