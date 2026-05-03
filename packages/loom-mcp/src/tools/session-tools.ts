/**
 * Session Lifecycle & Passive Extraction MCP Tools
 *
 * Layer 1: loom_extract — sends text to cloud for LLM extraction
 * Layer 2: loom_session_start / loom_session_end — lifecycle hooks
 * Layer 3: loom_cloud_delete — privacy control
 */
import type { ToolResult, ExtractedMemory } from '@spongeacer/loom-core';
import {
  buildSlotPrompt,
  appendWalAsync,
  getDecaySummary,
  loadCloudConfig,
  CloudApiClient,
  saveExtractedMemories,
} from '@spongeacer/loom-core';
import { getStore } from '../store.js';
import { ok, err } from './common.js';

/** Try cloud extraction first, fall back to returning a prompt for the agent. */
async function extractViaCloud(
  conversationText: string
): Promise<{ usedCloud: boolean; result: string }> {
  const config = loadCloudConfig();
  if (!config?.token || !config.baseUrl) {
    return { usedCloud: false, result: '' };
  }

  try {
    const client = new CloudApiClient({ baseUrl: config.baseUrl, timeoutMs: 30000 });
    const res = await client.extract(config.token, conversationText);
    if (res.ok && res.memories && res.memories.length > 0) {
      return { usedCloud: true, result: JSON.stringify(res.memories) };
    }
    if (res.ok) {
      return { usedCloud: true, result: '[]' };
    }
    // Cloud returned error — fall back
    return { usedCloud: false, result: '' };
  } catch {
    return { usedCloud: false, result: '' };
  }
}

