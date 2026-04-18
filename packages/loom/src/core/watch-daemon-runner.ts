import * as fs from 'node:fs';
import * as path from 'node:path';
import * as net from 'node:net';
import chokidar from 'chokidar';
import { discoverArtifacts } from './binding-discovery.js';
import { listEntries, saveEntry, getEntry, saveBinding } from './store.js';
import { appendWalAsync, drainWalAsync } from './wal-queue.js';
import { ensureDir } from './fs-utils.js';
import { getPaths } from './paths.js';
import { markArtifactDirty } from './dirty-tracker.js';
import { withFileLockSync } from './lock.js';
import { makeBindingFileName } from './binding-utils.js';
import YAML from 'yaml';
import {
  WATCH_DAEMON_MEMORY_LIMIT_MB,
  WATCH_DAEMON_EVENT_BURST_LIMIT,
  WATCH_DAEMON_HEARTBEAT_MS,
  WATCH_DAEMON_FLUSH_MS,
  FILE_LOCK_TIMEOUT_MS,
} from './constants.js';

const dirs = process.argv.slice(2);
const projectRoot = process.cwd();

if (dirs.length === 0) {
  console.error('[LOOM Watch Daemon] No directories provided. Exiting.');
  process.exit(1);
}

const existingDirs = dirs.filter((d) => fs.existsSync(path.join(projectRoot, d)));
if (existingDirs.length === 0) {
  console.error('[LOOM Watch Daemon] No valid directories to watch. Exiting.');
  process.exit(1);
}

console.error(`[LOOM Watch Daemon] Watching: ${existingDirs.join(', ')}`);

// Self-managed log file (parent may exit and close stdio pipes)
const logDir = path.join(getPaths(projectRoot).cache, '..', 'logs');
ensureDir(logDir);
const logPath = path.join(logDir, 'watch-daemon.log');
const logStream = fs.createWriteStream(logPath, { flags: 'a' });
logStream.on('error', () => { /* ignore log stream errors to prevent uncaught exceptions */ });
function logError(...args: any[]): void {
  const line = args.map((a) => (typeof a === 'string' ? a : JSON.stringify(a))).join(' ') + '\n';
  logStream.write(`[${new Date().toISOString()}] ${line}`);
}

// Unix socket for health probing
const socketPath = path.join(getPaths(projectRoot).cache, 'watch.sock');
if (fs.existsSync(socketPath)) {
  try { fs.unlinkSync(socketPath); } catch { /* ignore */ }
}
const server = net.createServer((conn) => {
  conn.on('error', (err: any) => {
    if (err.code === 'EPIPE') return;
    logError('[LOOM Watch Daemon] Health socket connection error:', err.message);
  });
  conn.write('pong');
  conn.end();
});
server.on('error', (err) => {
  logError('[LOOM Watch Daemon] Health socket error:', err.message);
  // On platforms without Unix domain socket support, degrade gracefully
  // and rely solely on the health file for liveness checks.
});
server.listen(socketPath, () => {
  logError(`[LOOM Watch Daemon] Health socket: ${socketPath}`);
});

const pendingFiles = new Set<string>();
let flushTimer: ReturnType<typeof setTimeout> | null = null;

const EVENT_BURST_WINDOW_MS = 10_000;
const HEALTH_FILE = path.join(getPaths(projectRoot).cache, 'watch-health.json');

let eventCountInWindow = 0;
let windowStart = Date.now();
let lastMemoryCheck = Date.now();

function writeHealth(status: 'healthy' | 'stressed' | 'shutdown', reason?: string) {
  try {
    fs.writeFileSync(
      HEALTH_FILE,
      JSON.stringify(
        {
          pid: process.pid,
          status,
          lastHeartbeat: Date.now(),
          memoryMB: Math.round(process.memoryUsage().rss / 1024 / 1024),
          eventCount: eventCountInWindow,
          reason,
        },
        null,
        2
      )
    );
  } catch (err) {
    logError('[LOOM Watch Daemon] Failed to write health file:', err);
  }
}

async function shutdownGracefully(reason: string, code = 1) {
  logError(`[LOOM Watch Daemon] Shutting down: ${reason}`);
  writeHealth('shutdown', reason);
  try { await watcher.close(); } catch {}
  try { await drainWalAsync(); } catch {}
  logStream.end(() => {
    process.exit(code);
  });
  // Fallback if logStream.end stalls
  setTimeout(() => process.exit(code), 2000);
}

