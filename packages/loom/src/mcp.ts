#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { execSync } from 'node:child_process';
import * as path from 'node:path';
import * as fs from 'node:fs';

const cliPath = path.resolve(__dirname, '../dist/cli.js');

function runCli(args: string[]): string {
  try {
    return execSync(`node "${cliPath}" ${args.map((a) => `"${a}"`).join(' ')}`, {
      encoding: 'utf-8',
      cwd: process.cwd(),
    });
  } catch (e: any) {
    return e.stdout || e.stderr || `Error: ${e.message}`;
  }
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
      return { content: [{ type: 'text', text: output || '(empty context)' }] };
    }

    case 'loom_read_prompt': {
      const promptPath = path.join(process.cwd(), '.loom', 'cache', 'active-prompt.txt');
      if (!fs.existsSync(promptPath)) {
        return { content: [{ type: 'text', text: 'LOOM not initialized or active-prompt.txt missing.' }] };
      }
      const text = fs.readFileSync(promptPath, 'utf-8');
      return { content: [{ type: 'text', text }] };
    }

    case 'loom_expand': {
      const id = (args as any).id as string;
      const level = ((args as any).level as string) || 'l3';
      const output = runCli(['expand', id, level]);
      return { content: [{ type: 'text', text: output || `Entry ${id} not found.` }] };
    }

    case 'loom_task_set': {
      const id = (args as any).id as string;
      const output = runCli(['task', 'set', id]);
      return { content: [{ type: 'text', text: output }] };
    }

    case 'loom_task_create': {
      const title = (args as any).title as string;
      const output = runCli(['task', 'create', title]);
      return { content: [{ type: 'text', text: output }] };
    }

    case 'loom_record_decision': {
      const { question, chosen, rationale, impact_scope = [] } = args as any;
      const { saveEntry, appendWal } = await import('./core/store.js');
      const id = `decision-${chosen.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
      const now = new Date().toISOString();
      const entry = {
        id,
        type: 'Decision' as const,
        version: 1,
        namespace: 'project' as const,
        content: {
          l1_5: chosen.slice(0, 30),
          l2: `${question} -> ${chosen}`,
          l3: `Question: ${question}\nChosen: ${chosen}\nRationale: ${rationale}\nImpact: ${impact_scope.join(' / ')}`,
        },
        lifecycle: {
          state: 'active' as const,
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
          level: 'verified' as const,
          source: 'model' as const,
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
          resolution_policy: 'newest_wins' as const,
        },
        bindings_out: [],
        bindings_in: [],
        decision: {
          question,
          chosen,
          rationale,
          rejected: [] as { option: string; reason: string }[],
          assumptions: [] as string[],
          impact_scope: impact_scope as string[],
          supersedes: null,
          made_in: now,
        },
      };
      saveEntry(entry);
      appendWal({ type: 'decision_recorded', id });
      return { content: [{ type: 'text', text: `Decision recorded: ${id}` }] };
    }

    case 'loom_explain': {
      const id = (args as any).id as string;
      const output = runCli(['explain', id]);
      return { content: [{ type: 'text', text: output || `Entry ${id} not found.` }] };
    }

    case 'loom_why': {
      const id = (args as any).id as string;
      const output = runCli(['why', id]);
      return { content: [{ type: 'text', text: output || `Entry ${id} not found.` }] };
    }

    case 'loom_watch_start': {
      const { startWatchDaemon } = await import('./core/watch-daemon.js');
      const dirs = ((args as any).dirs as string[]) || ['src', 'tests'];
      const output = startWatchDaemon(dirs);
      return { content: [{ type: 'text', text: output }] };
    }

    case 'loom_watch_stop': {
      const { stopWatchDaemon } = await import('./core/watch-daemon.js');
      const output = stopWatchDaemon();
      return { content: [{ type: 'text', text: output }] };
    }

    case 'loom_watch_status': {
      const { getWatchStatus } = await import('./core/watch-daemon.js');
      const status = getWatchStatus();
      if (status.running) {
        return { content: [{ type: 'text', text: `Watch daemon running (pid: ${status.pid}). Dirs: ${status.dirs?.join(', ')}` }] };
      }
      return { content: [{ type: 'text', text: 'Watch daemon is not running.' }] };
    }

    case 'loom_fs_scan': {
      const dirs = ((args as any).dirs as string[]) || ['src', 'tests'];
      const output = runCli(['fs', 'scan', ...dirs]);
      return { content: [{ type: 'text', text: output || 'FS scan completed.' }] };
    }

    case 'loom_fs_deps': {
      const p = (args as any).path as string;
      const output = runCli(['fs', 'deps', p]);
      return { content: [{ type: 'text', text: output || `No deps info for ${p}.` }] };
    }

    case 'loom_fs_health': {
      const output = runCli(['fs', 'health']);
      return { content: [{ type: 'text', text: output || 'No health data.' }] };
    }

    case 'loom_fs_trash': {
      const output = runCli(['fs', 'trash']);
      return { content: [{ type: 'text', text: output || 'No trash candidates.' }] };
    }

    default:
      throw new Error(`Unknown tool: ${name}`);
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
