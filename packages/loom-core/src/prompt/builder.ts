import type { StoreAdapter } from '../store/adapter.js';
import type { ArtifactEntry, Entry } from '../types/index.js';
import { LOOM_VERSION, PROMPT_MAX_HOT_ENTRIES, QUALITY_SCORE_RISK_THRESHOLD, DECAY_ARCHIVE_THRESHOLD } from '../constants.js';
import {
  PROMPT_MAX_DECISIONS,
  PROMPT_MAX_DICTIONARY,
  PROMPT_MAX_RISKS,
  PROMPT_MAX_FS_HEALTH,
  PROMPT_MAX_RECENT_FILES,
  PROMPT_MAX_CHARS,
  SESSION_DEFAULT_HOURS_BACK,
} from '../constants.js';
import { summarizeSession } from '../session-recall.js';

export interface BuildOptions {
  includeDevMode?: boolean;
}

/**
 * Collect entry IDs that are relevant to the current focus.
 * Uses 2-hop graph diffusion from active task + 1-hop from working set.
 * This is inspired by mem0's graph-based relevance scoring.
 */
function collectRelevantEntryIds(
  entries: Entry[],
  ws: ReturnType<StoreAdapter['getWorkingSet']>
): Set<string> {
  const relevant = new Set<string>();
  const entryMap = new Map(entries.map((e) => [e.id, e]));

  // Helper: add all directly connected neighbors
  function addNeighbors(id: string) {
    const e = entryMap.get(id);
    if (!e) return;
    for (const b of e.bindings_out) {
      if (b.target) relevant.add(b.target);
    }
    for (const b of e.bindings_in) {
      if (b.source) relevant.add(b.source);
    }
  }

  // 1. Working set (pinned + hot) — 1-hop diffusion
  for (const id of [...ws.pinned_entries, ...ws.hot_entries]) {
    relevant.add(id);
    addNeighbors(id);
  }

  // 2. Active task — 2-hop diffusion (task → related → related-of-related)
  if (ws.active_task) {
    relevant.add(ws.active_task);
    addNeighbors(ws.active_task); // 1-hop
    const firstHop = Array.from(relevant);
    for (const id of firstHop) {
      addNeighbors(id); // 2-hop
    }
  }

  return relevant;
}

/**
 * Knowledge-type entries that should appear in the dictionary.
 * Artifacts are excluded — they already appear in the <files> slot.
 */
const KNOWLEDGE_TYPES = new Set(['Memory', 'Decision', 'Task', 'Pattern', 'Rule', 'Skill']);

/**
 * Build dictionary from relevant knowledge entries only.
 * Falls back to most-recently-updated knowledge entries if nothing is in focus.
 * Artifacts are excluded to avoid bloating the prompt.
 */
function buildDictionary(entries: Entry[], relevantIds: Set<string>): string[] {
  const knowledgeEntries = entries.filter((e) => KNOWLEDGE_TYPES.has(e.type));

  let selected: Entry[];

  if (relevantIds.size > 0) {
    // Prioritize relevant knowledge entries, then fill with recent ones
    const relevant = knowledgeEntries.filter((e) => relevantIds.has(e.id));
    const remaining = knowledgeEntries
      .filter((e) => !relevantIds.has(e.id))
      .sort((a, b) => new Date(b.lifecycle.updated).getTime() - new Date(a.lifecycle.updated).getTime());
    selected = [...relevant, ...remaining];
  } else {
    // No focus — fall back to most recently updated knowledge entries
    selected = knowledgeEntries.sort(
      (a, b) => new Date(b.lifecycle.updated).getTime() - new Date(a.lifecycle.updated).getTime()
    );
  }

  return selected.slice(0, PROMPT_MAX_DICTIONARY).map((e) => `    ↣${e.id} (${e.type}): ${e.content.l1_5}`);
}

/**
 * Build the slot-based prompt with:
 * - Reduced slot count (10 → 8)
 * - On-demand dictionary injection
 * - Global character budget enforcement
 * - Importance-ordered slots (most critical first)
 */
