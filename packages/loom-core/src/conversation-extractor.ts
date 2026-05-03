/**
 * Conversation Memory Extractor
 *
 * Extracts decisions, preferences, rules, and notable facts from conversation text.
 * Works by returning a structured extraction prompt that the calling agent (LLM) processes.
 *
 * This is the "passive extraction" layer — the agent doesn't need to consciously decide
 * what to remember. It just passes conversation text, and the extractor identifies memories.
 */
import type { Entry, ExtractedMemory } from './types/index.js';
import type { StoreAdapter } from './store/adapter.js';
import { createDecisionEntry } from './commands/decision.js';
import { createMemoryEntry } from './commands/memory.js';
import { createRuleEntry } from './commands/rule.js';

export type { ExtractedMemory };

/**
 * Build a prompt that instructs an LLM to extract memories from conversation text.
 * The calling agent processes this prompt and returns structured JSON.
 */
export function buildExtractionPrompt(conversationText: string): string {
  return `You are a memory extraction engine. Analyze the following conversation and extract items worth persisting for future sessions.

Extract ONLY items that meet these criteria:
- **Decisions**: Architectural choices, technology selections, design patterns that were discussed and decided. NOT every opinion — only things that affect future work.
- **Rules**: Conventions, naming patterns, policies that were established or followed. NOT obvious best practices — only project-specific rules.
- **Memories**: Notable facts, preferences, gotchas, debugging insights that would be valuable in a future session. NOT routine conversation.

For each extracted item, provide:
- type: "Decision" | "Memory" | "Rule"
- l1_5: One-line summary (max 100 chars)
- l2: 2-3 sentence explanation with context
- confidence: 0.0-1.0 (how confident you are this is worth recording)

Rules:
- Extract 0-5 items. Quality over quantity. If nothing is noteworthy, return an empty array.
- Do NOT extract: greetings, status updates, routine code changes, things that are obvious from reading the code.
- Do NOT duplicate existing knowledge. Only extract NEW information.
- Focus on the "why" not just the "what".

Return a JSON array. Example:
[
  {"type": "Decision", "l1_5": "Chose PostgreSQL over MongoDB for billing", "l2": "The billing model has relational structure with complex joins. MongoDB would have pushed join complexity into application code.", "confidence": 0.9}
]

If nothing is worth extracting, return: []

Conversation:
${conversationText.slice(0, 8000)}`;
}

/**
 * Parse the LLM's extraction response into structured memories.
 * Handles common response formats (raw JSON, markdown-fenced JSON, etc.).
 */
export function parseExtractionResponse(response: string): ExtractedMemory[] {
  let cleaned = response.trim();
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```(?:json)?\s*\n?/m, '').replace(/\n?```\s*$/m, '').trim();
  }

  try {
    const parsed = JSON.parse(cleaned);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item: any) =>
      item &&
      typeof item.l1_5 === 'string' &&
      typeof item.l2 === 'string' &&
      ['Decision', 'Memory', 'Rule'].includes(item.type) &&
      typeof item.confidence === 'number' &&
      item.confidence >= 0.3
    ) as ExtractedMemory[];
  } catch {
    return [];
  }
}

/**
 * Convert extracted memories into LOOM entries and save them.
 * Returns the IDs of created entries.
 */
export function saveExtractedMemories(
  store: StoreAdapter,
  memories: ExtractedMemory[],
  minConfidence = 0.5
): string[] {
  const saved: string[] = [];

  for (const mem of memories) {
    if (mem.confidence < minConfidence) continue;

    let entry: Entry | null = null;

    if (mem.type === 'Decision') {
      entry = createDecisionEntry(
        mem.l1_5,
        mem.l2,
        `Auto-extracted (confidence=${mem.confidence.toFixed(2)})`
      );
    } else if (mem.type === 'Rule') {
      entry = createRuleEntry('project', mem.l1_5, mem.l2);
    } else if (mem.type === 'Memory') {
      entry = createMemoryEntry(`${mem.l1_5}\n${mem.l2}`, [], 'auto');
    }

    if (entry) {
      store.saveEntry(entry);
      saved.push(entry.id);
    }
  }

  return saved;
}
