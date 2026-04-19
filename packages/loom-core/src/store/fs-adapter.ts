import * as path from 'node:path';
import type { StoreAdapter } from './adapter.js';
import type { Entry, Binding, WorkingSet, LoomConfig, ArtifactEntry, TrashItem } from '../types/index.js';
import { getPaths, type LoomPaths } from '../paths.js';
import {
  safeMkdir,
  atomicWriteFile,
  readTextFile,
  pathExists,
  safeReaddir,
  safeUnlink,
} from '../utils/fs-safe.js';
import { parseYaml, stringifyYaml } from '../utils/yaml.js';
import { saveToTrash, listTrash, findTrashFile, purgeTrash as purgeTrashImpl } from './trash.js';
import { LOOM_VERSION } from '../constants.js';
import * as crypto from 'node:crypto';

const DEFAULT_WORKING_SET: WorkingSet = {
  active_task: null,
  pinned_entries: [],
  hot_entries: [],
  recently_expanded: [],
  blocked_entries: [],
};

const ENTRY_DIR_MAP: Record<string, string> = {
  Rule: 'entriesRules',
  Memory: 'entriesMemories',
  Skill: 'entriesSkills',
  Pattern: 'entriesPatterns',
  Artifact: 'entriesArtifacts',
  Task: 'entriesTasks',
  Decision: 'entriesDecisions',
};

function makeBindingFileName(source: string, target: string): string {
  return `${source}→${target}.yml`;
}

