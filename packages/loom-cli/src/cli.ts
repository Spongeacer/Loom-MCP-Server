#!/usr/bin/env node

import type { StoreAdapter } from '@spongeacer/loom-core';
import { FileSystemStoreAdapter, LOOM_VERSION } from '@spongeacer/loom-core';
import { runInit } from './commands/init.js';
import { runStatus } from './commands/status.js';
import { runTask } from './commands/task.js';
import { runFsScanCommand, runFsHealthCommand, runFsDepsCommand, runFsTrashCommand, runFsCleanCommand } from './commands/fs.js';
import { runExpand, runExplain, runWhy } from './commands/entry.js';
import { runWatch, runWatchStop, runWatchStatus } from './commands/watch.js';
import { runDoctorCommand, runSessionCommand, runSkillCommand } from './commands/report.js';
import { runDiaryCommand } from './commands/diary.js';
import { runTrashList, runTrashRestore, runTrashPurge } from './commands/trash.js';
import { runDecisionCommand, runMemoryCommand, runRuleCommand } from './commands/knowledge.js';
import { runMcpServer } from './commands/mcp.js';
import { runCloudSignup, runCloudLogin, runCloudRegister, runCloudActivate, runCloudLicenseStatus, runCloudAdminAllocate, runCloudAdminStats, runCloudSync, runCloudStatus } from './commands/cloud.js';

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
  loom cloud signup <url> <user> <pass>  Signup for cloud account
  loom cloud login <url> <user> <pass>   Login to cloud account
  loom cloud activate <key>              Activate a license key
  loom cloud license                     Show license status
  loom cloud register <url>              Register device to cloud server
  loom cloud sync                        Sync with cloud server
  loom cloud status                      Show cloud connection status
  loom cloud admin allocate <url> <secret>  Allocate a license (admin only)
  loom decision <q> <chosen> <rationale>  Record an architectural decision
  loom memory <content> [--user] [tags...]  Add a memory/preference
  loom rule <scope> <rule> [rationale]   Create a project rule/convention
  loom mcp [--project <dir>]     Start MCP server (auto-discovers project)
  loom cloud admin stats <url> <secret>     License inventory stats (admin only)
  loom help                      Show this help`;
}

register({ name: 'init', handler: runInit });
register({ name: 'status', handler: (args, store) => runStatus(store, args) });
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
register({ name: 'cloud signup', handler: runCloudSignup });
register({ name: 'cloud login', handler: runCloudLogin });
register({ name: 'cloud activate', handler: runCloudActivate });
register({ name: 'cloud license', handler: runCloudLicenseStatus });
register({ name: 'cloud register', handler: runCloudRegister });
register({ name: 'cloud sync', handler: (_args, store) => runCloudSync(store) });
register({ name: 'cloud status', handler: runCloudStatus });

register({ name: 'cloud admin allocate', handler: runCloudAdminAllocate });
register({ name: 'decision', handler: (args, store) => runDecisionCommand(args, store) });
register({ name: 'memory', handler: (args, store) => runMemoryCommand(args, store) });
register({ name: 'rule', handler: (args, store) => runRuleCommand(args, store) });
register({ name: 'mcp', handler: (args) => { void runMcpServer(args); return 'MCP server started.'; } });
register({ name: 'cloud admin stats', handler: runCloudAdminStats });
register({ name: 'help', handler: () => showHelp() });
register({ name: '--help', handler: () => showHelp() });
register({ name: '-h', handler: () => showHelp() });

async function main() {
  const args = process.argv.slice(2);

  // Lazy-init store so commands that don't need it (cloud, watch stop, help) pay zero cost
  let store: StoreAdapter | null = null;
  function getStore(): StoreAdapter {
    if (!store) store = new FileSystemStoreAdapter();
    return store;
  }

  // Match longest prefix (up to 3 words)
  let matched: CommandDef | undefined;
  let rest: string[] = [];
  for (let len = Math.min(args.length, 3); len >= 1; len--) {
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
    const output = await matched.handler(rest, getStore());
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
