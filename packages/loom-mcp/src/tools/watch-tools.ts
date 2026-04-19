import type { ToolResult } from '@spongeacer/loom-core';
import { startWatchDaemon, stopWatchDaemon, getWatchDaemonStatus, formatWatchStatus } from '@spongeacer/loom-core';
import { ok } from './common.js';

export const watchTools = [
  {
    name: 'loom_watch_start',
    description: 'Start the LOOM file watch daemon',
    inputSchema: { type: 'object', properties: { dirs: { type: 'array', items: { type: 'string' } } } },
    handler: async (args: Record<string, unknown>): Promise<ToolResult> => {
      const dirs = Array.isArray(args.dirs) ? args.dirs.map(String) : ['src', 'tests'];
      const result = await startWatchDaemon(dirs);
      return ok(result);
    },
  },
  {
    name: 'loom_watch_stop',
    description: 'Stop the LOOM file watch daemon',
    inputSchema: { type: 'object', properties: {} },
    handler: async (): Promise<ToolResult> => {
      return ok(stopWatchDaemon());
    },
  },
  {
    name: 'loom_watch_status',
    description: 'Check the LOOM watch daemon status',
    inputSchema: { type: 'object', properties: {} },
    handler: async (): Promise<ToolResult> => {
      return ok(formatWatchStatus(getWatchDaemonStatus()));
    },
  },
];
