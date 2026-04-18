import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  truncateText,
  sanitizeId,
  sanitizeString,
  sanitizeStringArray,
  sanitizeInteger,
  mcpError,
} from './mcp-utils.js';
import { withCache, withLock } from './mcp-cache.js';
import { getConfig, withStoreTransactionAsync } from './core/store.js';
import { markArtifactDirty } from './core/dirty-tracker.js';
import { resolveProjectRoot, isWithinProject } from './core/paths.js';
import {
  MCP_CACHE_TTL_MS,
  DEFAULT_FS_SCAN_DIRS,
  DEFAULT_WATCH_DIRS,
  FS_SCAN_WORKER_TIMEOUT_MS,
} from './core/constants.js';



import type { ToolResult } from './types/index.js';

export interface ToolContext {
  requestId?: string | number;
  txId?: string;
}

export interface ToolDef {
  name: string;
  description: string;
  inputSchema: object;
  handler: (args: unknown, ctx: ToolContext) => Promise<ToolResult>;
}

const tools: ToolDef[] = [];

function register(
  name: string,
  description: string,
  inputSchema: object,
  handler: (args: unknown, ctx: ToolContext) => Promise<ToolResult>
): void {
  tools.push({ name, description, inputSchema, handler });
}

function listTools(): ToolDef[] {
  return tools;
}

