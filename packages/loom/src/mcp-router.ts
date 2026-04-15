import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  truncateText,
  sanitizeId,
  sanitizeString,
  sanitizeStringArray,
  sanitizeInteger,
  mcpError,
  captureStdout,
  captureStdoutAsync,
} from './mcp-utils.js';
import { withCache, withLock } from './mcp-cache.js';
import { getConfig } from './core/store.js';
import { markArtifactDirty } from './core/dirty-tracker.js';

export interface ToolResult {
  content: { type: 'text'; text: string }[];
  isError?: boolean;
}

export interface ToolContext {
  requestId?: string | number;
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
  return tool.handler(args, ctx || {});
}

// ===== Tool definitions =====

register(
  'loom_status',
  'Get the current slot-based LOOM context including active task, working set, decisions, and risks. Also updates cache/active-prompt.txt.',
  { type: 'object', properties: {} },
  async () => {
    return withCache(`loom_status:${process.cwd()}`, 5000, async () => {
      const { runStatus } = await import('./commands/status.js');
      await captureStdoutAsync(() => runStatus());
      const promptPath = path.join(process.cwd(), '.loom', 'cache', 'active-prompt.txt');
      const text = fs.existsSync(promptPath) ? fs.readFileSync(promptPath, 'utf-8') : '(empty context)';
      return { content: [{ type: 'text', text: truncateText(text) }] };
    });
  }
);

register(
  'loom_read_prompt',
  'Read the pre-rendered active prompt from cache without shell overhead.',
  { type: 'object', properties: {} },
  async () => {
    return withCache(`loom_read_prompt:${process.cwd()}`, 5000, async () => {
      const promptPath = path.join(process.cwd(), '.loom', 'cache', 'active-prompt.txt');
      if (!fs.existsSync(promptPath)) {
        return { content: [{ type: 'text', text: 'LOOM not initialized or active-prompt.txt missing.' }] };
      }
      const text = fs.readFileSync(promptPath, 'utf-8');
      return { content: [{ type: 'text', text: truncateText(text) }] };
    });
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
    const output = captureStdout(() => runExpand([id, level]));
    return { content: [{ type: 'text', text: truncateText(output || `Entry ${id} not found.`) }] };
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
    const output = captureStdout(() => runExplain([id]));
    return { content: [{ type: 'text', text: truncateText(output || `Entry ${id} not found.`) }] };
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
    const output = captureStdout(() => runWhy([id]));
    return { content: [{ type: 'text', text: truncateText(output || `Entry ${id} not found.`) }] };
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
    if (filterType) {
      const events = readWalEvents(process.cwd(), 50, filterType);
      const lines = events.map(
        (ev) =>
          `[${ev.t}] ${ev.type}: ${JSON.stringify(
            Object.fromEntries(Object.entries(ev).filter(([k]) => k !== 't' && k !== 'type'))
          )}`
      );
      return { content: [{ type: 'text', text: truncateText(lines.join('\n') || 'No matching events.') }] };
    }
    return { content: [{ type: 'text', text: truncateText(summarizeSession(process.cwd(), hoursBack)) }] };
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
    const output = await captureStdoutAsync(() => runTask(['set', id]));
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
  async (args) => {
    const title = sanitizeString((args as any).title, 256);
    if (!title) return mcpError('Invalid or missing "title" parameter.');
    const { runTask } = await import('./commands/task.js');
    const output = await captureStdoutAsync(() => runTask(['create', title]));
    return { content: [{ type: 'text', text: truncateText(output) }] };
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
    const id = `decision-${idBase}-${Date.now().toString(36)}`;
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
    saveEntry(entry);
    updateUserProfileFromDecision(entry);
    markArtifactDirty(path.join('.loom', 'entries', 'decisions', `${id}.loom.yml`));
    await appendWalAsync({ type: 'decision_recorded', id, request_id: ctx.requestId });
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
    const dirs = Array.isArray(rawDirs)
      ? rawDirs
          .map((d: unknown) => String(d).trim())
          .filter((d: string) => d && !/[;&|`$(){}[\]\n\r]/.test(d))
      : ['src', 'tests'];
    const output = startWatchDaemon(dirs);
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
    const { getWatchStatus } = await import('./core/watch-daemon.js');
    const status = getWatchStatus();
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
    const results = runDoctor(process.cwd());
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
    return withLock(
      `loom_fs_scan:${process.cwd()}`,
      async () => {
        const rawDirs = (args as any).dirs;
        const dirs = Array.isArray(rawDirs)
          ? rawDirs
              .map((d: unknown) => String(d).trim())
              .filter((d: string) => d && !/[;&|`$(){}[\]\n\r]/.test(d))
          : ['src', 'tests'];
        const { runFsScan } = await import('./commands/fs.js');
        const output = await captureStdoutAsync(() => runFsScan(dirs));
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
    const output = captureStdout(() => runFsDeps([p]));
    return { content: [{ type: 'text', text: truncateText(output || `No deps info for ${p}.`) }] };
  }
);

register(
  'loom_fs_health',
  'Show file health report including stale, orphan, legacy, redundant, and missing files.',
  { type: 'object', properties: {} },
  async () => {
    const { runFsHealth } = await import('./commands/fs.js');
    const output = captureStdout(() => runFsHealth());
    return { content: [{ type: 'text', text: truncateText(output || 'No health data.') }] };
  }
);

register(
  'loom_fs_trash',
  'List trash candidates recommended for archive or deletion.',
  { type: 'object', properties: {} },
  async () => {
    const { runFsTrash } = await import('./commands/fs.js');
    const output = captureStdout(() => runFsTrash());
    return { content: [{ type: 'text', text: truncateText(output || 'No trash candidates.') }] };
  }
);

register(
  'loom_ping',
  'Quick health ping to verify LOOM MCP connectivity and project status.',
  { type: 'object', properties: {} },
  async () => {
    const config = getConfig(process.cwd());
    return {
      content: [{
        type: 'text',
        text: `pong | cwd: ${process.cwd()} | initialized: ${config ? 'yes' : 'no'} | version: ${config?.version || 'n/a'} | tools: ${getVisibleTools().length}`,
      }],
    };
  }
);

// ===== Dynamic capability filter =====
export function getVisibleTools(): ToolDef[] {
  const initialized = !!getConfig(process.cwd());
  if (initialized) return listTools();
  // If not initialized, only expose safe read-only / setup tools
  return listTools().filter((t) =>
    ['loom_status', 'loom_read_prompt', 'loom_doctor'].includes(t.name)
  );
}
