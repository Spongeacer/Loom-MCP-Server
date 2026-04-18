#!/usr/bin/env node

import * as fs from 'node:fs';
import * as path from 'node:path';

import { runInit } from './commands/init.js';

const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '../package.json'), 'utf-8')) as { version: string };

async function main() {
  const args = process.argv.slice(2);
  const command = args[0] || 'status';
  const rest = args.slice(1);

  switch (command) {
    case 'init':
      console.log(runInit(rest));
      break;
    case 'status': {
      const { runStatus, runStatusJson } = await import('./commands/status.js');
      if (rest.includes('--json')) {
        const output = await runStatusJson();
        console.log(JSON.stringify(output, null, 2));
      } else {
        const output = await runStatus();
        console.log(output);
      }
      break;
    }
    case 'expand': {
      const { runExpand } = await import('./commands/expand.js');
      console.log(runExpand(rest));
      break;
    }
    case 'task': {
      const { runTask, updateTaskEntry } = await import('./commands/task.js');
      const { getEntry, saveEntry } = await import('./core/store.js');
      if (rest[0] === 'update' && rest[1]) {
        const targetId = rest[1];
        const target = getEntry(targetId);
        if (!target || target.type !== 'Task') {
          throw new Error(`Not a valid task: ${targetId}`);
        }
        const updates: Record<string, string | string[] | null> = {};
        let key: string | null = null;
        for (let i = 2; i < rest.length; i++) {
          const arg = rest[i];
          if (arg.startsWith('--')) {
            key = arg.slice(2);
            updates[key] = '';
          } else if (key) {
            updates[key] = arg;
            key = null;
          }
        }
        const typedUpdates: Parameters<typeof updateTaskEntry>[1] = {};
        if (updates.title !== undefined) typedUpdates.title = updates.title as string;
        if (updates.status !== undefined) typedUpdates.status = updates.status as import('./types/index.js').TaskEntry['task']['status'];
        if (updates.intent !== undefined) typedUpdates.intent = updates.intent as import('./types/index.js').TaskEntry['task']['intent'];
        if (updates.priority !== undefined) typedUpdates.priority = updates.priority as import('./types/index.js').TaskEntry['task']['priority'];
        if (updates.current !== undefined) typedUpdates.current = updates.current as string || null;
        if (updates.next !== undefined) typedUpdates.next = updates.next as string || null;
        if (updates.blocked_by !== undefined) typedUpdates.blocked_by = updates.blocked_by as string || null;
        if (updates.completed !== undefined) typedUpdates.completed = (updates.completed as string).split(',').filter(Boolean);
        if (updates.acceptance_criteria !== undefined) typedUpdates.acceptance_criteria = (updates.acceptance_criteria as string).split(',').filter(Boolean);
        if (updates.unresolved_questions !== undefined) typedUpdates.unresolved_questions = (updates.unresolved_questions as string).split(',').filter(Boolean);
        updateTaskEntry(target, typedUpdates);
        saveEntry(target);
        console.log(`Updated task: ${targetId}`);
      } else {
        const output = await runTask(rest);
        console.log(output);
      }
      break;
    }
    case 'watch': {
      const { runWatch, runWatchStop, runWatchStatus } = await import('./commands/watch.js');
      if (rest[0] === 'stop') {
        console.log(runWatchStop());
      } else if (rest[0] === 'status') {
        console.log(await runWatchStatus());
      } else {
        console.log(await runWatch(rest));
      }
      break;
    }
    case 'explain': {
      const { runExplain } = await import('./commands/explain.js');
      console.log(runExplain(rest));
      break;
    }
    case 'why': {
      const { runWhy } = await import('./commands/why.js');
      console.log(runWhy(rest));
      break;
    }
    case 'doctor': {
      const { runDoctorCommand } = await import('./commands/doctor.js');
      console.log(runDoctorCommand(rest));
      break;
    }
    case 'install-mcp': {
      const { runInstallMcp } = await import('./commands/install-mcp.js');
      console.log(runInstallMcp());
      break;
    }
    case 'skill': {
      const { runSkill } = await import('./commands/skill.js');
      console.log(runSkill(rest));
      break;
    }
    case 'session': {
      const { runSession } = await import('./commands/session.js');
      console.log(runSession(rest));
      break;
    }
    case 'diary': {
      const { runDiary } = await import('./commands/diary.js');
      console.log(await runDiary(rest));
      break;
    }
    case 'fs': {
      const { runFsScan, runFsDeps, runFsHealth, runFsTrash, runFsClean } = await import('./commands/fs.js');
      const sub = rest[0] || 'scan';
      const subRest = rest.slice(1);
      switch (sub) {
        case 'scan': {
          const output = await runFsScan(subRest);
          console.log(output);
          break;
        }
        case 'deps': {
          const output = runFsDeps(subRest);
          console.log(output);
          break;
        }
        case 'health': {
          const output = runFsHealth();
          console.log(output);
          break;
        }
        case 'trash': {
          const output = runFsTrash();
          console.log(output);
          break;
        }
        case 'clean': {
          const output = await runFsClean();
          console.log(output);
          break;
        }
        default:
          console.log('Usage: .loom fs [scan|deps|health|trash|clean]');
      }
      break;
    }
    case 'help':
    case '--help':
    case '-h':
      console.log(`LOOM CLI v${pkg.version}
Commands:
 .loom init <project-name>     Initialize .loom/ workspace
 .loom status                  Show slot-based prompt context (also writes cache/active-prompt.txt)
 .loom expand <id> [l2|l3]     Expand an entry
 .loom explain <id>            Explain an entry's metadata and bindings
 .loom why <id>                Explain why an entry is relevant
 .loom task                    List all tasks
 .loom task set <id>           Set active task
 .loom task create <title>     Create a new task
 .loom task update <id> [--current ...] [--next ...] [--blocked_by ...] [--status ...] [--completed ...]
 .loom doctor [--fix]          Run self-diagnostic checks (auto-fix MCP configs with --fix)
 .loom install-mcp             Auto-register loom-mcp in supported MCP clients
 .loom skill [list | extract <task-id>]  Manage extracted skills
 .loom session [summary|recent] Recall recent session activity
 .loom diary [task-id] [--save] Generate a daily diary for the active task (preview by default)
 .loom watch [dirs...]         Watch file changes and auto-register artifacts
 .loom fs scan [dirs...]       Scan files, update metadata, build dependency graph (auto-triggered)
 .loom fs deps <path>          Show file dependencies
 .loom fs health               Show file health report
 .loom fs trash                List trash candidates
 .loom fs clean                Archive/delete unhealthy files
 .loom help                    Show this help`);
      break;
    default:
      console.log(`Unknown command: ${command}`);
      console.log('Run ".loom help" for usage.');
      throw new Error(`Unknown command: ${command}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
