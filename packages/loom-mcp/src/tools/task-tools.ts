import type { ToolResult, TaskEntry } from '@spongeacer/loom-core';
import { buildSlotPrompt, createTaskEntry, updateTaskEntry, formatTaskList, appendWalAsync } from '@spongeacer/loom-core';
import { getStore } from '../store.js';
import { ok, err } from './common.js';

export const taskTools = [
  {
    name: 'loom_status',
    description: 'Get the current LOOM context (slot-based prompt). Use this when you need to refresh your understanding of the project state, check the active task, review recent decisions, or verify governance rules before making changes. Also call this if the context feels stale or if you have been working for a while without checking LOOM state.',
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
    description: 'List all LOOM tasks. Use this to understand the current work landscape — what tasks are open, active, blocked, or completed. Helpful when starting work, choosing what to focus on, or checking if a task already exists before creating a new one.',
    inputSchema: { type: 'object', properties: {} },
    handler: async (): Promise<ToolResult> => {
      const store = getStore();
      const tasks = store.listEntries().filter((e) => e.type === 'Task') as TaskEntry[];
      return ok(formatTaskList(tasks, store.getWorkingSet().active_task));
    },
  },
  {
    name: 'loom_task_set',
    description: 'Set the active LOOM task. Use this when switching focus to a different piece of work, when the user asks you to work on something specific, or when a newly created task should become the current focus. The active task drives context injection via 2-hop graph diffusion.',
    inputSchema: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] },
    handler: async (args: Record<string, unknown>): Promise<ToolResult> => {
      const store = getStore();
      if (!store.isInitialized()) return err('LOOM not initialized. Run: loom init "Project Name"');
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
    description: 'Create a new LOOM task. Use this when the user identifies a new piece of work, when a bug is discovered, when a feature is requested, or when refactoring is needed. The new task is automatically set as active and pinned to the working set.',
    inputSchema: { type: 'object', properties: { title: { type: 'string' } }, required: ['title'] },
    handler: async (args: Record<string, unknown>): Promise<ToolResult> => {
      const store = getStore();
      if (!store.isInitialized()) return err('LOOM not initialized. Run: loom init "Project Name"');
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
    description: 'Update fields of an existing LOOM task. Use this when task status changes (e.g. blocked, completed), when progress is made (update current/next steps), when priorities shift, or when blockers are identified or resolved.',
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
      if (!store.isInitialized()) return err('LOOM not initialized. Run: loom init "Project Name"');
      const targetId = String(args.id);
      const target = store.getEntry(targetId);
      if (!target || target.type !== 'Task') return err(`Not a valid task: ${targetId}`);

      const updates: Parameters<typeof updateTaskEntry>[1] = {};
      if (args.title !== undefined) updates.title = String(args.title);
      if (args.status !== undefined) {
        const s = String(args.status);
        if (!['active', 'blocked', 'completed', 'archived'].includes(s)) return err(`Invalid status: ${s}`);
        updates.status = s as any;
      }
      if (args.intent !== undefined) {
        const s = String(args.intent);
        if (!['explore', 'implement', 'refactor', 'debug', 'review', 'migrate'].includes(s)) return err(`Invalid intent: ${s}`);
        updates.intent = s as any;
      }
      if (args.priority !== undefined) {
        const s = String(args.priority);
        if (!['critical', 'high', 'medium', 'low'].includes(s)) return err(`Invalid priority: ${s}`);
        updates.priority = s as any;
      }
      if (args.current !== undefined) updates.current = String(args.current) || null;
      if (args.next !== undefined) updates.next = String(args.next) || null;
      if (args.blocked_by !== undefined) updates.blocked_by = String(args.blocked_by) || null;

      updateTaskEntry(target, updates);
      store.saveEntry(target);
      await appendWalAsync({ type: 'task_update', id: targetId, fields: Object.keys(updates) });
      return ok(`Updated task: ${targetId}`);
    },
  },
];