export function buildSlotPrompt(adapter: StoreAdapter, _options?: BuildOptions): string {
  const ws = adapter.getWorkingSet();
  const allEntries = adapter.listEntries();
  // Filter out entries that are nearly dead — they should be archived, not in prompt
  const entries = allEntries.filter((e) => {
    if (!e.decay) return true; // backward compat: keep entries without decay
    if (e.decay.immune) return true;
    return e.decay.score >= DECAY_ARCHIVE_THRESHOLD * 0.5; // allow entries at half the archive threshold
  });
  const config = adapter.getConfig();

  const slots: Array<{ tag: string; lines: string[] }> = [];

  // 1. Protocol — collaboration rules for AI behavior (static, high-priority)
  slots.push({
    tag: 'protocol',
    lines: [
      '    You are collaborating with the LOOM persistent memory system. LOOM exists to prevent knowledge loss across sessions. Its value compounds when you consistently record what matters.',
      '',
      '    SESSION LIFECYCLE (MANDATORY):',
      '    • START: Call loom_session_start to load context. Do this before any other action.',
      '    • END: Call loom_session_end with a summary of what happened. This auto-extracts memories.',
      '    • During work: Call loom_extract with conversation text whenever a decision is made or a pattern emerges.',
      '',
      '    RECORDING RULES (ENFORCE):',
      '    1. When a decision is made → immediately call loom_record_decision. Do NOT wait until the end.',
      '    2. When a convention emerges → call loom_rule_create. Naming, structure, policies — capture them.',
      '    3. When you discover a gotcha or insight → call loom_memory_add. Future sessions need this.',
      '    4. When task status changes → call loom_task_update. Keep the active task accurate.',
      '    5. Before ending a session → call loom_session_end with conversation summary. This is not optional.',
      '',
      '    FAILURE TO RECORD = knowledge loss. The next session starts with amnesia. Your recordings are the only bridge.',
    ],
  });

  // 2. Meta — single line, replaces protocol + project
  const metaLines: string[] = [];
  if (config) {
    metaLines.push(`    ${config.project_name} (LOOM v${LOOM_VERSION})`);
  }
  if (metaLines.length > 0) {
    slots.push({ tag: 'meta', lines: metaLines });
  }

  // 2. Active task — highest priority
  if (ws.active_task) {
    const task = entries.find((e) => e.id === ws.active_task && e.type === 'Task');
    if (task) {
      slots.push({ tag: 'task', lines: [`    ↣${task.id}: ${task.content.l1_5}`] });
    }
  }

  // 3. Working set (pinned + hot, deduplicated)
  const hotIds = [...new Set([...ws.pinned_entries, ...ws.hot_entries])].slice(0, PROMPT_MAX_HOT_ENTRIES);
  if (hotIds.length > 0) {
    const lines: string[] = [];
    for (const id of hotIds) {
      const entry = entries.find((e) => e.id === id);
      if (entry) {
        lines.push(`    <entry id="${entry.id}" type="${entry.type}">${entry.content.l1_5}</entry>`);
      }
    }
    if (lines.length > 0) slots.push({ tag: 'working_set', lines });
  }

  // 4. User context (cloud-managed profile, structured text — not JSON)
  const userEntries = entries.filter((e) => e.namespace === 'user').sort((a, b) => a.id.localeCompare(b.id));
  for (const e of userEntries) {
    const lines: string[] = [];
    if (e.content.l1_5) {
      lines.push(`    ↣${e.id}: ${e.content.l1_5}`);
    }
    // Inject l3 (structured text sections) if available — more useful than l1_5 alone
    if (typeof e.content.l3 === 'string' && e.content.l3) {
      const l3Lines = e.content.l3.split('\n').filter((l) => l.trim());
      for (const l of l3Lines.slice(0, 15)) {
        lines.push(`      ${l.trim()}`);
      }
      if (l3Lines.length > 15) {
        lines.push(`      ... (${l3Lines.length - 15} more lines)`);
      }
    }
    if (lines.length > 0) {
      slots.push({ tag: 'user_context', lines });
    }
  }

  // 5. Governance (hard rules)
  const rules = entries.filter((e) => e.type === 'Rule').sort((a, b) => a.id.localeCompare(b.id));
  if (rules.length > 0) {
    slots.push({
      tag: 'governance',
      lines: rules.map((r) => `    ↣${r.id}: ${r.content.l1_5}`),
    });
  }

  // 6. Decisions (architecture choices, newest first)
  const decisions = entries
    .filter((e) => e.type === 'Decision')
    .sort((a, b) => new Date(b.lifecycle.updated).getTime() - new Date(a.lifecycle.updated).getTime());
  if (decisions.length > 0) {
    slots.push({
      tag: 'decisions',
      lines: decisions.slice(0, PROMPT_MAX_DECISIONS).map((d) => `    ↣${d.id}: ${d.content.l1_5}`),
    });
  }

  // 7. Risks (low quality, stale, conflicted)
  const risks = entries
    .filter((e) => {
      return (
        e.quality.composite_score < QUALITY_SCORE_RISK_THRESHOLD ||
        e.lifecycle.state === 'stale' ||
        e.conflicts.conflicts_with.length > 0
      );
    })
    .sort((a, b) => a.id.localeCompare(b.id));
  if (risks.length > 0) {
    const lines: string[] = [];
    for (const r of risks.slice(0, PROMPT_MAX_RISKS)) {
      const reasons: string[] = [];
      if (r.quality.composite_score < 0.5) reasons.push(`score=${r.quality.composite_score.toFixed(2)}`);
      if (r.lifecycle.state === 'stale') reasons.push('stale');
      if (r.conflicts.conflicts_with.length > 0) reasons.push(`conflicts=${r.conflicts.conflicts_with.join(',')}`);
      lines.push(`    ↣${r.id}: ${r.content.l1_5} [${reasons.join('; ')}]`);
    }
    slots.push({ tag: 'risks', lines });
  }

  // 8. Recovery (session activity)
  try {
    const summary = summarizeSession(adapter.getProjectRoot(), SESSION_DEFAULT_HOURS_BACK);
    if (summary && !summary.startsWith('No activity')) {
      slots.push({ tag: 'recovery', lines: summary.split('\n').map((l) => `    ${l}`) });
    }
  } catch {
    // ignore
  }

  // 9. Files — merged recent_files + fs_health
  const artifacts = entries.filter((e): e is ArtifactEntry => e.type === 'Artifact');
  const recent = artifacts
    .filter((e) => e.artifact.fs.exists)
    .sort(
      (a, b) =>
        new Date(b.artifact.fs.last_modified_at).getTime() -
        new Date(a.artifact.fs.last_modified_at).getTime()
    )
    .slice(0, PROMPT_MAX_RECENT_FILES);

  const unhealthy = artifacts
    .filter((e) => e.artifact.health.status !== 'healthy')
    .slice(0, PROMPT_MAX_FS_HEALTH);

  if (recent.length > 0 || unhealthy.length > 0) {
    const lines: string[] = [];
    for (const a of recent) {
      const mtime = a.artifact.fs.last_modified_at.slice(0, 16).replace('T', ' ');
      lines.push(`    ${a.artifact.path} (${mtime})`);
    }
    for (const a of unhealthy) {
      const reasons = a.artifact.health.reasons.join(', ') || a.artifact.health.status;
      lines.push(`    ${a.artifact.path}: ⚠ ${reasons}`);
    }
    slots.push({ tag: 'files', lines });
  }

  // 10. Dictionary — on-demand, least important (truncation-friendly)
  const relevantIds = collectRelevantEntryIds(entries, ws);
  const dictLines = buildDictionary(entries, relevantIds);
  if (dictLines.length > 0) {
    slots.push({ tag: 'dictionary', lines: dictLines });
  }

  // --- Assemble with global budget ---
  let prompt = '<loom_context>\n';
  for (const slot of slots) {
    const block = `  <${slot.tag}>\n${slot.lines.join('\n')}\n  </${slot.tag}>\n`;
    prompt += block;
  }
  prompt += '</loom_context>';

  // Enforce hard character cap by truncating from the end
  if (prompt.length > PROMPT_MAX_CHARS) {
    const truncated = prompt.slice(0, PROMPT_MAX_CHARS);
    // Find last complete slot boundary to avoid broken XML
    const lastClose = truncated.lastIndexOf('  </');
    if (lastClose > 0) {
      prompt = truncated.slice(0, lastClose) + '\n  <!-- truncated -->\n</loom_context>';
    } else {
      prompt = truncated + '\n<!-- truncated -->';
    }
  }

  return prompt;
}