function queue(filePath: string) {
  const normalized = filePath.replace(/\\/g, '/');
  if (normalized.startsWith('.loom/')) return;
  pendingFiles.add(filePath);

  const now = Date.now();
  if (now - windowStart > EVENT_BURST_WINDOW_MS) {
    windowStart = now;
    eventCountInWindow = 0;
  }
  eventCountInWindow++;

  // Event storm protection
  if (eventCountInWindow > WATCH_DAEMON_EVENT_BURST_LIMIT) {
    void shutdownGracefully(`event_storm (${eventCountInWindow} events in ${EVENT_BURST_WINDOW_MS}ms)`);
    return;
  }

  // Memory protection (checked every 30s)
  if (now - lastMemoryCheck > WATCH_DAEMON_HEARTBEAT_MS) {
    lastMemoryCheck = now;
    const rssMB = process.memoryUsage().rss / 1024 / 1024;
    if (rssMB > WATCH_DAEMON_MEMORY_LIMIT_MB) {
      void shutdownGracefully(`memory_limit (${Math.round(rssMB)}MB > ${WATCH_DAEMON_MEMORY_LIMIT_MB}MB)`);
      return;
    }
  }

  if (flushTimer) clearTimeout(flushTimer);
  flushTimer = setTimeout(flush, WATCH_DAEMON_FLUSH_MS);
}

function flush() {
  const files = Array.from(pendingFiles);
  pendingFiles.clear();
  if (files.length === 0) return;

  withFileLockSync(
    projectRoot,
    'store',
    () => {
      const allEntries = listEntries(projectRoot);
      const { entries: newArtifacts, bindings } = discoverArtifacts(
        files.map((f) => path.join(projectRoot, f)),
        allEntries,
        projectRoot
      );

      for (const art of newArtifacts) {
        const existing = getEntry(art.id, projectRoot);
        if (!existing) {
          saveEntry(art, projectRoot);
          logError(`[LOOM Watch Daemon] Registered artifact: ${art.artifact.path} as ${art.id}`);
        } else {
          saveEntry(art, projectRoot);
        }
      }

      for (const b of bindings) {
        saveBinding(b, projectRoot, true);
        logError(`[LOOM Watch Daemon] Created binding: ${makeBindingFileName(b.source, b.target)}`);
      }

      appendWalAsync(
        {
          type: 'watch_flush',
          files,
          artifacts: newArtifacts.map((a) => a.id),
          bindings: bindings.map((b) => `${b.source}-${b.target}`),
        },
        projectRoot
      ).catch(() => {});

      // Mark changed files as dirty so the next status/fs-scan call can pick them up incrementally
      for (const file of files) {
        markArtifactDirty(path.join(projectRoot, file), undefined, projectRoot);
      }
    },
    FILE_LOCK_TIMEOUT_MS
  );
}

const watcher = chokidar.watch(existingDirs, {
  cwd: projectRoot,
  ignored: [
    /(^|[/\\]).loom($|[/\\]).*/,
    /(^|[/\\])\..*/,
    /node_modules/,
    /dist/,
    /build/,
    /out/,
    /target/,
    /coverage/,
    /\.next/,
    /\.git/,
    /\.(map|lock)$/,
    /package-lock\.json/,
    /yarn\.lock/,
    /pnpm-lock\.yaml/,
    /bun\.lockb/,
    /Gemfile\.lock/,
    /Podfile\.lock/,
    /Cargo\.lock/,
  ],
  ignoreInitial: true,
  persistent: true,
});

watcher.on('add', queue);
watcher.on('change', queue);
watcher.on('unlink', (filePath) => {
  logError(`[LOOM Watch Daemon] Removed: ${filePath}`);
  appendWalAsync({ type: 'artifact_removed', path: filePath }, projectRoot).catch(() => {});
});

// Heartbeat
writeHealth('healthy');
setInterval(() => {
  writeHealth('healthy');
}, WATCH_DAEMON_HEARTBEAT_MS);

async function cleanupAndExit(code: number) {
  server.close(async () => {
    try { fs.unlinkSync(socketPath); } catch { /* ignore */ }
    try { await watcher.close(); } catch {}
    try { await drainWalAsync(); } catch {}
    logStream.end(() => {
      process.exit(code);
    });
    setTimeout(() => process.exit(code), 2000);
  });
}

process.on('SIGTERM', () => {
  logError('[LOOM Watch Daemon] SIGTERM received, shutting down.');
  void cleanupAndExit(0);
});

process.on('SIGINT', () => {
  logError('[LOOM Watch Daemon] SIGINT received, shutting down.');
  void cleanupAndExit(0);
});

process.on('uncaughtException', (err) => {
  logError('[LOOM Watch Daemon] Uncaught exception:', err.message, err.stack);
  void shutdownGracefully('uncaught_exception: ' + err.message);
});

process.on('unhandledRejection', (reason) => {
  logError('[LOOM Watch Daemon] Unhandled rejection:', reason);
  void shutdownGracefully('unhandled_rejection');
});
