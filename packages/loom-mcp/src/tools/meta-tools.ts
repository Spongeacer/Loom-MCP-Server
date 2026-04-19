import type { ToolResult } from '@spongeacer/loom-core';
import {
  runDoctor,
  runSession,
  runSkillList,
  runSkillExtract,
  runDiary,
  formatDoctorReport,
  formatSkillList,
  formatDiary,
} from '@spongeacer/loom-core';
import { getStore } from '../store.js';
import { ok, err } from './common.js';

export const metaTools = [
  {
    name: 'loom_ping',
    description: 'Ping the LOOM MCP server',
    inputSchema: { type: 'object', properties: {} },
    handler: async (): Promise<ToolResult> => {
      return ok('pong');
    },
  },
  {
    name: 'loom_doctor',
    description: 'Run LOOM self-diagnostic checks',
    inputSchema: { type: 'object', properties: {} },
    handler: async (): Promise<ToolResult> => {
      return ok(formatDoctorReport(runDoctor(getStore())));
    },
  },
  {
    name: 'loom_session',
    description: 'Recall recent session activity',
    inputSchema: { type: 'object', properties: { sub: { type: 'string', enum: ['summary', 'recent'] }, hours: { type: 'number' }, limit: { type: 'number' } } },
    handler: async (args: Record<string, unknown>): Promise<ToolResult> => {
      const sub = (args.sub as 'summary' | 'recent') || 'summary';
      const result = runSession(getStore(), sub, { hours: Number(args.hours), limit: Number(args.limit) });
      return ok(result.content);
    },
  },
  {
    name: 'loom_skill',
    description: 'List or extract LOOM skills',
    inputSchema: { type: 'object', properties: { action: { type: 'string', enum: ['list', 'extract'] }, task_id: { type: 'string' } } },
    handler: async (args: Record<string, unknown>): Promise<ToolResult> => {
      const store = getStore();
      const action = (args.action as 'list' | 'extract') || 'list';
      if (action === 'list') {
        return ok(formatSkillList(runSkillList(store)));
      }
      if (!args.task_id) return err('task_id is required for extract action');
      const { skillId, taskId } = runSkillExtract(store, String(args.task_id));
      return ok(`Extracted skill: ${skillId} from task ${taskId}`);
    },
  },
  {
    name: 'loom_diary',
    description: 'Generate a daily diary for the active task',
    inputSchema: { type: 'object', properties: { task_id: { type: 'string' }, save: { type: 'boolean' } } },
    handler: async (args: Record<string, unknown>): Promise<ToolResult> => {
      const store = getStore();
      let taskId = String(args.task_id || '');
      if (!taskId) {
        const ws = store.getWorkingSet();
        if (!ws.active_task) return err('No active task. Provide task_id or set an active task.');
        taskId = ws.active_task;
      }
      return ok(formatDiary(runDiary(store, taskId, Boolean(args.save))));
    },
  },
  {
    name: 'loom_init',
    description: 'Initialize a LOOM workspace',
    inputSchema: { type: 'object', properties: { project_name: { type: 'string' } }, required: ['project_name'] },
    handler: async (args: Record<string, unknown>): Promise<ToolResult> => {
      const store = getStore();
      if (store.isInitialized()) {
        return err('LOOM workspace already initialized.');
      }
      store.initWorkspace(String(args.project_name));
      return ok(`Initialized LOOM workspace: ${String(args.project_name)}`);
    },
  },
];