export async function dispatch(name: string, args: unknown, ctx?: ToolContext): Promise<ToolResult> {
  const tool = tools.find((t) => t.name === name);
  if (!tool) return mcpError(`Unknown tool: ${name}`);
  const fullCtx: ToolContext = {
    ...ctx,
    txId: ctx?.txId || `tx-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
  };
  return tool.handler(args, fullCtx);
}

// ===== Tool definitions =====

register(
  'loom_status',
  'Get the current slot-based LOOM context including active task, working set, decisions, and risks. Also updates cache/active-prompt.txt.',
  { type: 'object', properties: {} },
  async () => {
    const root = resolveProjectRoot();
    return withCache(`loom_status:${root}`, MCP_CACHE_TTL_MS, async () => {
      const { runStatus } = await import('./commands/status.js');
      const text = await runStatus();
      const { getPaths } = await import('./core/paths.js');
      const promptPath = getPaths(root).activePrompt;
      const cachedText = fs.existsSync(promptPath) ? fs.readFileSync(promptPath, 'utf-8') : text;
      return { content: [{ type: 'text', text: truncateText(cachedText) }] };
    });
  }
);

register(
  'loom_read_prompt',
  'Read the pre-rendered active prompt from cache without shell overhead.',
  { type: 'object', properties: {} },
  async () => {
    const root = resolveProjectRoot();
    return withCache(`loom_read_prompt:${root}`, MCP_CACHE_TTL_MS, async () => {
      const { getPaths } = await import('./core/paths.js');
      const promptPath = getPaths(root).activePrompt;
      if (!fs.existsSync(promptPath)) {
        return { content: [{ type: 'text', text: 'LOOM not initialized or active-prompt.txt missing. Run loom_init to initialize.' }] };
      }
      const text = fs.readFileSync(promptPath, 'utf-8');
      return { content: [{ type: 'text', text: truncateText(text) }] };
    });
  }
);

register(
  'loom_init',
  'Initialize a LOOM workspace in the current directory.',
  {
    type: 'object',
    properties: {
      project_name: { type: 'string', description: 'Project name for the LOOM workspace' },
    },
    required: ['project_name'],
  },
  async (args) => {
    const projectName = sanitizeString((args as any).project_name, 128) || 'Untitled';
    const { initWorkspace } = await import('./core/store.js');
    const root = resolveProjectRoot();
    initWorkspace(projectName, root);
    return { content: [{ type: 'text', text: `Initialized LOOM workspace "${projectName}" at ${root}` }] };
  }
);

register(
  'loom_expand',
  'Expand a LOOM entry to see its full details (L3).',
  {
    type: 'object',
    properties: {
      id: { type: 'string', description: 'Entry ID' },
      level: { type: 'string', enum: ['l2', 'l3'], description: 'Detail level (default: l3)' },
    },
    required: ['id'],
  },
  async (args) => {
    const id = sanitizeId((args as any).id);
    if (!id) return mcpError('Invalid or missing "id" parameter.');
    const level = sanitizeString((args as any).level) || 'l3';
    if (level !== 'l2' && level !== 'l3') return mcpError('Invalid "level" parameter.');
    const { runExpand } = await import('./commands/expand.js');
    const output = runExpand([id, level]);
    return { content: [{ type: 'text', text: truncateText(output) }] };
  }
);

register(
  'loom_explain',
  'Explain an entry metadata, lifecycle, and bindings.',
  {
    type: 'object',
    properties: { id: { type: 'string' } },
    required: ['id'],
  },
  async (args) => {
    const id = sanitizeId((args as any).id);
    if (!id) return mcpError('Invalid or missing "id" parameter.');
    const { runExplain } = await import('./commands/explain.js');
    const output = runExplain([id]);
    return { content: [{ type: 'text', text: truncateText(output) }] };
  }
);

register(
  'loom_why',
  'Explain why an entry is relevant to the current context.',
  {
    type: 'object',
    properties: { id: { type: 'string' } },
    required: ['id'],
  },
  async (args) => {
    const id = sanitizeId((args as any).id);
    if (!id) return mcpError('Invalid or missing "id" parameter.');
    const { runWhy } = await import('./commands/why.js');
    const output = runWhy([id]);
    return { content: [{ type: 'text', text: truncateText(output) }] };
  }
);

register(
  'loom_session_recall',
  'Recall recent session activity from the WAL event log.',
  {
    type: 'object',
    properties: {
      hours_back: { type: 'integer', description: 'Hours of history to summarize (default: 24)' },
      filter_type: { type: 'string', description: 'Optional WAL event type filter (e.g., task_set, fs_scan)' },
    },
  },
  async (args) => {
    const { readWalEvents, summarizeSession } = await import('./core/session-recall.js');
    const hoursBack = sanitizeInteger((args as any).hours_back, 1, 720) || 24;
    const filterType = sanitizeString((args as any).filter_type, 64) || undefined;
    const root = resolveProjectRoot();
    if (filterType) {
      const events = readWalEvents(root, 50, filterType);
      const lines = events.map(
        (ev) =>
          `[${ev.t}] ${ev.type}: ${JSON.stringify(
            Object.fromEntries(Object.entries(ev).filter(([k]) => k !== 't' && k !== 'type'))
          )}`
      );
      return { content: [{ type: 'text', text: truncateText(lines.join('\n') || 'No matching events.') }] };
    }
    return { content: [{ type: 'text', text: truncateText(summarizeSession(root, hoursBack)) }] };
  }
);

register(
  'loom_task_set',
  'Set the active task by ID.',
  {
    type: 'object',
    properties: { id: { type: 'string', description: 'Task entry ID' } },
    required: ['id'],
  },
  async (args) => {
    const id = sanitizeId((args as any).id);
    if (!id) return mcpError('Invalid or missing "id" parameter.');
    const { runTask } = await import('./commands/task.js');
    const output = await runTask(['set', id]);
    return { content: [{ type: 'text', text: truncateText(output) }] };
  }
);

register(
  'loom_task_create',
  'Create a new task and set it as active.',
  {
    type: 'object',
    properties: {
      title: { type: 'string', description: 'Task title' },
      intent: { type: 'string', enum: ['bugfix', 'feature', 'refactor', 'analysis', 'docs', 'ops'], description: 'Task intent' },
      priority: { type: 'string', enum: ['low', 'medium', 'high', 'critical'], description: 'Task priority' },
    },
    required: ['title'],
  },
  async (args, ctx) => {
    const title = sanitizeString((args as any).title, 256);
    if (!title) return mcpError('Invalid or missing "title" parameter.');
    const rawIntent = sanitizeString((args as any).intent, 32) || 'feature';
    const rawPriority = sanitizeString((args as any).priority, 32) || 'medium';
    const intent = (['bugfix', 'feature', 'refactor', 'analysis', 'docs', 'ops'] as const).includes(rawIntent as any)
      ? (rawIntent as import('./types/index.js').TaskEntry['task']['intent'])
      : 'feature';
    const priority = (['low', 'medium', 'high', 'critical'] as const).includes(rawPriority as any)
      ? (rawPriority as import('./types/index.js').TaskEntry['task']['priority'])
      : 'medium';

    const { createTaskEntry } = await import('./commands/task.js');
    const { saveEntry, saveWorkingSet, getWorkingSet } = await import('./core/store.js');
    const { appendWalAsync } = await import('./core/wal-queue.js');
    const { updateUserProfileFromTask } = await import('./core/user-profile.js');

    const newTask = createTaskEntry(title, intent, priority);
    const root = resolveProjectRoot();
    await withStoreTransactionAsync(root, async () => {
      saveEntry(newTask, root, true);
      updateUserProfileFromTask(newTask, root);
      const ws = getWorkingSet(root);
      ws.active_task = newTask.id;
      ws.pinned_entries = [newTask.id];
      if (!ws.hot_entries.includes(newTask.id)) {
        ws.hot_entries.push(newTask.id);
      }
      saveWorkingSet(ws, root);
    });
    await appendWalAsync({ type: 'task_create', id: newTask.id, request_id: ctx.requestId, tx_id: ctx.txId }, root);
    return { content: [{ type: 'text', text: `Created and activated task: ${newTask.id}` }] };
  }
);

register(
  'loom_task_update',
  'Update an existing task\'s progress, status, priority, or other fields.',
  {
    type: 'object',
    properties: {
      id: { type: 'string', description: 'Task entry ID' },
      title: { type: 'string' },
      status: { type: 'string', enum: ['active', 'open', 'blocked', 'done', 'abandoned'] },
      intent: { type: 'string', enum: ['bugfix', 'feature', 'refactor', 'analysis', 'docs', 'ops'] },
      priority: { type: 'string', enum: ['low', 'medium', 'high', 'critical'] },
      current: { type: 'string', description: 'Current step being worked on' },
      next: { type: 'string', description: 'Next planned step' },
      blocked_by: { type: 'string', description: 'What is blocking the task' },
      completed: { type: 'array', items: { type: 'string' }, description: 'List of completed steps' },
      acceptance_criteria: { type: 'array', items: { type: 'string' } },
      unresolved_questions: { type: 'array', items: { type: 'string' } },
    },
    required: ['id'],
  },
  async (args, ctx) => {
    const id = sanitizeId((args as any).id);
    if (!id) return mcpError('Invalid or missing "id" parameter.');
    const { getEntry, saveEntry, withStoreTransactionAsync } = await import('./core/store.js');
    const { updateTaskEntry } = await import('./commands/task.js');
    const { appendWalAsync } = await import('./core/wal-queue.js');
    const root = resolveProjectRoot();
    const entry = getEntry(id, root);
    if (!entry || entry.type !== 'Task') {
      return mcpError(`Not a valid task: ${id}`);
    }
    const a = args as Record<string, unknown>;
    const updates: Parameters<typeof updateTaskEntry>[1] = {};
    const stringFields: Array<[keyof typeof updates, number]> = [
      ['title', 256],
      ['status', 32],
      ['intent', 32],
      ['priority', 32],
      ['current', 1024],
      ['next', 1024],
      ['blocked_by', 1024],
    ];
    for (const [key, maxLen] of stringFields) {
      if (a[key] !== undefined) {
        const val = sanitizeString(a[key] as string, maxLen);
        (updates as any)[key] = ['current', 'next', 'blocked_by'].includes(key as string) ? (val || null) : val;
      }
    }
    const arrayFields: (keyof typeof updates)[] = ['completed', 'acceptance_criteria', 'unresolved_questions'];
    for (const key of arrayFields) {
      if (a[key] !== undefined) {
        (updates as any)[key] = sanitizeStringArray(a[key] as string[]) || [];
      }
    }
    const expectedVersion = entry.version;
    await withStoreTransactionAsync(root, async () => {
      updateTaskEntry(entry, updates);
      saveEntry(entry, root, true, expectedVersion);
    });
    await appendWalAsync({ type: 'task_update', id, request_id: ctx.requestId, tx_id: ctx.txId }, root);
    return { content: [{ type: 'text', text: `Updated task: ${id}` }] };
  }
);

register(
  'loom_record_decision',
  'Record a new decision entry.',
  {
    type: 'object',
    properties: {
      question: { type: 'string' },
      chosen: { type: 'string' },
      rationale: { type: 'string' },
      impact_scope: { type: 'array', items: { type: 'string' } },
    },
    required: ['question', 'chosen', 'rationale'],
  },
  async (args, ctx) => {
    const a = args as Record<string, unknown>;
    const question = sanitizeString(a.question, 2048);
    const chosen = sanitizeString(a.chosen, 256);
    const rationale = sanitizeString(a.rationale, 4096);
    const impactScope = sanitizeStringArray(a.impact_scope) || [];
    if (!question || !chosen || !rationale) {
      return mcpError('Missing or invalid required fields: question, chosen, rationale.');
    }
    const { saveEntry } = await import('./core/store.js');
    const { appendWalAsync } = await import('./core/wal-queue.js');
    const { updateUserProfileFromDecision } = await import('./core/user-profile.js');
    const idBase = chosen.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'decision';
    const id = `decision-${idBase}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 5)}`;
    const now = new Date().toISOString();
    const entry: import('./types/index.js').DecisionEntry = {
      id,
      type: 'Decision',
      version: 1,
      namespace: 'project',
      content: {
        l1_5: chosen.slice(0, 30),
        l2: `${question} -> ${chosen}`,
        l3: `Question: ${question}\nChosen: ${chosen}\nRationale: ${rationale}\nImpact: ${impactScope.join(' / ')}`,
      },
      lifecycle: {
        state: 'active',
        created: now,
        updated: now,
        last_accessed: now,
        last_activated: now,
        activation_count: 1,
        verification_count: 0,
        promoted_from: null,
        demotion_reason: null,
      },
      quality: {
        freshness: 1.0,
        trust: 0.9,
        activity: 1.0,
        composite_score: 0.95,
      },
      trust: {
        level: 'verified',
        source: 'model',
      },
      activation: {
        paths: [],
        keywords: [],
        intents: [],
        tools: [],
        entry_refs: [],
      },
      conflicts: {
        supersedes: [],
        conflicts_with: [],
        overridden_by: null,
        precedence: 0,
        resolution_policy: 'newest_wins',
      },
      bindings_out: [],
      bindings_in: [],
      decision: {
        question,
        chosen,
        rationale,
        rejected: [] as { option: string; reason: string }[],
        assumptions: [] as string[],
        impact_scope: impactScope,
        supersedes: null,
        made_in: now,
      },
    };
    const root = resolveProjectRoot();
    await withStoreTransactionAsync(root, async () => {
      saveEntry(entry, root, true);
      updateUserProfileFromDecision(entry, root);
    });
    markArtifactDirty(path.join('.loom', 'entries', 'decisions', `${id}.loom.yml`));
    await appendWalAsync({ type: 'decision_recorded', id, request_id: ctx.requestId, tx_id: ctx.txId }, root);
    return { content: [{ type: 'text', text: `Decision recorded: ${id}` }] };
  }
);

register(
  'loom_skill_extract',
  'Extract a reusable Skill entry from a completed Task.',
  {
    type: 'object',
    properties: {
      task_id: { type: 'string', description: 'Task entry ID to extract skill from' },
    },
    required: ['task_id'],
  },
  async (args, ctx) => {
    const taskId = sanitizeId((args as any).task_id);
    if (!taskId) return mcpError('Invalid or missing "task_id" parameter.');
    const { saveExtractedSkill } = await import('./core/skill-extraction.js');
    const skillId = saveExtractedSkill(taskId, undefined, ctx.requestId);
    if (skillId) {
      markArtifactDirty(path.join('.loom', 'entries', 'skills', `${skillId}.loom.yml`));
      return { content: [{ type: 'text', text: `Skill extracted: ${skillId} from ${taskId}` }] };
    }
    return { content: [{ type: 'text', text: `Failed to extract skill from ${taskId}. Ensure it is a valid Task entry.` }] };
  }
);

register(
  'loom_diary_generate',
  'Generate a daily diary Memory entry for a Task by reading today\'s WAL events and calling an LLM. Requires KIMI_API_KEY or OPENAI_API_KEY.',
  {
    type: 'object',
    properties: {
      task_id: { type: 'string', description: 'Task entry ID (default: active task)' },
      save: { type: 'boolean', description: 'Whether to save the diary entry (default: true)' },
    },
  },
  async (args, _ctx) => {
    let taskId = sanitizeId((args as any).task_id);
    const save = (args as any).save !== false;
    const root = resolveProjectRoot();
    if (!taskId) {
      const { getWorkingSet } = await import('./core/store.js');
      const ws = getWorkingSet(root);
      if (ws.active_task) {
        taskId = ws.active_task;
      } else {
        return mcpError('No task_id provided and no active task found.');
      }
    }
    const { generateDiary } = await import('./core/diary-generator.js');
    try {
      const result = await generateDiary(taskId, undefined, save);
      if (save) {
        markArtifactDirty(path.join('.loom', 'entries', 'memories', `${result.memoryId}.loom.yml`));
      }
      return {
        content: [
          {
            type: 'text',
            text: save
              ? `Diary saved: ${result.memoryId}\n---\nl2: ${result.l2}\n\n${result.l3}`
              : `Diary preview:\n---\nl2: ${result.l2}\n\n${result.l3}`,
          },
        ],
      };
    } catch (err) {
      return mcpError((err as Error).message);
    }
  }
);

register(
  'loom_watch_start',
  'Start the background file watcher daemon. It auto-registers artifacts and creates Level 0 bindings on file changes.',
  {
    type: 'object',
    properties: {
      dirs: { type: 'array', items: { type: 'string' }, description: 'Directories to watch (default: src, tests)' },
    },
  },
  async (args) => {
    const { startWatchDaemon } = await import('./core/watch-daemon.js');
    const rawDirs = (args as any).dirs;
    const root = resolveProjectRoot();
    const dirs = Array.isArray(rawDirs)
      ? rawDirs
          .map((d: unknown) => String(d).trim())
          .filter((d: string) => d && !/[;&|`$(){}[\]\n\r]/.test(d))
          .filter((d: string) => isWithinProject(root, d))
      : DEFAULT_WATCH_DIRS;
    const output = startWatchDaemon(dirs.length > 0 ? dirs : DEFAULT_WATCH_DIRS);
    return { content: [{ type: 'text', text: truncateText(output) }] };
  }
);

