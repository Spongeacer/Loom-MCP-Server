import type { WatchDaemonStatus } from '../watch-daemon.js';

export function formatWatchStatus(status: WatchDaemonStatus): string {
  if (!status.running) {
    return 'Watch daemon is not running.';
  }
  return `Watch daemon is running (pid: ${status.pid}, healthy: ${status.healthy}).`;
}
