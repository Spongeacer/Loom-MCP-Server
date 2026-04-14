import * as fs from 'node:fs';
import * as path from 'node:path';
import chokidar from 'chokidar';
import { discoverArtifacts } from './binding-discovery.js';
import { listEntries, saveEntry, getEntry, appendWal } from './store.js';
import { getPaths } from './paths.js';
import { performFsScan } from './fs-scan.js';
import YAML from 'yaml';

const dirs = process.argv.slice(2);
const projectRoot = process.cwd();

if (dirs.length === 0) {
  console.error('[SDP Watch Daemon] No directories provided. Exiting.');
  process.exit(1);
}

const existingDirs = dirs.filter((d) => fs.existsSync(path.join(projectRoot, d)));
if (existingDirs.length === 0) {
  console.error('[SDP Watch Daemon] No valid directories to watch. Exiting.');
  process.exit(1);
}

console.error(`[SDP Watch Daemon] Watching: ${existingDirs.join(', ')}`);

let pendingFiles = new Set<string>();
let flushTimer: ReturnType<typeof setTimeout> | null = null;

function queue(filePath: string) {
  if (filePath.startsWith('.sdp/')) return;
  pendingFiles.add(filePath);
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
      console.error(`[SDP Watch Daemon] Registered artifact: ${art.artifact.path} as ${art.id}`);
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
      console.error(`[SDP Watch Daemon] Created binding: ${bindingId}`);
    }
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

  // Auto-trigger lightweight filesystem scan + dependency analysis after batch changes
  performFsScan(dirs, projectRoot, { silent: true, updateTimestamp: true }).catch((err) => {
    console.error('[SDP Watch Daemon] Auto fs-scan failed:', err);
  });
}

const watcher = chokidar.watch(existingDirs, {
  cwd: projectRoot,
  ignored: [
    /(^|[\/\\])\.sdp($|[\/\\]).*/,
    /(^|[\/\\])\..*/,
    /node_modules/,
    /dist/,
    /build/,
    /\.git/,
  ],
  ignoreInitial: false,
  persistent: true,
});

watcher.on('add', queue);
watcher.on('change', queue);
watcher.on('unlink', (filePath) => {
  console.error(`[SDP Watch Daemon] Removed: ${filePath}`);
  appendWal({ type: 'artifact_removed', path: filePath }, projectRoot);
});

process.on('SIGTERM', () => {
  console.error('[SDP Watch Daemon] SIGTERM received, shutting down.');
  watcher.close().then(() => process.exit(0));
});

process.on('SIGINT', () => {
  console.error('[SDP Watch Daemon] SIGINT received, shutting down.');
  watcher.close().then(() => process.exit(0));
});
