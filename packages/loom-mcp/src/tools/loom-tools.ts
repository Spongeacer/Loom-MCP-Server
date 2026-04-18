import type { ToolResult, StoreAdapter, TaskEntry } from '@spongeacer/loom-core';
import { FileSystemStoreAdapter, buildSlotPrompt } from '@spongeacer/loom-core';
import { performFsScan, getWatchDaemonStatus, startWatchDaemon, stopWatchDaemon } from '@spongeacer/loom-core';
import { runDoctor, runSession, runSkillList, runSkillExtract, runDiary, runFsHealth, runFsDeps, runFsClean } from '@spongeacer/loom-core';

function ok(text: string): ToolResult {
  return { content: [{ type: 'text', text }] };
}

function err(text: string): ToolResult {
  return { content: [{ type: 'text', text }], isError: true };
}

function getStore(): StoreAdapter {
  return new FileSystemStoreAdapter();
}

function createTaskEntry(
  title: string,
  intent: TaskEntry['task']['intent'] = 'feature',
  priority: TaskEntry['task']['priority'] = 'medium'
): TaskEntry {
  const id = `task-${title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
  const now = new Date().toISOString();
  return {
    id, type: 'Task', version: 1, namespace: 'project',
    content: { l1_5: title.slice(0, 30), l2: title, l3: title },
    lifecycle: { state: 'active', created: now, updated: now, last_accessed: now, last_activated: now, activation_count: 1, verification_count: 0, promoted_from: null, demotion_reason: null },
    quality: { freshness: 1, trust: 0.9, activity: 1, composite_score: 0.95 },
    trust: { level: 'verified', source: 'human' },
    activation: { paths: [], keywords: [], intents: [], tools: [], entry_refs: [] },
    conflicts: { supersedes: [], conflicts_with: [], overridden_by: null, precedence: 0, resolution_policy: 'newest_wins' },
    bindings_out: [], bindings_in: [],
    task: { title, status: 'active', intent, priority, working_set: [], related_entries: [], acceptance_criteria: [], unresolved_questions: [], progress: { completed: [], current: null, next: null, blocked_by: null }, started_in: now, last_touched: now },
  };
}

export const loomTools = [
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
      const ws = store.getWorkingSet();
      const tasks = store.listEntries().filter((e) => e.type === 'Task') as TaskEntry[];
      const lines: string[] = ['=== Active Task ===', ws.active_task || '(none)', '\n=== All Tasks ==='];
      for (const t of tasks) {
        const marker = t.id === ws.active_task ? '* ' : '  ';
        lines.push(`${marker}[${t.task.status}] ${t.id}: ${t.task.title}`);
      }
      return ok(lines.join('\n'));
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
      ws.pinned_entries = [targetId];
      if (!ws.hot_entries.includes(targetId)) ws.hot_entries.push(targetId);
      store.saveWorkingSet(ws);
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
      ws.pinned_entries = [newTask.id];
      if (!ws.hot_entries.includes(newTask.id)) ws.hot_entries.push(newTask.id);
      store.saveWorkingSet(ws);
      return ok(`Created and activated task: ${newTask.id}`);
    },
  },
  {
    name: 'loom_entry_expand',
    description: 'Expand a LOOM entry to show more detail',
    inputSchema: { type: 'object', properties: { id: { type: 'string' }, level: { type: 'string', enum: ['l2', 'l3'] } }, required: ['id'] },
    handler: async (args: Record<string, unknown>): Promise<ToolResult> => {
      const store = getStore();
      const id = String(args.id);
      const level = (args.level as 'l2' | 'l3') || 'l2';
      const entry = store.getEntry(id);
      if (!entry) return err(`Entry not found: ${id}`);
      const lines = [`=== ${entry.id} (${entry.type}) ===`, `L1.5: ${entry.content.l1_5}`, `L2: ${entry.content.l2}`];
      if (level === 'l3') {
        const l3 = typeof entry.content.l3 === 'string' ? entry.content.l3 : `[file: ${entry.content.l3.file}]`;
        lines.push(`L3: ${l3}`);
      }
      return ok(lines.join('\n'));
    },
  },
  {
    name: 'loom_entry_explain',
    description: 'Explain a LOOM entry metadata and bindings',
    inputSchema: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] },
    handler: async (args: Record<string, unknown>): Promise<ToolResult> => {
      const store = getStore();
      const entry = store.getEntry(String(args.id));
      if (!entry) return err(`Entry not found: ${String(args.id)}`);
      const lines = [`=== ${entry.id} ===`, `Type: ${entry.type}`, `Namespace: ${entry.namespace}`, `Lifecycle: ${entry.lifecycle.state}`, `Bindings out: ${entry.bindings_out.length}`, `Bindings in: ${entry.bindings_in.length}`];
      return ok(lines.join('\n'));
    },
  },
  {
    name: 'loom_fs_scan',
    description: 'Run a filesystem scan to discover and update artifacts',
    inputSchema: { type: 'object', properties: { dirs: { type: 'array', items: { type: 'string' } } } },
    handler: async (args: Record<string, unknown>): Promise<ToolResult> => {
      const store = getStore();
      const dirs = Array.isArray(args.dirs) ? args.dirs.map(String) : ['src', 'tests'];
      await performFsScan(dirs, process.cwd(), store);
      return ok(`FS scan complete for: ${dirs.join(', ')}`);
    },
  },
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
      const status = getWatchDaemonStatus();
      return ok(`Watch daemon: ${status.running ? `running (pid: ${status.pid}, healthy: ${status.healthy})` : 'not running'}`);
    },
  },
  {
    name: 'loom_trash_list',
    description: 'List deleted LOOM entries in trash',
    inputSchema: { type: 'object', properties: {} },
    handler: async (): Promise<ToolResult> => {
      const items = getStore().listTrash();
      if (items.length === 0) return ok('Trash is empty.');
      return ok(items.map((i) => `${i.id} (${i.type}) — deleted ${i.deletedAt}`).join('\n'));
    },
  },
  {
    name: 'loom_trash_restore',
    description: 'Restore a LOOM entry from trash',
    inputSchema: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] },
    handler: async (args: Record<string, unknown>): Promise<ToolResult> => {
      getStore().restoreFromTrash(String(args.id));
      return ok(`Restored ${String(args.id)} from trash.`);
    },
  },
  {
    name: 'loom_trash_purge',
    description: 'Permanently delete all items in trash',
    inputSchema: { type: 'object', properties: {} },
    handler: async (): Promise<ToolResult> => {
      getStore().purgeTrash(0);
      return ok('Trash purged.');
    },
  },
  {
    name: 'loom_doctor',
    description: 'Run LOOM self-diagnostic checks',
    inputSchema: { type: 'object', properties: {} },
    handler: async (): Promise<ToolResult> => {
      const report = runDoctor(getStore());
      const lines: string[] = [];
      for (const c of report.ok) lines.push(`✓ [OK] ${c.message}`);
      for (const c of report.warnings) lines.push(`⚠ [WARNING] ${c.message}`);
      for (const c of report.critical) lines.push(`✗ [CRITICAL] ${c.message}`);
      if (report.warnings.length === 0 && report.critical.length === 0) {
        lines.push('\nAll checks passed.');
      } else {
        lines.push('\nSome issues found. Review above.');
      }
      return ok(lines.join('\n'));
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
        const result = runSkillList(store);
        const lines = [`=== Skills (${result.skills.length}) ===`];
        for (const s of result.skills) lines.push(`- ${s.id}: ${s.title} (v${s.version}, trust=${s.trust})`);
        return ok(lines.join('\n'));
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
      const { memoryId, l2, l3, saved } = runDiary(store, taskId, Boolean(args.save));
      const lines: string[] = [];
      if (saved) { lines.push(`Diary saved: ${memoryId}`); lines.push('---'); }
      else { lines.push('=== Preview (not saved) ==='); }
      lines.push(`l2: ${l2}`); lines.push(''); lines.push(l3);
      return ok(lines.join('\n'));
    },
  },
  {
    name: 'loom_fs_health',
    description: 'Show file health report',
    inputSchema: { type: 'object', properties: {} },
    handler: async (): Promise<ToolResult> => {
      const result = runFsHealth(getStore());
      const lines: string[] = ['=== File Health Report ==='];
      for (const [status, items] of Object.entries(result.items)) {
        if (items.length === 0) continue;
        lines.push(`\n[${status.toUpperCase()}] (${items.length})`);
        for (const item of items.slice(0, 10)) lines.push(`  ${item.path} — ${item.reasons.join(', ') || 'OK'}`);
      }
      return ok(lines.join('\n'));
    },
  },
  {
    name: 'loom_fs_deps',
    description: 'Show file dependencies',
    inputSchema: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] },
    handler: async (args: Record<string, unknown>): Promise<ToolResult> => {
      const result = runFsDeps(getStore(), String(args.path));
      if (!result) return err(`No artifact found for: ${String(args.path)}`);
      return ok(`=== Dependencies for ${result.targetPath} ===\nImports: ${result.imports.join(', ') || '(none)'}\nImported by: ${result.importedBy.join(', ') || '(none)'}`);
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
