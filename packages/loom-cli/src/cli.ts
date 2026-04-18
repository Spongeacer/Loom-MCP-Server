#!/usr/bin/env node

import { FileSystemStoreAdapter, buildSlotPrompt, LOOM_VERSION } from '@loom/core';
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

async function main() {
  const args = process.argv.slice(2);
  const command = args[0] || 'status';
  const rest = args.slice(1);

  const store = new FileSystemStoreAdapter();

  switch (command) {
    case 'init':
      console.log(runInit(rest, store));
      break;
    case 'status': {
      const output = await runStatus(store);
      console.log(output);
      break;
    }
    case 'task': {
      const output = await runTask(rest, store);
      console.log(output);
      break;
    }
    case 'fs': {
      const sub = rest[0] || 'scan';
      const subRest = rest.slice(1);
      switch (sub) {
        case 'scan': {
          const output = await runFsScanCommand(subRest, store);
          console.log(output);
          break;
        }
        case 'health': {
          console.log(runFsHealthCommand(store));
          break;
        }
        case 'deps': {
          console.log(runFsDepsCommand(subRest, store));
          break;
        }
        case 'expand': {
      console.log(runExpand(rest, store));
      break;
    }
    case 'explain': {
      console.log(runExplain(rest, store));
      break;
    }
    case 'why': {
      console.log(runWhy(rest, store));
      break;
    }
    case 'watch': {
      if (rest[0] === 'stop') {
        console.log(runWatchStop());
      } else if (rest[0] === 'status') {
        console.log(await runWatchStatus());
      } else {
        console.log(await runWatch(rest));
      }
      break;
    }
    case 'doctor': {
      console.log(runDoctorCommand(rest, store));
      break;
    }
    case 'session': {
      console.log(runSessionCommand(rest, store));
      break;
    }
    case 'skill': {
      console.log(runSkillCommand(rest, store));
      break;
    }
    case 'diary': {
      console.log(runDiaryCommand(rest, store));
      break;
    }
    case 'trash': {
          console.log(runFsTrashCommand(store));
          break;
        }
        case 'clean': {
          console.log(await runFsCleanCommand(store));
          break;
        }
        default:
          console.log('Usage: loom fs [scan|health|deps|trash|clean]');
      }
      break;
    }
    case 'trash': {
      const sub = rest[0] || 'list';
      switch (sub) {
        case 'list': {
          const items = store.listTrash();
          if (items.length === 0) {
            console.log('Trash is empty.');
          } else {
            for (const item of items) {
              console.log(`  ${item.id} (${item.type}) — deleted ${item.deletedAt}`);
            }
          }
          break;
        }
        case 'restore': {
          const id = rest[1];
          if (!id) {
            console.log('Usage: loom trash restore <id>');
            break;
          }
          store.restoreFromTrash(id);
          console.log(`Restored ${id} from trash.`);
          break;
        }
        case 'purge': {
          store.purgeTrash(0);
          console.log('Trash purged.');
          break;
        }
        default:
          console.log('Usage: loom trash [list|restore <id>|purge]');
      }
      break;
    }
    case 'help':
    case '--help':
    case '-h':
      console.log(`LOOM CLI v${LOOM_VERSION}
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
  loom help                      Show this help`);
      break;
    default:
      console.log(`Unknown command: ${command}`);
      console.log('Run "loom help" for usage.');
      throw new Error(`Unknown command: ${command}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
