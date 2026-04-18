import * as fs from 'node:fs';
import * as path from 'node:path';
import YAML from 'yaml';
import { getPaths } from './paths.js';
import { withFileLockSync, withFileLock } from './lock.js';
import { makeBindingFileName } from './binding-utils.js';
import { FILE_LOCK_TIMEOUT_MS, LOOM_VERSION } from './constants.js';
import type { Entry, Binding, WorkingSet, LoomConfig, ArtifactEntry } from '../types/index.js';
import { ensureDir } from './fs-utils.js';

function atomicWriteFileSync(filePath: string, content: string): void {
  const dir = path.dirname(filePath);
  const tempPath = path.join(dir, `.tmp-${path.basename(filePath)}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`);
  try {
    fs.writeFileSync(tempPath, content);
    fs.renameSync(tempPath, filePath);
  } catch (err) {
    try { fs.unlinkSync(tempPath); } catch {}
    throw err;
  }
}

function cacheVersionPath(cwd?: string): string {
  return path.join(getPaths(cwd).cache, 'store-cache-version.txt');
}

function bumpCacheVersion(cwd?: string): void {
  const root = getPaths(cwd).root;
  withFileLockSync(
    root,
    'store',
    () => {
      atomicWriteFileSync(cacheVersionPath(cwd), Date.now().toString());
    },
    FILE_LOCK_TIMEOUT_MS
  );
}

function readCacheVersion(cwd?: string): string {
  const p = cacheVersionPath(cwd);
  return fs.existsSync(p) ? fs.readFileSync(p, 'utf-8') : '';
}

let cachedEntries: Entry[] | null = null;
let cachedBindings: Binding[] | null = null;
let cachedVersion = '';

function deepCopyEntry(entry: Entry): Entry {
  return structuredClone(entry) as Entry;
}

function deepCopyEntries(entries: Entry[]): Entry[] {
  return entries.map(deepCopyEntry);
}

function deepCopyBindings(bindings: Binding[]): Binding[] {
  return structuredClone(bindings) as Binding[];
}

function deepCopyBinding(binding: Binding): Binding {
  return structuredClone(binding) as Binding;
}

function patchCachedEntry(entry: Entry): void {
  if (!cachedEntries) return;
  const idx = cachedEntries.findIndex((e) => e.id === entry.id);
  if (idx >= 0) {
    cachedEntries[idx] = deepCopyEntry(entry);
  } else {
    cachedEntries.push(deepCopyEntry(entry));
  }
}

function patchCachedBinding(binding: Binding): void {
  if (cachedBindings) {
    const idx = cachedBindings.findIndex((b) => b.source === binding.source && b.target === binding.target);
    if (idx >= 0) {
      cachedBindings[idx] = deepCopyBinding(binding);
    } else {
      cachedBindings.push(deepCopyBinding(binding));
    }
  }
  if (cachedEntries && cachedBindings) {
    hydrateBindings(cachedEntries, cachedBindings);
  }
}

function removeCachedBinding(sourceId: string, targetId: string): void {
  if (cachedBindings) {
    cachedBindings = cachedBindings.filter((b) => !(b.source === sourceId && b.target === targetId));
  }
  if (cachedEntries && cachedBindings) {
    hydrateBindings(cachedEntries, cachedBindings);
  }
}

export function invalidateCache(cwd?: string): void {
  cachedEntries = null;
  cachedBindings = null;
  bumpCacheVersion(cwd);
  cachedVersion = readCacheVersion(cwd);
}

function ensureCacheValid(cwd?: string): void {
  const currentVersion = readCacheVersion(cwd);
  if (cachedVersion !== currentVersion) {
    cachedEntries = null;
    cachedBindings = null;
    cachedVersion = currentVersion;
  }
}

function hydrateBindings(entries: Entry[], bindings: Binding[]): void {
  const index = new Map<string, Entry>();
  for (const e of entries) {
    e.bindings_out = [];
    e.bindings_in = [];
    index.set(e.id, e);
  }
  for (const b of bindings) {
    const source = index.get(b.source);
    const target = index.get(b.target);
    if (source) {
      source.bindings_out.push({ target: b.target, rel: b.relationship, conf: b.confidence });
    }
    if (target) {
      target.bindings_in.push({ source: b.source, rel: b.relationship, conf: b.confidence });
    }
  }
}

export function isInitialized(cwd?: string): boolean {
  return fs.existsSync(getPaths(cwd).root);
}

