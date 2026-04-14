import { startWatchDaemon, stopWatchDaemon, getWatchStatus } from '../core/watch-daemon.js';

export async function runWatch(args: string[]): Promise<void> {
  const dirs = args.length > 0 ? args : ['src', 'lib', 'packages', 'tests', 'test'];
  const msg = startWatchDaemon(dirs);
  console.log(msg);
}

export function runWatchStop(): void {
  const msg = stopWatchDaemon();
  console.log(msg);
}

export function runWatchStatus(): void {
  const status = getWatchStatus();
  if (status.running) {
    console.log(`Watch daemon is running (pid: ${status.pid}).`);
    console.log(`Watching: ${status.dirs?.join(', ') || 'unknown'}`);
  } else {
    console.log('Watch daemon is not running.');
  }
}
