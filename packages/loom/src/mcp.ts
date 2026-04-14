#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { spawnSync } from 'node:child_process';
import * as path from 'node:path';
import * as fs from 'node:fs';

const cliPath = path.resolve(__dirname, '../dist/cli.js');
const MAX_OUTPUT_BYTES = 200_000; // ~200KB truncation limit

function truncateText(text: string): string {
  const bytes = Buffer.byteLength(text, 'utf-8');
  if (bytes <= MAX_OUTPUT_BYTES) return text;
  // Cut at character boundary near limit
  let cutoff = MAX_OUTPUT_BYTES;
  while (cutoff > 0 && (text.charCodeAt(cutoff) & 0xc0) === 0x80) cutoff--;
  return text.slice(0, cutoff) + '\n\n[Output truncated: exceeded 200KB limit]';
}

function runCli(args: string[]): string {
  try {
    const result = spawnSync(process.execPath, [cliPath, ...args], {
      encoding: 'utf-8',
      cwd: process.cwd(),
      shell: false,
      timeout: 15_000,
      maxBuffer: 2 * 1024 * 1024,
    });
    const stdout = result.stdout || '';
    const stderr = result.stderr || '';
    if (result.error) {
      return `Error: ${result.error.message}`;
    }
    if (result.status !== 0) {
      return stderr || stdout || `Error: exited with code ${result.status}`;
    }
    return stdout;
  } catch (e: any) {
    return `Error: ${e.message}`;
  }
}

