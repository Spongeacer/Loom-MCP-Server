import type { ToolResult } from '@spongeacer/loom-core';
import { runFsScan, runFsHealth, runFsDeps, runFsClean, formatFsHealth, formatFsDeps } from '@spongeacer/loom-core';
import { getStore } from '../store.js';
import { ok, err } from './common.js';

export const fsTools = [
  {
    name: 'loom_fs_scan',
    description: 'Run a filesystem scan to discover new files, update artifact metadata, rebuild dependency graphs, and run health analysis. Use this when new files have been added, when dependencies may have changed, when watch daemon is not running, or when the file list in the prompt feels incomplete.',
    inputSchema: { type: 'object', properties: { dirs: { type: 'array', items: { type: 'string' } } } },
    handler: async (args: Record<string, unknown>): Promise<ToolResult> => {
      const store = getStore();
      const dirs = Array.isArray(args.dirs) ? args.dirs.map(String) : ['src', 'tests'];
      await runFsScan(dirs, store);
      return ok(`FS scan complete for: ${dirs.join(', ')}`);
    },
  },
  {
    name: 'loom_fs_health',
    description: 'Show file health report. Use this to identify stale, orphan, legacy, redundant, or missing artifacts. Helpful before refactoring, cleanup, or when noticing that some files in the project are no longer referenced.',
    inputSchema: { type: 'object', properties: {} },
    handler: async (): Promise<ToolResult> => {
      return ok(formatFsHealth(runFsHealth(getStore())));
    },
  },
  {
    name: 'loom_fs_deps',
    description: 'Show file dependencies (imports and imported-by) for a specific artifact. Use this to understand the impact of modifying a file, to trace how data flows through the codebase, or to find coupling hotspots before refactoring.',
    inputSchema: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] },
    handler: async (args: Record<string, unknown>): Promise<ToolResult> => {
      const result = runFsDeps(getStore(), String(args.path));
      if (!result) return err(`No artifact found for: ${String(args.path)}`);
      return ok(formatFsDeps(result));
    },
  },
  {
    name: 'loom_fs_clean',
    description: 'Archive or delete unhealthy LOOM entries and clean up trash. Use this after a health report identifies stale or orphan artifacts, or as periodic maintenance to keep the LOOM workspace lean.',
    inputSchema: { type: 'object', properties: { days: { type: 'number' } } },
    handler: async (args: Record<string, unknown>): Promise<ToolResult> => {
      const days = args.days != null ? Number(args.days) : 30;
      runFsClean(getStore(), days);
      return ok(`Cleaned trash items older than ${days} days.`);
    },
  },
];