export const sessionTools = [
  {
    name: 'loom_session_start',
    description: 'Start a LOOM session. Call this at the beginning of every conversation to load project context, check the active task, and restore continuity from previous sessions.',
    inputSchema: { type: 'object', properties: {} },
    handler: async (): Promise<ToolResult> => {
      const store = getStore();
      if (!store.isInitialized()) return err('LOOM not initialized. Run: loom init "Project Name"');

      const prompt = buildSlotPrompt(store);
      store.writeActivePrompt(prompt);

      await appendWalAsync({ type: 'session_start' });

      const entries = store.listEntries();
      const summary = getDecaySummary(entries);
      let healthNote = '';
      if (summary.archival > 0) {
        healthNote = `\n\n[LOOM] ${summary.archival} entries are stale and eligible for archival. Run loom_prune to clean up.`;
      }

      return ok(prompt + healthNote);
    },
  },
  {
    name: 'loom_session_end',
    description: 'End a LOOM session with automatic memory extraction. Pass a summary of the conversation — the cloud LLM will extract decisions, rules, and notable facts, then save them locally. This is the primary way to persist knowledge without manual recording.',
    inputSchema: {
      type: 'object',
      properties: {
        conversation_text: {
          type: 'string',
          description: 'Conversation text or summary to extract memories from. Max 8000 chars.',
        },
        extract: {
          type: 'boolean',
          description: 'Whether to extract memories. Default: true.',
        },
      },
    },
    handler: async (args: Record<string, unknown>): Promise<ToolResult> => {
      const store = getStore();
      if (!store.isInitialized()) return err('LOOM not initialized');

      const extract = args.extract !== false;
      const conversationText = String(args.conversation_text || '');

      const lines: string[] = ['Session ended.'];

      if (extract && conversationText.length > 50) {
        // Try cloud extraction first
        const { usedCloud, result } = await extractViaCloud(conversationText);

        if (usedCloud) {
          const memories: ExtractedMemory[] = JSON.parse(result);
          if (memories.length > 0) {
            const saved = saveExtractedMemories(store, memories, 0.5);
            lines.push(`Extracted ${saved.length} memories via cloud:`);
            for (const id of saved) lines.push(`  ${id}`);
            await appendWalAsync({ type: 'memories_extracted', count: saved.length, ids: saved });
          } else {
            lines.push('No notable memories to extract from this session.');
          }
        } else {
          // No cloud configured — return extraction prompt for agent to process
          lines.push('');
          lines.push('[LOOM] Cloud not configured. To enable automatic extraction, run: loom cloud register <url>');
          lines.push('Alternatively, manually record decisions with loom_record_decision.');
        }
      }

      await appendWalAsync({ type: 'session_end' });
      return ok(lines.join('\n'));
    },
  },
  {
    name: 'loom_extract',
    description: 'Extract memories from conversation text via the cloud LLM. Sends text to the LOOM cloud server, which uses an LLM to identify decisions, rules, and notable facts. Requires cloud connection. Returns extracted memories as structured JSON.',
    inputSchema: {
      type: 'object',
      properties: {
        conversation_text: {
          type: 'string',
          description: 'Conversation text to analyze. Max 8000 chars.',
        },
      },
      required: ['conversation_text'],
    },
    handler: async (args: Record<string, unknown>): Promise<ToolResult> => {
      const conversationText = String(args.conversation_text || '');
      if (conversationText.length < 50) return ok('[]');

      const { usedCloud, result } = await extractViaCloud(conversationText);
      if (!usedCloud) {
        return err('Cloud not configured. Run: loom cloud register <url>');
      }
      return ok(result);
    },
  },
  {
    name: 'loom_extract_save',
    description: 'Save extracted memories to LOOM. Call this after receiving extraction results from loom_extract. Pass the JSON array of extracted items.',
    inputSchema: {
      type: 'object',
      properties: {
        memories: {
          type: 'string',
          description: 'JSON array of extracted memories.',
        },
        min_confidence: {
          type: 'number',
          description: 'Minimum confidence threshold. Default: 0.5.',
        },
      },
      required: ['memories'],
    },
    handler: async (args: Record<string, unknown>): Promise<ToolResult> => {
      const store = getStore();
      if (!store.isInitialized()) return err('LOOM not initialized');

      const memoriesJson = String(args.memories || '[]');
      const minConfidence = typeof args.min_confidence === 'number' ? args.min_confidence : 0.5;

      let memories: ExtractedMemory[];
      try {
        memories = JSON.parse(memoriesJson);
        if (!Array.isArray(memories)) return err('Invalid memories format');
      } catch {
        return err('Invalid JSON');
      }

      const saved = saveExtractedMemories(store, memories, minConfidence);
      if (saved.length === 0) return ok('No memories met the confidence threshold.');

      await appendWalAsync({ type: 'memories_extracted', count: saved.length, ids: saved });
      return ok(`Saved ${saved.length} memories:\n${saved.join('\n')}`);
    },
  },
  {
    name: 'loom_cloud_delete',
    description: 'Delete data from the LOOM cloud. Use this for privacy control — delete specific entries, a whole project, or your entire account. Data is permanently removed from the cloud server.',
    inputSchema: {
      type: 'object',
      properties: {
        scope: {
          type: 'string',
          enum: ['entries', 'project', 'account'],
          description: 'What to delete: entries (specific), project (all in project), account (everything).',
        },
        project_id: {
          type: 'string',
          description: 'Project ID for entries/project scope.',
        },
        entry_ids: {
          type: 'array',
          items: { type: 'string' },
          description: 'Entry IDs to delete (for entries scope).',
        },
      },
      required: ['scope'],
    },
    handler: async (args: Record<string, unknown>): Promise<ToolResult> => {
      const config = loadCloudConfig();
      if (!config?.token || !config.baseUrl) {
        return err('Cloud not configured. Run: loom cloud register <url>');
      }

      const client = new CloudApiClient({ baseUrl: config.baseUrl });
      const scope = String(args.scope);

      if (scope === 'entries') {
        const entryIds = (args.entry_ids || []) as string[];
        if (entryIds.length === 0) return err('entry_ids required');
        const projectId = String(args.project_id || 'default');
        const res = await client.deleteEntries(config.token, projectId, entryIds);
        if (!res.ok) return err(res.error || 'Delete failed');
        return ok(`Deleted ${res.deleted} entries from cloud.`);
      }

      if (scope === 'project') {
        const projectId = String(args.project_id || 'default');
        const res = await client.deleteProject(config.token, projectId);
        if (!res.ok) return err(res.error || 'Delete failed');
        return ok(`Deleted ${res.deleted} entries from project ${projectId}.`);
      }

      if (scope === 'account') {
        const res = await client.deleteAccount(config.token);
        if (!res.ok) return err(res.error || 'Delete failed');
        return ok('Account and all data deleted from cloud.');
      }

      return err(`Unknown scope: ${scope}`);
    },
  },
];
