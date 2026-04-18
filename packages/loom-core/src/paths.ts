import * as path from 'node:path';

export const LOOM_DIR_NAME = '.loom';

export interface LoomPaths {
  root: string;
  entriesRules: string;
  entriesMemories: string;
  entriesSkills: string;
  entriesPatterns: string;
  entriesArtifacts: string;
  entriesTasks: string;
  entriesDecisions: string;
  bindings: string;
  events: string;
  cache: string;
  trash: string;
  config: string;
  workingSet: string;
  wal: string;
  activePrompt: string;
}

export function getPaths(cwd?: string): LoomPaths {
  const rootDir = cwd ?? process.env.LOOM_PROJECT_ROOT ?? process.cwd();
  const root = path.join(rootDir, LOOM_DIR_NAME);
  return {
    root,
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
    trash: path.join(root, 'trash'),
    config: path.join(root, 'config.yml'),
    workingSet: path.join(root, 'working-set.yml'),
    wal: path.join(root, 'events', 'wal.jsonl'),
    activePrompt: path.join(root, 'cache', 'active-prompt.txt'),
  };
}