register(
  'loom_watch_stop',
  'Stop the background file watcher daemon.',
  { type: 'object', properties: {} },
  async () => {
    const { stopWatchDaemon } = await import('./core/watch-daemon.js');
    const output = stopWatchDaemon();
    return { content: [{ type: 'text', text: truncateText(output) }] };
  }
);

register(
  'loom_watch_status',
  'Check whether the background file watcher is running.',
  { type: 'object', properties: {} },
  async () => {
    const { getWatchStatusAsync } = await import('./core/watch-daemon.js');
    const status = await getWatchStatusAsync();
    if (status.running) {
      return { content: [{ type: 'text', text: `Watch daemon running (pid: ${status.pid}). Dirs: ${status.dirs?.join(', ')}` }] };
    }
    return { content: [{ type: 'text', text: 'Watch daemon is not running.' }] };
  }
);

register(
  'loom_doctor',
  'Run LOOM self-diagnostic checks: MCP config drift, stale hardcoded paths, build freshness, watch daemon health, and legacy naming.',
  { type: 'object', properties: {} },
  async () => {
    const { runDoctor } = await import('./core/doctor.js');
    const results = runDoctor(resolveProjectRoot());
    const lines = results.map((r) => {
      const icon = r.level === 'ok' ? '✓' : r.level === 'warning' ? '⚠' : '✗';
      return `${icon} [${r.level.toUpperCase()}] ${r.message}`;
    });
    return { content: [{ type: 'text', text: truncateText(lines.join('\n')) }] };
  }
);

