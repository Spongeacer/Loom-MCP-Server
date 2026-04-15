import * as path from 'node:path';

function getLoomRoot(cwd: string = process.cwd()): string {
  return path.join(cwd, '.loom');
}

export function getPaths(cwd: string = process.cwd()) {
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
    sessions: path.join(root, 'sessions'),
    config: path.join(root, 'config.yml'),
    wal: path.join(root, 'events', 'wal.jsonl'),
    manifest: path.join(root, 'cache', 'manifest.yml'),
    workingSet: path.join(root, 'cache', 'working-set.yml'),
    hotEntries: path.join(root, 'cache', 'hot-entries.yml'),
    bindingGraph: path.join(root, 'cache', 'binding-graph.json'),
    intentMap: path.join(root, 'cache', 'intent-map.yml'),
    activePrompt: path.join(root, 'cache', 'active-prompt.txt'),
  };
}
