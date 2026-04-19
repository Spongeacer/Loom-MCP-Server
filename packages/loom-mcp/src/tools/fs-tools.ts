import type { ToolResult } from '@spongeacer/loom-core';
import { performFsScan, runFsHealth, runFsDeps, runFsClean, formatFsHealth, formatFsDeps } from '@spongeacer/loom-core';
import { getStore } from '../store.js';
import { ok, err } from './common.js';

export const fsTools = [
  {
    name: 'loom_fs_scan',
    description: 'Run a filesystem scan to discover and update artifacts',
    inputSchema: { type: 'object', properties: { dirs: { type: 'array', items: { type: 'string' } } } },
    handler: async (args: Record<string, unknown>): Promise<ToolResult> => {
      const store = getStore();
      const dirs = Array.isArray(args.dirs) ? args.dirs.map(String) : ['src', 'tests'];
      const projectRoot = store.getProjectRoot();
      await performFsScan(dirs, projectRoot, store);
      return ok(`FS scan complete for: ${dirs.join(', ')}`);
    },
  },
  {
    name: 'loom_fs_health',
    description: 'Show file health report',
    inputSchema: { type: 'object', properties: {} },
    handler: async (): Promise<ToolResult> => {
      return ok(formatFsHealth(runFsHealth(getStore())));
    },
  },
  {
    name: 'loom_fs_deps',
    description: 'Show file dependencies',
    inputSchema: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] },
    handler: async (args: Record<string, unknown>): Promise<ToolResult> => {
      const result = runFsDeps(getStore(), String(args.path));
      if (!result) return err(`No artifact found for: ${String(args.path)}`);
      return ok(formatFsDeps(result));
    },
  },
  {
    name: 'loom_fs_clean',
    description: 'Archive/delete unhealthy files',
    inputSchema: { type: 'object', properties: { days: { type: 'number' } } },
    handler: async (args: Record<string, unknown>): Promise<ToolResult> => {
      runFsClean(getStore(), Number(args.days) || 30);
      return ok(`Cleaned trash items older than ${Number(args.days) || 30} days.`);
    },
  },
];