register(
  'loom_fs_scan',
  'Scan project files, update filesystem metadata, rebuild dependency graph, and run health analysis.',
  {
    type: 'object',
    properties: {
      dirs: { type: 'array', items: { type: 'string' }, description: 'Directories to scan (default: src, tests)' },
    },
  },
  async (args) => {
    const root = resolveProjectRoot();
    return withLock(
      `loom_fs_scan:${root}`,
      async () => {
        const rawDirs = (args as any).dirs;
        const dirs = Array.isArray(rawDirs)
          ? rawDirs
              .map((d: unknown) => String(d).trim())
              .filter((d: string) => d && !/[;&|`$(){}[\]\n\r]/.test(d))
              .filter((d: string) => isWithinProject(root, d))
          : DEFAULT_FS_SCAN_DIRS;
        const { runFsScan } = await import('./commands/fs.js');
        const output = await runFsScan(dirs.length > 0 ? dirs : DEFAULT_FS_SCAN_DIRS);
        return { content: [{ type: 'text', text: truncateText(output || 'FS scan completed.') }] };
      },
      'FS scan is already in progress. Please wait.'
    );
  }
);

register(
  'loom_fs_deps',
  'Show imports and imported-by for a given file path or artifact id.',
  {
    type: 'object',
    properties: { path: { type: 'string', description: 'File path or artifact id' } },
    required: ['path'],
  },
  async (args) => {
    const p = sanitizeString((args as any).path, 512);
    if (!p) return mcpError('Invalid or missing "path" parameter.');
    const { runFsDeps } = await import('./commands/fs.js');
    const output = runFsDeps([p]);
    return { content: [{ type: 'text', text: truncateText(output || `No deps info for ${p}.`) }] };
  }
);

register(
  'loom_fs_health',
  'Show file health report including stale, orphan, legacy, redundant, and missing files.',
  { type: 'object', properties: {} },
  async () => {
    const { runFsHealth } = await import('./commands/fs.js');
    const output = runFsHealth();
    return { content: [{ type: 'text', text: truncateText(output || 'No health data.') }] };
  }
);

register(
  'loom_fs_trash',
  'List trash candidates recommended for archive or deletion.',
  { type: 'object', properties: {} },
  async () => {
    const { runFsTrash } = await import('./commands/fs.js');
    const output = runFsTrash();
    return { content: [{ type: 'text', text: truncateText(output || 'No trash candidates.') }] };
  }
);

register(
  'loom_fs_clean',
  'Archive or delete unhealthy files based on the trash candidates list. Use with care.',
  {
    type: 'object',
    properties: {
      dry_run: { type: 'boolean', description: 'If true, only list what would be done without making changes (default: false)' },
    },
  },
  async (args, _ctx) => {
    const dryRun = (args as any).dry_run === true;
    const { runFsClean } = await import('./commands/fs.js');
    if (dryRun) {
      const { runFsTrash } = await import('./commands/fs.js');
      const output = runFsTrash();
      return { content: [{ type: 'text', text: `[DRY RUN] No files were changed.\n\n${truncateText(output)}` }] };
    }
    const output = await runFsClean();
    return { content: [{ type: 'text', text: truncateText(output) }] };
  }
);

register(
  'loom_ping',
  'Quick health ping to verify LOOM MCP connectivity and project status.',
  { type: 'object', properties: {} },
  async () => {
    const root = resolveProjectRoot();
    const config = getConfig(root);
    return {
      content: [{
        type: 'text',
        text: `pong | root: ${root} | initialized: ${config ? 'yes' : 'no'} | version: ${config?.version || 'n/a'} | tools: ${getVisibleTools().length}`,
      }],
    };
  }
);

// ===== Dynamic capability filter =====
export function getVisibleTools(): ToolDef[] {
  const root = resolveProjectRoot();
  const initialized = !!getConfig(root);
  if (initialized) return listTools();
  // If not initialized, expose safe read-only / setup tools plus init
  return listTools().filter((t) =>
    ['loom_status', 'loom_read_prompt', 'loom_doctor', 'loom_init'].includes(t.name)
  );
}
