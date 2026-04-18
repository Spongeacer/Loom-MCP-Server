import * as fs from 'node:fs';
import * as path from 'node:path';
import chokidar from 'chokidar';
import { getPaths } from './paths.js';
import { FileSystemStoreAdapter } from './store/fs-adapter.js';
import { performFsScan } from './fs-scan.js';
import { markArtifactDirty } from './dirty-tracker.js';
import { writePidFile, touchHealthFile, readDaemonStatus, stopDaemon } from './utils/pid-file.js';
import { installSignalHandlers, gracefulShutdown, registerCleanup } from './utils/shutdown.js';
import { WATCH_DAEMON_HEARTBEAT_MS, WATCH_DAEMON_FLUSH_MS } from './constants.js';

const PID_FILE = 'watch-pid.txt';
const HEALTH_FILE = 'watch-health.txt';

export function getWatchDaemonStatus(cwd?: string): { running: boolean; pid: number | null; healthy: boolean } {
  const p = getPaths(cwd);
  const status = readDaemonStatus(path.join(p.cache, PID_FILE), path.join(p.cache, HEALTH_FILE));
  return { running: status.pid !== null, pid: status.pid, healthy: status.healthy };
}

export function stopWatchDaemon(cwd?: string): string {
  const p = getPaths(cwd);
  const pidPath = path.join(p.cache, PID_FILE);
  const healthPath = path.join(p.cache, HEALTH_FILE);
  const ok = stopDaemon(pidPath, healthPath);
  return ok ? 'Watch daemon stopped.' : 'Watch daemon is not running.';
}

export async function startWatchDaemon(dirs: string[], cwd?: string): Promise<string> {
  const projectRoot = cwd ?? process.cwd();
  const status = getWatchDaemonStatus(projectRoot);
  if (status.running) {
    return `Watch daemon already running (pid: ${status.pid}).`;
  }

  const p = getPaths(projectRoot);
  const pidPath = path.join(p.cache, PID_FILE);
  const healthPath = path.join(p.cache, HEALTH_FILE);

  // Spawn a detached child process for the actual watcher
  const scriptPath = new URL(import.meta.url).pathname;
  const { spawn } = await import('node:child_process');
  const child = spawn(process.execPath, [scriptPath, 'worker', projectRoot, ...dirs], {
    detached: true,
    stdio: 'ignore',
  });
  child.unref();

  // Write PID immediately (the child will overwrite with its own PID)
  writePidFile(pidPath, healthPath);

  return `Watch daemon started (pid: ${child.pid}). Watching: ${dirs.join(', ')}`;
}

// ── Worker entry point ──
// When this file is executed directly with "worker" arg, run the watcher loop.

async function runWatcher(projectRoot: string, dirs: string[]): Promise<void> {
  const p = getPaths(projectRoot);
  const pidPath = path.join(p.cache, PID_FILE);
  const healthPath = path.join(p.cache, HEALTH_FILE);

  writePidFile(pidPath, healthPath);

  const store = new FileSystemStoreAdapter(projectRoot);
  const changedFiles = new Set<string>();
  let flushTimer: ReturnType<typeof setTimeout> | null = null;

  const watcher = chokidar.watch(dirs.map((d) => path.join(projectRoot, d)), {
    ignored: /(^|[\/\\])\../,
    persistent: true,
    ignoreInitial: true,
  });

  const scheduleFlush = () => {
    if (flushTimer) clearTimeout(flushTimer);
    flushTimer = setTimeout(async () => {
      const files = Array.from(changedFiles);
      changedFiles.clear();
      if (files.length > 0) {
        for (const f of files) {
          markArtifactDirty(f, undefined, projectRoot);
        }
        try {
          await performFsScan(dirs, projectRoot, store, { incremental: true, changedFiles: files, silent: true });
        } catch (err) {
          console.error('[watch-daemon] Incremental scan failed:', err);
        }
      }
    }, WATCH_DAEMON_FLUSH_MS);
  };

  watcher
    .on('add', (filePath) => { changedFiles.add(path.relative(projectRoot, filePath).replace(/\\/g, '/')); scheduleFlush(); })
    .on('change', (filePath) => { changedFiles.add(path.relative(projectRoot, filePath).replace(/\\/g, '/')); scheduleFlush(); })
    .on('unlink', (filePath) => { changedFiles.add(path.relative(projectRoot, filePath).replace(/\\/g, '/')); scheduleFlush(); });

  // Heartbeat
  const heartbeat = setInterval(() => {
    touchHealthFile(healthPath);
  }, WATCH_DAEMON_HEARTBEAT_MS);

  registerCleanup(async () => {
    clearInterval(heartbeat);
    if (flushTimer) clearTimeout(flushTimer);
    await watcher.close();
  });

  installSignalHandlers();

  // Keep alive
  await new Promise(() => {});
}

if (process.argv[2] === 'worker' && process.argv[3]) {
  const projectRoot = process.argv[3];
  const dirs = process.argv.slice(4);
  runWatcher(projectRoot, dirs.length > 0 ? dirs : ['src', 'tests']).catch((e) => {
    console.error('[watch-daemon] Fatal error:', e);
    process.exit(1);
  });
}
