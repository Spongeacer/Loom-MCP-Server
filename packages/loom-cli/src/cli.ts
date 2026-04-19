#!/usr/bin/env node

import type { StoreAdapter } from '@spongeacer/loom-core';
import { FileSystemStoreAdapter, LOOM_VERSION } from '@spongeacer/loom-core';
import { runInit } from './commands/init.js';
import { runStatus } from './commands/status.js';
import { runTask } from './commands/task.js';
import { runFsScanCommand, runFsHealthCommand, runFsDepsCommand, runFsTrashCommand, runFsCleanCommand } from './commands/fs.js';
import { runExpand } from './commands/expand.js';
import { runExplain } from './commands/explain.js';
import { runWhy } from './commands/why.js';
import { runWatch, runWatchStop, runWatchStatus } from './commands/watch.js';
import { runDoctorCommand } from './commands/doctor.js';
import { runSessionCommand } from './commands/session.js';
import { runSkillCommand } from './commands/skill.js';
import { runDiaryCommand } from './commands/diary.js';
import { runTrashList, runTrashRestore, runTrashPurge } from './commands/trash.js';

interface CommandDef {
  name: string;
  handler: (args: string[], store: StoreAdapter) => Promise<string> | string;
}

const registry = new Map<string, CommandDef>();

function register(def: CommandDef): void {
  registry.set(def.name, def);
}

function showHelp(): string {
  return `LOOM CLI v${LOOM_VERSION}
Commands:
  loom init <project-name>       Initialize .loom/ workspace
  loom status                    Show slot-based prompt context
  loom task                      List all tasks
  loom task set <id>             Set active task
  loom task create <title>       Create a new task
  loom task update <id> [...]    Update task fields
  loom fs scan [dirs...]         Scan files, update metadata, build dependency graph
  loom fs health                 Show file health report
  loom fs deps <path>            Show file dependencies
  loom fs trash                  List trash candidates
  loom fs clean                  Archive/delete unhealthy files
  loom expand <id> [l2|l3]       Expand an entry
  loom explain <id>              Explain an entry's metadata and bindings
  loom why <id>                  Explain why an entry is relevant
  loom watch [dirs...]           Watch file changes and auto-register artifacts
  loom watch stop                Stop the watch daemon
  loom watch status              Check watch daemon status
  loom doctor                    Run self-diagnostic checks
  loom session [summary|recent]  Recall recent session activity
  loom skill [list|extract <id>] Manage extracted skills
  loom diary [task-id] [--save]  Generate a daily diary for the active task
  loom trash list                List deleted entries
  loom trash restore <id>        Restore an entry from trash
  loom trash purge               Permanently delete all trash items
  loom help                      Show this help`;
}

register({ name: 'init', handler: runInit });
register({ name: 'status', handler: (_args, store) => runStatus(store) });
register({ name: 'task', handler: runTask });
register({ name: 'fs scan', handler: runFsScanCommand });
register({ name: 'fs health', handler: (_args, store) => runFsHealthCommand(store) });
register({ name: 'fs deps', handler: runFsDepsCommand });
register({ name: 'fs trash', handler: (_args, store) => runFsTrashCommand(store) });
register({ name: 'fs clean', handler: (_args, store) => runFsCleanCommand(store) });
register({ name: 'expand', handler: runExpand });
register({ name: 'explain', handler: runExplain });
register({ name: 'why', handler: runWhy });
register({ name: 'watch', handler: (args) => runWatch(args) });
register({ name: 'watch stop', handler: () => runWatchStop() });
register({ name: 'watch status', handler: () => runWatchStatus() });
register({ name: 'doctor', handler: runDoctorCommand });
register({ name: 'session', handler: runSessionCommand });
register({ name: 'skill', handler: runSkillCommand });
register({ name: 'diary', handler: runDiaryCommand });
register({ name: 'trash list', handler: (_args, store) => runTrashList(store) });
register({ name: 'trash restore', handler: runTrashRestore });
register({ name: 'trash purge', handler: (_args, store) => runTrashPurge(store) });
register({ name: 'help', handler: () => showHelp() });
register({ name: '--help', handler: () => showHelp() });
register({ name: '-h', handler: () => showHelp() });

async function main() {
  const args = process.argv.slice(2);
  const store = new FileSystemStoreAdapter();

  // Match longest prefix (up to 2 words)
  let matched: CommandDef | undefined;
  let rest: string[] = [];
  for (let len = Math.min(args.length, 2); len >= 1; len--) {
    const key = args.slice(0, len).join(' ');
    if (registry.has(key)) {
      matched = registry.get(key)!;
      rest = args.slice(len);
      break;
    }
  }

  if (!matched) {
    if (args.length === 0) {
      matched = registry.get('status')!;
    } else {
      console.log(`Unknown command: ${args.join(' ')}`);
      console.log('Run "loom help" for usage.');
      process.exit(1);
    }
  }

  try {
    const output = await matched.handler(rest, store);
    console.log(output);
  } catch (e) {
    console.error(e);
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
