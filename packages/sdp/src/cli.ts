#!/usr/bin/env node

import { runInit } from './commands/init.js';

async function main() {
  const args = process.argv.slice(2);
  const command = args[0] || 'status';
  const rest = args.slice(1);

  switch (command) {
    case 'init':
      runInit(rest);
      break;
    case 'status': {
      const { runStatus } = await import('./commands/status.js');
      await runStatus();
      break;
    }
    case 'expand': {
      const { runExpand } = await import('./commands/expand.js');
      runExpand(rest);
      break;
    }
    case 'task': {
      const { runTask } = await import('./commands/task.js');
      await runTask(rest);
      break;
    }
    case 'watch': {
      const { runWatch, runWatchStop, runWatchStatus } = await import('./commands/watch.js');
      if (rest[0] === 'stop') {
        runWatchStop();
      } else if (rest[0] === 'status') {
        runWatchStatus();
      } else {
        await runWatch(rest);
      }
      break;
    }
    case 'explain': {
      const { runExplain } = await import('./commands/explain.js');
      runExplain(rest);
      break;
    }
    case 'why': {
      const { runWhy } = await import('./commands/why.js');
      runWhy(rest);
      break;
    }
    case 'fs': {
      const { runFsScan, runFsDeps, runFsHealth, runFsTrash, runFsClean } = await import('./commands/fs.js');
      const sub = rest[0] || 'scan';
      const subRest = rest.slice(1);
      switch (sub) {
        case 'scan':
          await runFsScan(subRest);
          break;
        case 'deps':
          runFsDeps(subRest);
          break;
        case 'health':
          runFsHealth();
          break;
        case 'trash':
          runFsTrash();
          break;
        case 'clean':
          await runFsClean();
          break;
        default:
          console.log('Usage: sdp fs [scan|deps|health|trash|clean]');
      }
      break;
    }
    case 'help':
    case '--help':
    case '-h':
      console.log(`SDP CLI v0.1.0
Commands:
  sdp init <project-name>     Initialize .sdp/ workspace
  sdp status                  Show slot-based prompt context (also writes cache/active-prompt.txt)
  sdp expand <id> [l2|l3]     Expand an entry
  sdp explain <id>            Explain an entry's metadata and bindings
  sdp why <id>                Explain why an entry is relevant
  sdp task                    List all tasks
  sdp task set <id>           Set active task
  sdp task create <title>     Create a new task
  sdp watch [dirs...]         Watch file changes and auto-register artifacts
  sdp fs scan [dirs...]       Scan files, update metadata, build dependency graph (auto-triggered)
  sdp fs deps <path>          Show file dependencies
  sdp fs health               Show file health report
  sdp fs trash                List trash candidates
  sdp fs clean                Archive/delete unhealthy files
  sdp help                    Show this help`);
      break;
    default:
      console.log(`Unknown command: ${command}`);
      console.log('Run "sdp help" for usage.');
      process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
