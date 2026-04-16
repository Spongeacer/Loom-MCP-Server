import { startWatchDaemon, stopWatchDaemon, getWatchStatusAsync } from '../core/watch-daemon.js';

export async function runWatch(args: string[]): Promise<string> {
  const dirs = args.length > 0 ? args : ['src', 'lib', 'packages', 'tests', 'test'];
  return startWatchDaemon(dirs);
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