function sanitizeId(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 256) return null;
  // Disallow shell-special chars
  if (/[;&|`$(){}[\]\n\r]/.test(trimmed)) return null;
  return trimmed;
}

function sanitizeString(value: unknown, maxLen = 1024): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > maxLen) return null;
  return trimmed;
}

function sanitizeStringArray(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null;
  const out: string[] = [];
  for (const v of value) {
    const s = sanitizeString(v, 512);
    if (s) out.push(s);
  }
  return out;
}

function sanitizeInteger(value: unknown, min = 1, max = 9999): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  const int = Math.floor(value);
  if (int < min || int > max) return null;
  return int;
}

function mcpError(message: string) {
  return {
    content: [{ type: 'text' as const, text: message }],
    isError: true,
  };
}

const server = new Server(
  {
    name: 'loom-mcp',
    version: '0.1.0',
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: 'loom_status',
        description: 'Get the current slot-based LOOM context including active task, working set, decisions, and risks. Also updates cache/active-prompt.txt.',
        inputSchema: { type: 'object', properties: {} },
      },
      {
        name: 'loom_expand',
        description: 'Expand a LOOM entry to see its full details (L3).',
        inputSchema: {
          type: 'object',
          properties: {
            id: { type: 'string', description: 'Entry ID' },
            level: { type: 'string', enum: ['l2', 'l3'], description: 'Detail level (default: l3)' },
          },
          required: ['id'],
        },
      },
      {
        name: 'loom_task_set',
        description: 'Set the active task by ID.',
        inputSchema: {
          type: 'object',
          properties: { id: { type: 'string', description: 'Task entry ID' } },
          required: ['id'],
        },
      },
      {
        name: 'loom_task_create',
        description: 'Create a new task and set it as active.',
        inputSchema: {
          type: 'object',
          properties: {
            title: { type: 'string', description: 'Task title' },
            intent: { type: 'string', enum: ['bugfix', 'feature', 'refactor', 'analysis', 'docs', 'ops'], description: 'Task intent' },
            priority: { type: 'string', enum: ['low', 'medium', 'high', 'critical'], description: 'Task priority' },
          },
          required: ['title'],
        },
      },
      {
        name: 'loom_record_decision',
        description: 'Record a new decision entry.',
        inputSchema: {
          type: 'object',
          properties: {
            question: { type: 'string' },
            chosen: { type: 'string' },
            rationale: { type: 'string' },
            impact_scope: { type: 'array', items: { type: 'string' } },
          },
          required: ['question', 'chosen', 'rationale'],
        },
      },
      {
        name: 'loom_skill_extract',
        description: 'Extract a reusable Skill entry from a completed Task.',
        inputSchema: {
          type: 'object',
          properties: {
            task_id: { type: 'string', description: 'Task entry ID to extract skill from' },
          },
          required: ['task_id'],
        },
      },
      {
        name: 'loom_session_recall',
        description: 'Recall recent session activity from the WAL event log.',
        inputSchema: {
          type: 'object',
          properties: {
            hours_back: { type: 'integer', description: 'Hours of history to summarize (default: 24)' },
            filter_type: { type: 'string', description: 'Optional WAL event type filter (e.g., task_set, fs_scan)' },
          },
        },
      },
      {
        name: 'loom_explain',
        description: 'Explain an entry metadata, lifecycle, and bindings.',
        inputSchema: {
          type: 'object',
          properties: { id: { type: 'string' } },
          required: ['id'],
        },
      },
      {
        name: 'loom_why',
        description: 'Explain why an entry is relevant to the current context.',
        inputSchema: {
          type: 'object',
          properties: { id: { type: 'string' } },
          required: ['id'],
        },
      },
      {
        name: 'loom_read_prompt',
        description: 'Read the pre-rendered active prompt from cache without shell overhead.',
        inputSchema: { type: 'object', properties: {} },
      },
      {
        name: 'loom_watch_start',
        description: 'Start the background file watcher daemon. It auto-registers artifacts and creates Level 0 bindings on file changes.',
        inputSchema: {
          type: 'object',
          properties: {
            dirs: { type: 'array', items: { type: 'string' }, description: 'Directories to watch (default: src, tests)' },
          },
        },
      },
      {
        name: 'loom_watch_stop',
        description: 'Stop the background file watcher daemon.',
        inputSchema: { type: 'object', properties: {} },
      },
      {
        name: 'loom_watch_status',
        description: 'Check whether the background file watcher is running.',
        inputSchema: { type: 'object', properties: {} },
      },
      {
        name: 'loom_doctor',
        description: 'Run LOOM self-diagnostic checks: MCP config drift, stale hardcoded paths, build freshness, watch daemon health, and legacy naming.',
        inputSchema: { type: 'object', properties: {} },
      },
      {
        name: 'loom_fs_scan',
        description: 'Scan project files, update filesystem metadata, rebuild dependency graph, and run health analysis.',
        inputSchema: {
          type: 'object',
          properties: {
            dirs: { type: 'array', items: { type: 'string' }, description: 'Directories to scan (default: src, tests)' },
          },
        },
      },
      {
        name: 'loom_fs_deps',
        description: 'Show imports and imported-by for a given file path or artifact id.',
        inputSchema: {
          type: 'object',
          properties: { path: { type: 'string', description: 'File path or artifact id' } },
          required: ['path'],
        },
      },
      {
        name: 'loom_fs_health',
        description: 'Show file health report including stale, orphan, legacy, redundant, and missing files.',
        inputSchema: { type: 'object', properties: {} },
      },
      {
        name: 'loom_fs_trash',
        description: 'List trash candidates recommended for archive or deletion.',
        inputSchema: { type: 'object', properties: {} },
      },
    ],
  };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  switch (name) {
    case 'loom_status': {
      const output = runCli(['status']);
      return { content: [{ type: 'text', text: truncateText(output || '(empty context)') }] };
    }

    case 'loom_read_prompt': {
      const promptPath = path.join(process.cwd(), '.loom', 'cache', 'active-prompt.txt');
      if (!fs.existsSync(promptPath)) {
        return { content: [{ type: 'text', text: 'LOOM not initialized or active-prompt.txt missing.' }] };
      }
      const text = fs.readFileSync(promptPath, 'utf-8');
      return { content: [{ type: 'text', text: truncateText(text) }] };
    }

    case 'loom_expand': {
      const id = sanitizeId((args as any).id);
      if (!id) return mcpError('Invalid or missing "id" parameter.');
      const level = sanitizeString((args as any).level) || 'l3';
      if (level !== 'l2' && level !== 'l3') return mcpError('Invalid "level" parameter.');
      const output = runCli(['expand', id, level]);
      return { content: [{ type: 'text', text: truncateText(output || `Entry ${id} not found.`) }] };
    }

    case 'loom_task_set': {
      const id = sanitizeId((args as any).id);
      if (!id) return mcpError('Invalid or missing "id" parameter.');
      const output = runCli(['task', 'set', id]);
      return { content: [{ type: 'text', text: truncateText(output) }] };
    }

    case 'loom_task_create': {
      const title = sanitizeString((args as any).title, 256);
      if (!title) return mcpError('Invalid or missing "title" parameter.');
      const intent = sanitizeString((args as any).intent) || 'feature';
      const priority = sanitizeString((args as any).priority) || 'medium';
      const output = runCli(['task', 'create', title]);
      return { content: [{ type: 'text', text: truncateText(output) }] };
    }

    case 'loom_record_decision': {
      const a = args as Record<string, unknown>;
      const question = sanitizeString(a.question, 2048);
      const chosen = sanitizeString(a.chosen, 256);
      const rationale = sanitizeString(a.rationale, 4096);
      const impactScope = sanitizeStringArray(a.impact_scope) || [];
      if (!question || !chosen || !rationale) {
        return mcpError('Missing or invalid required fields: question, chosen, rationale.');
      }
      const { saveEntry, appendWal } = await import('./core/store.js');
      const { updateUserProfileFromDecision } = await import('./core/user-profile.js');
      const id = `decision-${chosen.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
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
      appendWal({ type: 'decision_recorded', id });
      return { content: [{ type: 'text', text: `Decision recorded: ${id}` }] };
    }

    case 'loom_skill_extract': {
      const taskId = sanitizeId((args as any).task_id);
      if (!taskId) return mcpError('Invalid or missing "task_id" parameter.');
      const { saveExtractedSkill } = await import('./core/skill-extraction.js');
      const skillId = saveExtractedSkill(taskId);
      if (skillId) {
        return { content: [{ type: 'text', text: `Skill extracted: ${skillId} from ${taskId}` }] };
      }
      return { content: [{ type: 'text', text: `Failed to extract skill from ${taskId}. Ensure it is a valid Task entry.` }] };
    }

    case 'loom_session_recall': {
      const { readWalEvents, summarizeSession } = await import('./core/session-recall.js');
      const hoursBack = sanitizeInteger((args as any).hours_back, 1, 720) || 24;
      const filterType = sanitizeString((args as any).filter_type, 64) || undefined;
      if (filterType) {
        const events = readWalEvents(process.cwd(), 50, filterType);
        const lines = events.map((ev) => `[${ev.t}] ${ev.type}: ${JSON.stringify(Object.fromEntries(Object.entries(ev).filter(([k]) => k !== 't' && k !== 'type')))}`);
        return { content: [{ type: 'text', text: truncateText(lines.join('\n') || 'No matching events.') }] };
      }
      return { content: [{ type: 'text', text: truncateText(summarizeSession(process.cwd(), hoursBack)) }] };
    }

    case 'loom_explain': {
      const id = sanitizeId((args as any).id);
      if (!id) return mcpError('Invalid or missing "id" parameter.');
      const output = runCli(['explain', id]);
      return { content: [{ type: 'text', text: truncateText(output || `Entry ${id} not found.`) }] };
    }

    case 'loom_why': {
      const id = sanitizeId((args as any).id);
      if (!id) return mcpError('Invalid or missing "id" parameter.');
      const output = runCli(['why', id]);
      return { content: [{ type: 'text', text: truncateText(output || `Entry ${id} not found.`) }] };
    }

    case 'loom_watch_start': {
      const { startWatchDaemon } = await import('./core/watch-daemon.js');
      const rawDirs = (args as any).dirs;
      const dirs = Array.isArray(rawDirs)
        ? rawDirs.map((d: unknown) => String(d).trim()).filter((d: string) => d && !/[;&|`$(){}[\]\n\r]/.test(d))
        : ['src', 'tests'];
      const output = startWatchDaemon(dirs);
      return { content: [{ type: 'text', text: truncateText(output) }] };
    }

    case 'loom_watch_stop': {
      const { stopWatchDaemon } = await import('./core/watch-daemon.js');
      const output = stopWatchDaemon();
      return { content: [{ type: 'text', text: truncateText(output) }] };
    }

    case 'loom_watch_status': {
      const { getWatchStatus } = await import('./core/watch-daemon.js');
      const status = getWatchStatus();
      if (status.running) {
        return { content: [{ type: 'text', text: `Watch daemon running (pid: ${status.pid}). Dirs: ${status.dirs?.join(', ')}` }] };
      }
      return { content: [{ type: 'text', text: 'Watch daemon is not running.' }] };
    }

    case 'loom_doctor': {
      const { runDoctor } = await import('./core/doctor.js');
      const results = runDoctor(process.cwd());
      const lines = results.map((r) => {
        const icon = r.level === 'ok' ? '✓' : r.level === 'warning' ? '⚠' : '✗';
        return `${icon} [${r.level.toUpperCase()}] ${r.message}`;
      });
      return { content: [{ type: 'text', text: truncateText(lines.join('\n')) }] };
    }

    case 'loom_fs_scan': {
      const rawDirs = (args as any).dirs;
      const dirs = Array.isArray(rawDirs)
        ? rawDirs.map((d: unknown) => String(d).trim()).filter((d: string) => d && !/[;&|`$(){}[\]\n\r]/.test(d))
        : ['src', 'tests'];
      const output = runCli(['fs', 'scan', ...dirs]);
      return { content: [{ type: 'text', text: truncateText(output || 'FS scan completed.') }] };
    }

    case 'loom_fs_deps': {
      const p = sanitizeString((args as any).path, 512);
      if (!p) return mcpError('Invalid or missing "path" parameter.');
      const output = runCli(['fs', 'deps', p]);
      return { content: [{ type: 'text', text: truncateText(output || `No deps info for ${p}.`) }] };
    }

    case 'loom_fs_health': {
      const output = runCli(['fs', 'health']);
      return { content: [{ type: 'text', text: truncateText(output || 'No health data.') }] };
    }

    case 'loom_fs_trash': {
      const output = runCli(['fs', 'trash']);
      return { content: [{ type: 'text', text: truncateText(output || 'No trash candidates.') }] };
    }

    default:
      return mcpError(`Unknown tool: ${name}`);
  }
});

async function main() {
  console.error('[LOOM MCP] Starting stdio transport...');
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('[LOOM MCP] Connected.');
}

main().catch((e) => {
  console.error('MCP Server error:', e);
  process.exit(1);
});
