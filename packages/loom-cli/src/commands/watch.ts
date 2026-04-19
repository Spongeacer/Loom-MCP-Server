import { startWatchDaemon, stopWatchDaemon, getWatchDaemonStatus, formatWatchStatus } from '@spongeacer/loom-core';

export async function runWatch(args: string[]): Promise<string> {
  const dirs = args.length > 0 ? args : ['src', 'tests'];
  return startWatchDaemon(dirs);
}

export function runWatchStop(): string {
  return stopWatchDaemon();
}

export async function runWatchStatus(): Promise<string> {
  return formatWatchStatus(getWatchDaemonStatus());
}
