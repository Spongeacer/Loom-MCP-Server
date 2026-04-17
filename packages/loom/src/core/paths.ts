import * as fs from 'node:fs';
import * as path from 'node:path';
import { LOOM_DIR_NAME } from './constants.js';

function resolveProjectRoot(cwd?: string): string {
  if (process.env.LOOM_PROJECT_ROOT && fs.existsSync(path.join(process.env.LOOM_PROJECT_ROOT, LOOM_DIR_NAME, 'config.yml'))) {
    return path.resolve(process.env.LOOM_PROJECT_ROOT);
  }
  const start = path.resolve(cwd || process.cwd());
  let current = start;
  while (current !== path.dirname(current)) {
    if (fs.existsSync(path.join(current, LOOM_DIR_NAME, 'config.yml'))) {
      return current;
    }
    current = path.dirname(current);
  }
  // Fallback to original cwd if no LOOM workspace found
  return start;
}

function getLoomRoot(cwd?: string): string {
  return path.join(resolveProjectRoot(cwd), LOOM_DIR_NAME);
}

export function getPaths(cwd?: string) {
  const root = getLoomRoot(cwd);
  return {
    root,
    entries: path.join(root, 'entries'),
    entriesRules: path.join(root, 'entries', 'rules'),
    entriesMemories: path.join(root, 'entries', 'memories'),
    entriesSkills: path.join(root, 'entries', 'skills'),
    entriesPatterns: path.join(root, 'entries', 'patterns'),
    entriesArtifacts: path.join(root, 'entries', 'artifacts'),
    entriesTasks: path.join(root, 'entries', 'tasks'),
    entriesDecisions: path.join(root, 'entries', 'decisions'),
    bindings: path.join(root, 'bindings'),
    events: path.join(root, 'events'),
    cache: path.join(root, 'cache'),
    config: path.join(root, 'config.yml'),
    wal: path.join(root, 'events', 'wal.jsonl'),
    workingSet: path.join(root, 'cache', 'working-set.yml'),
    activePrompt: path.join(root, 'cache', 'active-prompt.txt'),
  };
}
