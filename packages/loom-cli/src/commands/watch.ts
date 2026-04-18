import { startWatchDaemon, stopWatchDaemon, getWatchDaemonStatus } from '@loom/core';

export async function runWatch(args: string[]): Promise<string> {
  const dirs = args.length > 0 ? args : ['src', 'tests'];
  return startWatchDaemon(dirs);
}

export function runWatchStop(): string {
  return stopWatchDaemon();
}

export async function runWatchStatus(): Promise<string> {
  const status = getWatchDaemonStatus();
  if (!status.running) {
    return 'Watch daemon is not running.';
  }
  return `Watch daemon is running (pid: ${status.pid}, healthy: ${status.healthy}).`;
}
