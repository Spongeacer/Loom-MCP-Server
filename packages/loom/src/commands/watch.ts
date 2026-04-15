import { startWatchDaemon, stopWatchDaemon, getWatchStatus } from '../core/watch-daemon.js';

const DEPRECATION =
  '[DEPRECATED] Watch daemon will be removed in a future release. ' +
  'LOOM now uses Git-based change detection and lazy evaluation in `loom status`. ' +
  'You no longer need a background process for file tracking.';

export async function runWatch(args: string[]): Promise<void> {
  console.log(DEPRECATION);
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
    console.log(DEPRECATION);
  } else {
    console.log('Watch daemon is not running.');
  }
}
