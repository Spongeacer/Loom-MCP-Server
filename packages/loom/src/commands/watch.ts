import * as path from 'node:path';
import { startWatchDaemon, stopWatchDaemon, getWatchStatusAsync } from '../core/watch-daemon.js';
import { DEFAULT_CLI_WATCH_DIRS, DEFAULT_WATCH_DIRS } from '../core/constants.js';

function isWithinProject(projectRoot: string, dir: string): boolean {
  const resolved = path.resolve(projectRoot, dir);
  const rel = path.relative(projectRoot, resolved);
  return rel !== '' && !rel.startsWith('..') && !path.isAbsolute(rel);
}

export async function runWatch(args: string[]): Promise<string> {
  const projectRoot = process.cwd();
  const rawDirs = args.length > 0 ? args : DEFAULT_CLI_WATCH_DIRS;
  const dirs = rawDirs.filter((d) => isWithinProject(projectRoot, d));
  return startWatchDaemon(dirs.length > 0 ? dirs : DEFAULT_WATCH_DIRS);
}

export function runWatchStop(): string {
  return stopWatchDaemon();
}

export async function runWatchStatus(): Promise<string> {
  const status = await getWatchStatusAsync();
  if (status.running) {
    return `Watch daemon is running (pid: ${status.pid}).\nWatching: ${status.dirs?.join(', ') || 'unknown'}`;
  } else {
    return 'Watch daemon is not running.';
  }
}
