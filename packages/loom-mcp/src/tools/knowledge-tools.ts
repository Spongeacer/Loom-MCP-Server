import type { ToolResult } from '@spongeacer/loom-core';
import { createDecisionEntry, createMemoryEntry, createRuleEntry, createBinding, appendWalAsync } from '@spongeacer/loom-core';
import { getStore } from '../store.js';
import { ok, err } from './common.js';

export const knowledgeTools = [
  {
    name: 'loom_decision_record',
    description: 'Record an architectural or design decision. Use this whenever a choice is made that future sessions should remember — framework selection, data format, API design, auth strategy, deployment approach, etc. Do not wait for user confirmation; record immediately while the reasoning is fresh. The decision will be linked to the active task if one exists.',
    inputSchema: {
      type: 'object',
      properties: {
        question: { type: 'string', description: 'The decision question (e.g. "Which router framework to use?")' },
        chosen: { type: 'string', description: 'The chosen option (e.g. "Hono")' },
        rationale: { type: 'string', description: 'Why this option was chosen' },
        impact_scope: { type: 'array', items: { type: 'string' }, description: 'Files, modules, or areas affected by this decision' },
      },
      required: ['question', 'chosen', 'rationale'],
    },
    handler: async (args: Record<string, unknown>): Promise<ToolResult> => {
      const store = getStore();
      if (!store.isInitialized()) return err('LOOM not initialized');

      const question = String(args.question).trim();
      const chosen = String(args.chosen).trim();
      const rationale = String(args.rationale).trim();
      const impactScope = Array.isArray(args.impact_scope)
        ? args.impact_scope.filter((s): s is string => typeof s === 'string')
        : [];

      if (!question || !chosen || !rationale) {
        return err('question, chosen, and rationale are required');
      }

      const entry = createDecisionEntry(question, chosen, rationale, impactScope);
      store.saveEntry(entry);

      // Auto-link to active task
      const ws = store.getWorkingSet();
      if (ws.active_task) {
        store.saveBinding(createBinding(entry.id, ws.active_task, 'realized_in', 1.0));
      }

      await appendWalAsync({ type: 'decision_recorded', id: entry.id });
      return ok(`Recorded decision: ${entry.id}\n${question} → ${chosen}`);
    },
  },
  {
    name: 'loom_memory_add',
    description: 'Add a memory or preference about the user or project. Use this whenever you learn something about the user\'s style, preferences, work habits, or project context — even if it seems minor. Examples: "user prefers concise docs", "project uses pnpm workspaces", "user likes functions under 30 lines", "avoid nested ternaries". Record immediately; small preferences compound into accurate context over time.',
    inputSchema: {
      type: 'object',
      properties: {
        content: { type: 'string', description: 'The memory content (e.g. "User prefers TypeScript over JavaScript")' },
        tags: { type: 'array', items: { type: 'string' }, description: 'Optional tags for categorization (e.g. ["coding-style", "tech-preference"])' },
        namespace: { type: 'string', enum: ['project', 'user'], description: 'project = specific to this project; user = applies across all projects' },
      },
      required: ['content'],
    },
    handler: async (args: Record<string, unknown>): Promise<ToolResult> => {
      const store = getStore();
      if (!store.isInitialized()) return err('LOOM not initialized');

      const content = String(args.content).trim();
      const tags = Array.isArray(args.tags)
        ? args.tags.filter((s): s is string => typeof s === 'string')
        : [];
      const namespace = String(args.namespace || 'project') as 'project' | 'user';

      if (!content) return err('content is required');

      const entry = createMemoryEntry(content, tags, namespace);
      store.saveEntry(entry);

      // Auto-link to active task if project-scoped
      if (namespace === 'project') {
        const ws = store.getWorkingSet();
        if (ws.active_task) {
          store.saveBinding(createBinding(entry.id, ws.active_task, 'impacts', 0.8));
        }
      }

      await appendWalAsync({ type: 'memory_added', id: entry.id });
      return ok(`Added memory: ${entry.id}\n${content}`);
    },
  },
  {
    name: 'loom_rule_create',
    description: 'Create a project rule or convention. Use this whenever a coding standard, naming convention, or project policy is established — even if it starts as a temporary agreement. Examples: "all API routes use kebab-case", "max function length 50 lines", "prefer early returns over nested ifs". Rules appear in the governance slot and constrain all future code generation.',
    inputSchema: {
      type: 'object',
      properties: {
        scope: { type: 'string', description: 'Scope of the rule (e.g. "api-routes", "naming", "testing", "docs")' },
        rule: { type: 'string', description: 'The rule text (e.g. "Use kebab-case for all API route paths")' },
        rationale: { type: 'string', description: 'Why this rule exists' },
      },
      required: ['scope', 'rule'],
    },
    handler: async (args: Record<string, unknown>): Promise<ToolResult> => {
      const store = getStore();
      if (!store.isInitialized()) return err('LOOM not initialized');

      const scope = String(args.scope).trim();
      const rule = String(args.rule).trim();
      const rationale = String(args.rationale || '').trim();

      if (!scope || !rule) return err('scope and rule are required');

      const entry = createRuleEntry(scope, rule, rationale);
      store.saveEntry(entry);

      await appendWalAsync({ type: 'rule_created', id: entry.id });
      return ok(`Created rule: ${entry.id}\n[${scope}] ${rule}`);
    },
  },
];