export function initWorkspace(projectName: string, cwd?: string): void {
  const paths = getPaths(cwd);
  ensureDir(paths.entriesRules);
  ensureDir(paths.entriesMemories);
  ensureDir(paths.entriesSkills);
  ensureDir(paths.entriesPatterns);
  ensureDir(paths.entriesArtifacts);
  ensureDir(paths.entriesTasks);
  ensureDir(paths.entriesDecisions);
  ensureDir(paths.bindings);
  ensureDir(paths.events);
  ensureDir(paths.cache);

  const config: LoomConfig = {
    version: LOOM_VERSION,
    project_name: projectName,
    initialized_at: new Date().toISOString(),
    default_namespace: 'project',
  };
  atomicWriteFileSync(paths.config, YAML.stringify(config));

  const workingSet: WorkingSet = {
    active_task: null,
    pinned_entries: [],
    hot_entries: [],
    recently_expanded: [],
    blocked_entries: [],
  };
  atomicWriteFileSync(paths.workingSet, YAML.stringify(workingSet));

  atomicWriteFileSync(paths.wal, '');
  atomicWriteFileSync(paths.activePrompt, '<loom_context>\n  <protocol>LOOM initialized. No active task yet.</protocol>\n</loom_context>');
}

export function listEntries(cwd?: string): Entry[] {
  ensureCacheValid(cwd);
  if (cachedEntries) return deepCopyEntries(cachedEntries);

  const paths = getPaths(cwd);
  const entries: Entry[] = [];
  const dirs = [
    paths.entriesRules,
    paths.entriesMemories,
    paths.entriesSkills,
    paths.entriesPatterns,
    paths.entriesArtifacts,
    paths.entriesTasks,
    paths.entriesDecisions,
  ];

  for (const dir of dirs) {
    if (!fs.existsSync(dir)) continue;
    for (const file of fs.readdirSync(dir)) {
      if (file.endsWith('.loom.yml')) {
        const raw = fs.readFileSync(path.join(dir, file), 'utf-8');
        try {
          const entry = YAML.parse(raw) as Entry | null;
          if (!entry) continue;
          if (entry.type === 'Artifact') {
            const art = entry as ArtifactEntry;
            if (!art.artifact.fs) {
              art.artifact.fs = {
                last_modified_at: new Date(0).toISOString(),
                last_seen_at: new Date().toISOString(),
                size_bytes: 0,
                exists: false,
              };
            }
            if (!art.artifact.deps) {
              art.artifact.deps = { imports: [], imported_by: [] };
            }
            if (!art.artifact.health) {
              art.artifact.health = {
                status: 'healthy',
                score: 1.0,
                reasons: [],
                suggested_action: 'keep',
              };
            }
          }
          entries.push(entry);
        } catch (err) {
          console.error('[LOOM] Failed to parse entry:', err);
        }
      }
    }
  }

  const bindings = listBindingsRaw(cwd);
  hydrateBindings(entries, bindings);

  cachedEntries = entries;
  cachedBindings = bindings;
  return deepCopyEntries(entries);
}

export function getEntry(id: string, cwd?: string): Entry | null {
  ensureCacheValid(cwd);
  let entry: Entry | undefined;
  if (cachedEntries) {
    entry = cachedEntries.find((e) => e.id === id);
  } else {
    entry = listEntries(cwd).find((e) => e.id === id);
  }
  return entry ? deepCopyEntry(entry) : null;
}

export function saveEntry(entry: Entry, cwd?: string, skipInvalidate?: boolean, expectedVersion?: number): void {
  if (/[\\/]/.test(entry.id) || entry.id === '..' || entry.id === '.') {
    throw new Error(`Invalid entry id contains path separators: ${entry.id}`);
  }
  const root = getPaths(cwd).root;
  withFileLockSync(
    root,
    'store',
    () => {
      // Optimistic concurrency control: reject if another agent modified this entry
      if (expectedVersion !== undefined) {
        const existing = getEntry(entry.id, cwd);
        if (existing && existing.version !== expectedVersion) {
          throw new Error(
            `Conflict: Entry "${entry.id}" was modified by another agent. ` +
            `Expected version ${expectedVersion}, found ${existing.version}. ` +
            `Please re-read the entry and retry.`
          );
        }
      }

      // Auto-increment version and update timestamp
      entry.version = (entry.version || 0) + 1;
      entry.lifecycle.updated = new Date().toISOString();

      const paths = getPaths(cwd);
      const dirMap: Record<string, string> = {
        Rule: paths.entriesRules,
        Memory: paths.entriesMemories,
        Skill: paths.entriesSkills,
        Pattern: paths.entriesPatterns,
        Artifact: paths.entriesArtifacts,
        Task: paths.entriesTasks,
        Decision: paths.entriesDecisions,
      };
      const dir = dirMap[entry.type];
      const filePath = path.join(dir, `${entry.id}.loom.yml`);
      // Strip bindings: they are the single source of truth in bindings/
      const { bindings_out: _bindingsOut, bindings_in: _bindingsIn, ...entryWithoutBindings } = entry as unknown as Record<string, unknown>;
      atomicWriteFileSync(filePath, YAML.stringify(entryWithoutBindings));
      if (!skipInvalidate) patchCachedEntry(entry);
    },
    FILE_LOCK_TIMEOUT_MS
  );
}

