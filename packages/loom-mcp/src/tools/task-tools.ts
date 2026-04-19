import type { ToolResult, TaskEntry } from '@spongeacer/loom-core';
import { buildSlotPrompt, createTaskEntry, updateTaskEntry, formatTaskList, appendWalAsync } from '@spongeacer/loom-core';
import { getStore } from '../store.js';
import { ok, err } from './common.js';

export const taskTools = [
  {
    name: 'loom_status',
    description: 'Get the current LOOM context (slot-based prompt)',
    inputSchema: { type: 'object', properties: {} },
    handler: async (): Promise<ToolResult> => {
      const store = getStore();
      if (!store.isInitialized()) return err('LOOM not initialized');
      const prompt = buildSlotPrompt(store);
      store.writeActivePrompt(prompt);
      return ok(prompt);
    },
  },
  {
    name: 'loom_task_list',
    description: 'List all LOOM tasks',
    inputSchema: { type: 'object', properties: {} },
    handler: async (): Promise<ToolResult> => {
      const store = getStore();
      const tasks = store.listEntries().filter((e) => e.type === 'Task') as TaskEntry[];
      return ok(formatTaskList(tasks, store.getWorkingSet().active_task));
    },
  },
  {
    name: 'loom_task_set',
    description: 'Set the active LOOM task',
    inputSchema: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] },
    handler: async (args: Record<string, unknown>): Promise<ToolResult> => {
      const store = getStore();
      const targetId = String(args.id);
      const target = store.getEntry(targetId);
      if (!target || target.type !== 'Task') return err(`Not a valid task: ${targetId}`);
      const ws = store.getWorkingSet();
      ws.active_task = targetId;
      if (!ws.pinned_entries.includes(targetId)) {
        ws.pinned_entries.unshift(targetId);
      }
      if (!ws.hot_entries.includes(targetId)) ws.hot_entries.push(targetId);
      store.saveWorkingSet(ws);
      await appendWalAsync({ type: 'task_set', id: targetId });
      return ok(`Active task set to: ${targetId}`);
    },
  },
  {
    name: 'loom_task_create',
    description: 'Create a new LOOM task',
    inputSchema: { type: 'object', properties: { title: { type: 'string' } }, required: ['title'] },
    handler: async (args: Record<string, unknown>): Promise<ToolResult> => {
      const store = getStore();
      const title = String(args.title);
      const newTask = createTaskEntry(title);
      store.saveEntry(newTask);
      const ws = store.getWorkingSet();
      ws.active_task = newTask.id;
      if (!ws.pinned_entries.includes(newTask.id)) {
        ws.pinned_entries.unshift(newTask.id);
      }
      if (!ws.hot_entries.includes(newTask.id)) ws.hot_entries.push(newTask.id);
      store.saveWorkingSet(ws);
      await appendWalAsync({ type: 'task_create', id: newTask.id });
      return ok(`Created and activated task: ${newTask.id}`);
    },
  },
  {
    name: 'loom_task_update',
    description: 'Update fields of an existing LOOM task',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        title: { type: 'string' },
        status: { type: 'string', enum: ['active', 'blocked', 'completed', 'archived'] },
        intent: { type: 'string', enum: ['explore', 'implement', 'refactor', 'debug', 'review', 'migrate'] },
        priority: { type: 'string', enum: ['critical', 'high', 'medium', 'low'] },
        current: { type: 'string' },
        next: { type: 'string' },
        blocked_by: { type: 'string' },
      },
      required: ['id'],
    },
    handler: async (args: Record<string, unknown>): Promise<ToolResult> => {
      const store = getStore();
      const targetId = String(args.id);
      const target = store.getEntry(targetId);
      if (!target || target.type !== 'Task') return err(`Not a valid task: ${targetId}`);

      const updates: Parameters<typeof updateTaskEntry>[1] = {};
      if (args.title !== undefined) updates.title = String(args.title);
      if (args.status !== undefined) updates.status = String(args.status) as any;
      if (args.intent !== undefined) updates.intent = String(args.intent) as any;
      if (args.priority !== undefined) updates.priority = String(args.priority) as any;
      if (args.current !== undefined) updates.current = String(args.current) || null;
      if (args.next !== undefined) updates.next = String(args.next) || null;
      if (args.blocked_by !== undefined) updates.blocked_by = String(args.blocked_by) || null;

      updateTaskEntry(target, updates);
      store.saveEntry(target);
      return ok(`Updated task: ${targetId}`);
    },
  },
];