function normalizeArtifactEntry(entry: ArtifactEntry): void {
  if (!entry.artifact.fs) {
    entry.artifact.fs = {
      last_modified_at: new Date(0).toISOString(),
      last_seen_at: new Date().toISOString(),
      size_bytes: 0,
      exists: false,
    };
  }
  if (!entry.artifact.deps) {
    entry.artifact.deps = { imports: [], imported_by: [] };
  }
  if (!entry.artifact.health) {
    entry.artifact.health = {
      status: 'healthy',
      score: 1.0,
      reasons: [],
      suggested_action: 'keep',
    };
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

export class FileSystemStoreAdapter implements StoreAdapter {
  private cachedEntries: Entry[] | null = null;
  private cachedBindings: Binding[] | null = null;
  private cachedVersion = '';

  constructor(private cwd?: string) {}

  getProjectRoot(): string {
    return path.dirname(this.paths.root);
  }

  private get paths() {
    return getPaths(this.cwd);
  }

  private cacheVersionPath(): string {
    return path.join(this.paths.cache, 'store-cache-version.txt');
  }

  private readCacheVersionFile(): string {
    return readTextFile(this.cacheVersionPath()) ?? '';
  }

  private bumpCacheVersionFile(): void {
    // Use a unique value (timestamp + random + pid) to eliminate the race
    // where two processes read the same current and write the same next.
    const token = `${Date.now()}-${process.pid}-${Math.random().toString(36).slice(2, 7)}`;
    atomicWriteFile(this.cacheVersionPath(), token);
  }

  private ensureCacheValid(): void {
    const current = this.readCacheVersionFile();
    if (this.cachedVersion !== current) {
      this.cachedEntries = null;
      this.cachedBindings = null;
      this.cachedVersion = current;
    }
  }

  private invalidateCache(): void {
    this.cachedEntries = null;
    this.cachedBindings = null;
    this.bumpCacheVersionFile();
    this.cachedVersion = this.readCacheVersionFile();
  }

  initWorkspace(projectName: string): void {
    const p = this.paths;
    safeMkdir(p.entriesRules);
    safeMkdir(p.entriesMemories);
    safeMkdir(p.entriesSkills);
    safeMkdir(p.entriesPatterns);
    safeMkdir(p.entriesArtifacts);
    safeMkdir(p.entriesTasks);
    safeMkdir(p.entriesDecisions);
    safeMkdir(p.bindings);
    safeMkdir(p.events);
    safeMkdir(p.cache);
    safeMkdir(p.trash);

    const config: LoomConfig = {
      version: LOOM_VERSION,
      project_name: projectName,
      project_id: crypto.randomUUID(),
      initialized_at: new Date().toISOString(),
      default_namespace: 'project',
    };
    atomicWriteFile(p.config, stringifyYaml(config));
    atomicWriteFile(p.workingSet, stringifyYaml(DEFAULT_WORKING_SET));
    atomicWriteFile(p.wal, '');
    atomicWriteFile(p.activePrompt, '<loom_context>\n  <protocol>LOOM initialized. Use loom_task_create to start tracking work, or loom_status to refresh context.</protocol>\n</loom_context>');
    this.invalidateCache();
  }

  isInitialized(): boolean {
    return pathExists(this.paths.config);
  }

  listEntries(): Entry[] {
    this.ensureCacheValid();
    if (this.cachedEntries) {
      return this.cachedEntries.map((e) => structuredClone(e));
    }

    const p = this.paths;
    const dirs = [
      p.entriesRules,
      p.entriesMemories,
      p.entriesSkills,
      p.entriesPatterns,
      p.entriesArtifacts,
      p.entriesTasks,
      p.entriesDecisions,
    ];

    const entries: Entry[] = [];
    for (const dir of dirs) {
      for (const file of safeReaddir(dir)) {
        if (!file.endsWith('.loom.yml')) continue;
        const raw = readTextFile(path.join(dir, file));
        if (!raw) continue;
        const entry = parseYaml<Entry | null>(raw, null);
        if (!entry) continue;
        if (entry.type === 'Artifact') {
          normalizeArtifactEntry(entry as ArtifactEntry);
        }
        entries.push(entry);
      }
    }

    const bindings = this.listBindingsRaw();
    hydrateBindings(entries, bindings);

    this.cachedEntries = entries;
    this.cachedBindings = bindings;
    return entries.map((e) => structuredClone(e));
  }

  getEntry(id: string): Entry | null {
    this.ensureCacheValid();
    let entry: Entry | undefined;
    if (this.cachedEntries) {
      entry = this.cachedEntries.find((e) => e.id === id);
    } else {
      entry = this.listEntries().find((e) => e.id === id);
    }
    return entry ? structuredClone(entry) : null;
  }

  saveEntry(entry: Entry): void {
    if (/[\\/]/.test(entry.id) || entry.id === '..' || entry.id === '.') {
      throw new Error(`Invalid entry id contains path separators: ${entry.id}`);
    }
    const dirKey = ENTRY_DIR_MAP[entry.type];
    if (!dirKey) {
      throw new Error(`Unknown entry type: ${entry.type}`);
    }
    const dir = this.paths[dirKey as keyof LoomPaths];
    const filePath = path.join(dir, `${entry.id}.loom.yml`);

    // Strip bindings — they are the single source of truth in bindings/
    const { bindings_out: _bo, bindings_in: _bi, ...entryWithoutBindings } = entry as any;
    atomicWriteFile(filePath, stringifyYaml(entryWithoutBindings));
    this.patchCachedEntry(entry);
    this.bumpCacheVersionFile();
    this.cachedVersion = this.readCacheVersionFile();
  }

  removeEntry(id: string): void {
    const entry = this.getEntry(id);
    if (!entry) return;

    // Save to trash
    saveToTrash(this.paths.trash, entry);

    // Remove from filesystem
    const dirKey = ENTRY_DIR_MAP[entry.type];
    const dir = this.paths[dirKey as keyof LoomPaths];
    const filePath = path.join(dir, `${id}.loom.yml`);
    safeUnlink(filePath);

    // Remove associated bindings
    for (const b of entry.bindings_out) {
      this.removeBinding(id, b.target!);
    }
    for (const b of entry.bindings_in) {
      this.removeBinding(b.source!, id);
    }

    this.invalidateCache();
  }

  private patchCachedEntry(entry: Entry): void {
    if (!this.cachedEntries) return;
    const idx = this.cachedEntries.findIndex((e) => e.id === entry.id);
    if (idx >= 0) {
      this.cachedEntries[idx] = structuredClone(entry);
    } else {
      this.cachedEntries.push(structuredClone(entry));
    }
  }

  private listBindingsRaw(): Binding[] {
    const p = this.paths;
    const bindings: Binding[] = [];
    for (const file of safeReaddir(p.bindings)) {
      if (!file.endsWith('.yml')) continue;
      const raw = readTextFile(path.join(p.bindings, file));
      if (!raw) continue;
      const b = parseYaml<Binding | null>(raw, null);
      if (b) bindings.push(b);
    }
    return bindings;
  }

  listBindings(): Binding[] {
    this.ensureCacheValid();
    if (this.cachedBindings) {
      return this.cachedBindings.map((b) => structuredClone(b));
    }
    const bindings = this.listBindingsRaw();
    this.cachedBindings = bindings;
    return bindings.map((b) => structuredClone(b));
  }

  saveBinding(binding: Binding): void {
    const p = this.paths;
    const filePath = path.join(p.bindings, makeBindingFileName(binding.source, binding.target));
    atomicWriteFile(filePath, stringifyYaml(binding));
    this.patchCachedBinding(binding);
    this.bumpCacheVersionFile();
    this.cachedVersion = this.readCacheVersionFile();
  }

  private patchCachedBinding(binding: Binding): void {
    if (!this.cachedBindings) return;
    const idx = this.cachedBindings.findIndex(
      (b) => b.source === binding.source && b.target === binding.target
    );
    if (idx >= 0) {
      this.cachedBindings[idx] = structuredClone(binding);
    } else {
      this.cachedBindings.push(structuredClone(binding));
    }
    if (this.cachedEntries) {
      hydrateBindings(this.cachedEntries, this.cachedBindings);
    }
  }

  removeBinding(sourceId: string, targetId: string): void {
    const p = this.paths;
    const filePath = path.join(p.bindings, makeBindingFileName(sourceId, targetId));
    safeUnlink(filePath);

    if (this.cachedBindings) {
      this.cachedBindings = this.cachedBindings.filter(
        (b) => !(b.source === sourceId && b.target === targetId)
      );
    }
    if (this.cachedEntries && this.cachedBindings) {
      hydrateBindings(this.cachedEntries, this.cachedBindings);
    }
  }

  getWorkingSet(): WorkingSet {
    const p = this.paths;
    const raw = readTextFile(p.workingSet);
    if (!raw) return structuredClone(DEFAULT_WORKING_SET);
    return parseYaml<WorkingSet>(raw, structuredClone(DEFAULT_WORKING_SET));
  }

  saveWorkingSet(ws: WorkingSet): void {
    atomicWriteFile(this.paths.workingSet, stringifyYaml(ws));
  }

  getConfig(): LoomConfig | null {
    const raw = readTextFile(this.paths.config);
    if (!raw) return null;
    return parseYaml<LoomConfig | null>(raw, null);
  }

  writeActivePrompt(content: string): void {
    atomicWriteFile(this.paths.activePrompt, content);
  }

  readActivePrompt(): string {
    return readTextFile(this.paths.activePrompt) ?? '';
  }

  readCacheVersion(): string {
    return this.readCacheVersionFile();
  }

  bumpCacheVersion(): void {
    this.bumpCacheVersionFile();
  }

  listTrash(): TrashItem[] {
    return listTrash(this.paths.trash);
  }

  restoreFromTrash(id: string): void {
    const trashFile = findTrashFile(this.paths.trash, id);
    if (!trashFile) return;
    const raw = readTextFile(trashFile);
    if (!raw) return;
    const item = parseYaml<TrashItem | null>(raw, null);
    if (!item) return;
    this.saveEntry(item.entry);
    safeUnlink(trashFile);
  }

  purgeTrash(olderThanDays?: number): void {
    purgeTrashImpl(this.paths.trash, olderThanDays);
  }
}