export function getWorkingSet(cwd?: string): WorkingSet {
  const paths = getPaths(cwd);
  if (!fs.existsSync(paths.workingSet)) {
    return {
      active_task: null,
      pinned_entries: [],
      hot_entries: [],
      recently_expanded: [],
      blocked_entries: [],
    };
  }
  try {
    const parsed = YAML.parse(fs.readFileSync(paths.workingSet, 'utf-8')) as WorkingSet | null;
    if (!parsed) {
      return {
        active_task: null,
        pinned_entries: [],
        hot_entries: [],
        recently_expanded: [],
        blocked_entries: [],
      };
    }
    return parsed;
  } catch {
    return {
      active_task: null,
      pinned_entries: [],
      hot_entries: [],
      recently_expanded: [],
      blocked_entries: [],
    };
  }
}

export function saveWorkingSet(ws: WorkingSet, cwd?: string): void {
  const root = getPaths(cwd).root;
  withFileLockSync(
    root,
    'store',
    () => {
      const paths = getPaths(cwd);
      atomicWriteFileSync(paths.workingSet, YAML.stringify(ws));
    },
    FILE_LOCK_TIMEOUT_MS
  );
}

function listBindingsRaw(cwd?: string): Binding[] {
  const paths = getPaths(cwd);
  const bindings: Binding[] = [];
  if (!fs.existsSync(paths.bindings)) return bindings;
  for (const file of fs.readdirSync(paths.bindings)) {
    if (file.endsWith('.yml')) {
      const raw = fs.readFileSync(path.join(paths.bindings, file), 'utf-8');
      try {
        const b = YAML.parse(raw) as Binding | null;
        if (b) bindings.push(b);
      } catch (err) {
        console.error('[LOOM] Failed to parse binding:', err);
      }
    }
  }
  return bindings;
}

export function listBindings(cwd?: string): Binding[] {
  ensureCacheValid(cwd);
  if (cachedBindings) return deepCopyBindings(cachedBindings);
  const bindings = listBindingsRaw(cwd);
  cachedBindings = bindings;
  return deepCopyBindings(bindings);
}

export function saveBinding(binding: Binding, cwd?: string, skipInvalidate?: boolean): void {
  const root = getPaths(cwd).root;
  withFileLockSync(
    root,
    'store',
    () => {
      const paths = getPaths(cwd);
      const bindingPath = path.join(paths.bindings, makeBindingFileName(binding.source, binding.target));
      atomicWriteFileSync(bindingPath, YAML.stringify(binding));
      if (!skipInvalidate) patchCachedBinding(binding);
    },
    FILE_LOCK_TIMEOUT_MS
  );
}

export function removeBinding(sourceId: string, targetId: string, cwd?: string, skipInvalidate?: boolean): void {
  const root = getPaths(cwd).root;
  withFileLockSync(
    root,
    'store',
    () => {
      const paths = getPaths(cwd);
      const bindingPath = path.join(paths.bindings, makeBindingFileName(sourceId, targetId));
      if (fs.existsSync(bindingPath)) {
        fs.unlinkSync(bindingPath);
      }
      if (!skipInvalidate) removeCachedBinding(sourceId, targetId);
    },
    FILE_LOCK_TIMEOUT_MS
  );
}

export function writeActivePrompt(content: string, cwd?: string): void {
  const paths = getPaths(cwd);
  atomicWriteFileSync(paths.activePrompt, content);
}

export function getConfig(cwd?: string): LoomConfig | null {
  const paths = getPaths(cwd);
  if (!fs.existsSync(paths.config)) return null;
  try {
    const parsed = YAML.parse(fs.readFileSync(paths.config, 'utf-8')) as LoomConfig | null;
    return parsed || null;
  } catch {
    return null;
  }
}

export function assertInitialized(cwd?: string): void {
  if (!getConfig(cwd)) {
    throw new Error('LOOM not initialized. Run: .loom init <project-name>');
  }
}

export function withStoreTransaction<T>(projectRoot: string, fn: () => T): T {
  return withFileLockSync(
    projectRoot,
    'store',
    () => {
      const result = fn();
      invalidateCache(projectRoot);
      return result;
    },
    FILE_LOCK_TIMEOUT_MS
  );
}

export async function withStoreTransactionAsync<T>(
  projectRoot: string,
  fn: () => Promise<T>
): Promise<T> {
  return withFileLock(
    projectRoot,
    'store',
    async () => {
      const result = await fn();
      invalidateCache(projectRoot);
      return result;
    },
    FILE_LOCK_TIMEOUT_MS
  );
}
