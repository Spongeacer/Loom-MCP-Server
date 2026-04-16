import * as fs from 'node:fs';
import * as path from 'node:path';
import * as net from 'node:net';
import chokidar from 'chokidar';
import { discoverArtifacts } from './binding-discovery.js';
import { listEntries, saveEntry, getEntry, appendWal, invalidateCache } from './store.js';
import { getPaths } from './paths.js';
import { markArtifactDirty } from './dirty-tracker.js';
import YAML from 'yaml';

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
if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });
const logPath = path.join(logDir, 'watch-daemon.log');
const logStream = fs.createWriteStream(logPath, { flags: 'a' });
console.error = (...args: any[]) => {
  const line = args.map((a) => (typeof a === 'string' ? a : JSON.stringify(a))).join(' ') + '\n';
  logStream.write(`[${new Date().toISOString()}] ${line}`);
  // Do not write to original stderr; it may be closed if parent exited
};

// Unix socket for health probing
const socketPath = path.join(getPaths(projectRoot).cache, 'watch.sock');
if (fs.existsSync(socketPath)) {
  try { fs.unlinkSync(socketPath); } catch { /* ignore */ }
}
const server = net.createServer((conn) => {
  conn.write('pong');
  conn.end();
});
server.listen(socketPath, () => {
  console.error(`[LOOM Watch Daemon] Health socket: ${socketPath}`);
});

const pendingFiles = new Set<string>();
let flushTimer: ReturnType<typeof setTimeout> | null = null;

// Self-protection thresholds
const MEMORY_LIMIT_MB = 300;
const EVENT_BURST_WINDOW_MS = 10_000;
const EVENT_BURST_LIMIT = 500;
const HEARTBEAT_INTERVAL_MS = 30_000;
const HEALTH_FILE = path.join(getPaths(projectRoot).cache, 'watch-health.json');

let eventTimestamps: number[] = [];
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
          eventCount: eventTimestamps.length,
          reason,
        },
        null,
        2
      )
    );
  } catch (err) {
    console.error('[LOOM Watch Daemon] Failed to write health file:', err);
  }
}

function shutdownGracefully(reason: string, code = 1) {
  console.error(`[LOOM Watch Daemon] Shutting down: ${reason}`);
  writeHealth('shutdown', reason);
  void watcher.close().then(() => process.exit(code));
}

function queue(filePath: string) {
  if (filePath.startsWith('.loom/')) return;
  pendingFiles.add(filePath);

  const now = Date.now();
  eventTimestamps.push(now);
  eventTimestamps = eventTimestamps.filter((t) => now - t < EVENT_BURST_WINDOW_MS);

  // Event storm protection
  if (eventTimestamps.length > EVENT_BURST_LIMIT) {
    shutdownGracefully(`event_storm (${eventTimestamps.length} events in ${EVENT_BURST_WINDOW_MS}ms)`);
    return;
  }

  // Memory protection (checked every 30s)
  if (now - lastMemoryCheck > 30_000) {
    lastMemoryCheck = now;
    const rssMB = process.memoryUsage().rss / 1024 / 1024;
    if (rssMB > MEMORY_LIMIT_MB) {
      shutdownGracefully(`memory_limit (${Math.round(rssMB)}MB > ${MEMORY_LIMIT_MB}MB)`);
      return;
    }
  }

  if (flushTimer) clearTimeout(flushTimer);
  flushTimer = setTimeout(flush, 800);
}

function flush() {
  const files = Array.from(pendingFiles);
  pendingFiles.clear();
  if (files.length === 0) return;

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
      console.error(`[LOOM Watch Daemon] Registered artifact: ${art.artifact.path} as ${art.id}`);
    } else {
      saveEntry(art, projectRoot);
    }
  }

  if (bindings.length > 0) {
    const paths = getPaths(projectRoot);
    for (const b of bindings) {
      const bindingId = `${b.source}-${b.target}`;
      const bindingPath = path.join(paths.bindings, `${bindingId}.yml`);
      fs.writeFileSync(bindingPath, YAML.stringify(b));
      console.error(`[LOOM Watch Daemon] Created binding: ${bindingId}`);
    }
    invalidateCache(projectRoot);
  }

  const updatedEntries = new Set<string>();
  for (const b of bindings) {
    if (!updatedEntries.has(b.source)) {
      const entry = getEntry(b.source, projectRoot);
      if (entry) {
        const already = entry.bindings_out.find((bo) => bo.target === b.target);
        if (!already) {
          entry.bindings_out.push({ target: b.target, rel: b.relationship, conf: b.confidence });
          saveEntry(entry, projectRoot);
          updatedEntries.add(b.source);
        }
      }
    }
  }

  appendWal(
    {
      type: 'watch_flush',
      files,
      artifacts: newArtifacts.map((a) => a.id),
      bindings: bindings.map((b) => `${b.source}-${b.target}`),
    },
    projectRoot
  );

  // Mark changed files as dirty so the next status/fs-scan call can pick them up incrementally
  for (const file of files) {
    markArtifactDirty(path.join(projectRoot, file), undefined, projectRoot);
  }
}

const watcher = chokidar.watch(existingDirs, {
  cwd: projectRoot,
  ignored: [
    /(^|[/\\]).loom($|[/\\]).*/,
    /(^|[/\\])\..*/,
    /node_modules/,
    /dist/,
    /build/,
    /\.git/,
  ],
  ignoreInitial: true,
  persistent: true,
});

watcher.on('add', queue);
watcher.on('change', queue);
watcher.on('unlink', (filePath) => {
  console.error(`[LOOM Watch Daemon] Removed: ${filePath}`);
  appendWal({ type: 'artifact_removed', path: filePath }, projectRoot);
});

// Heartbeat
writeHealth('healthy');
setInterval(() => {
  writeHealth('healthy');
}, HEARTBEAT_INTERVAL_MS);

function cleanupAndExit(code: number) {
  server.close(() => {
    try { fs.unlinkSync(socketPath); } catch { /* ignore */ }
    void watcher.close().then(() => {
      logStream.end(() => process.exit(code));
    });
  });
}

process.on('SIGTERM', () => {
  console.error('[LOOM Watch Daemon] SIGTERM received, shutting down.');
  cleanupAndExit(0);
});

process.on('SIGINT', () => {
  console.error('[LOOM Watch Daemon] SIGINT received, shutting down.');
  cleanupAndExit(0);
});

process.on('uncaughtException', (err) => {
  console.error('[LOOM Watch Daemon] Uncaught exception:', err.message, err.stack);
  shutdownGracefully('uncaught_exception: ' + err.message);
});

process.on('unhandledRejection', (reason) => {
  console.error('[LOOM Watch Daemon] Unhandled rejection:', reason);
  shutdownGracefully('unhandled_rejection');
});
