import * as fs from 'node:fs';
import * as path from 'node:path';
import YAML from 'yaml';
import { getPaths } from './paths.js';
import { appendWalAsync } from './wal-queue.js';
import type { Entry, Binding, WorkingSet, LoomConfig, ArtifactEntry } from '../types/index.js';

function ensureDir(p: string) {
  if (!fs.existsSync(p)) {
    fs.mkdirSync(p, { recursive: true });
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
  ensureDir(paths.sessions);

  const config: LoomConfig = {
    version: '0.1.0',
    project_name: projectName,
    initialized_at: new Date().toISOString(),
    default_namespace: 'project',
  };
  fs.writeFileSync(paths.config, YAML.stringify(config));

  const workingSet: WorkingSet = {
    active_task: null,
    pinned_entries: [],
    hot_entries: [],
    recently_expanded: [],
    blocked_entries: [],
  };
  fs.writeFileSync(paths.workingSet, YAML.stringify(workingSet));

  fs.writeFileSync(paths.wal, '');
  fs.writeFileSync(paths.manifest, YAML.stringify({ entries: {}, generated_at: new Date().toISOString() }));
  fs.writeFileSync(paths.hotEntries, YAML.stringify({ entries: [] }));
  fs.writeFileSync(paths.bindingGraph, JSON.stringify({ bindings: [] }, null, 2));
  fs.writeFileSync(paths.intentMap, YAML.stringify({ intents: {} }));
  fs.writeFileSync(paths.activePrompt, '<loom_context>\n  <protocol>LOOM initialized. No active task yet.</protocol>\n</loom_context>');
}

export function listEntries(cwd?: string): Entry[] {
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
      if (file.endsWith('.loom.yml') || file.endsWith('.yml')) {
        const raw = fs.readFileSync(path.join(dir, file), 'utf-8');
        try {
          const entry = YAML.parse(raw) as Entry;
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
        } catch {
          // ignore malformed
        }
      }
    }
  }
  return entries;
}

export function getEntry(id: string, cwd?: string): Entry | null {
  const entries = listEntries(cwd);
  return entries.find((e) => e.id === id) || null;
}

export function saveEntry(entry: Entry, cwd?: string): void {
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
  fs.writeFileSync(filePath, YAML.stringify(entry));
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
  return YAML.parse(fs.readFileSync(paths.workingSet, 'utf-8')) as WorkingSet;
}

export function saveWorkingSet(ws: WorkingSet, cwd?: string): void {
  const paths = getPaths(cwd);
  fs.writeFileSync(paths.workingSet, YAML.stringify(ws));
}

export function listBindings(cwd?: string): Binding[] {
  const paths = getPaths(cwd);
  const bindings: Binding[] = [];
  if (!fs.existsSync(paths.bindings)) return bindings;
  for (const file of fs.readdirSync(paths.bindings)) {
    if (file.endsWith('.yml')) {
      const raw = fs.readFileSync(path.join(paths.bindings, file), 'utf-8');
      try {
        bindings.push(YAML.parse(raw) as Binding);
      } catch {
        // ignore malformed
      }
    }
  }
  return bindings;
}

export function getBindingsForEntry(id: string, cwd?: string): Binding[] {
  return listBindings(cwd).filter((b) => b.source === id || b.target === id);
}

export function writeActivePrompt(content: string, cwd?: string): void {
  const paths = getPaths(cwd);
  fs.writeFileSync(paths.activePrompt, content);
}

export function appendWal(event: Record<string, unknown>, cwd?: string): void {
  // Use async queue to serialize writes and avoid WAL corruption from concurrent processes
  appendWalAsync(event, cwd).catch(() => {});
}

export function getConfig(cwd?: string): LoomConfig | null {
  const paths = getPaths(cwd);
  if (!fs.existsSync(paths.config)) return null;
  return YAML.parse(fs.readFileSync(paths.config, 'utf-8')) as LoomConfig;
}
