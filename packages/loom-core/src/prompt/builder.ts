import type { StoreAdapter } from '../store/adapter.js';
import type { ArtifactEntry } from '../types/index.js';
import { LOOM_VERSION } from '../constants.js';
import {
  PROMPT_MAX_DECISIONS,
  PROMPT_MAX_DICTIONARY,
  PROMPT_MAX_RISKS,
  PROMPT_MAX_FS_HEALTH,
  PROMPT_MAX_RECENT_FILES,
  SESSION_DEFAULT_HOURS_BACK,
} from '../constants.js';
import { summarizeSession } from '../session-recall.js';

export interface BuildOptions {
  includeDevMode?: boolean;
}

export function buildSlotPrompt(adapter: StoreAdapter, _options?: BuildOptions): string {
  const ws = adapter.getWorkingSet();
  const entries = adapter.listEntries();
  const config = adapter.getConfig();

  let prompt = '<loom_context>\n';

  // Protocol (static)
  prompt += `  <protocol>LOOM v${LOOM_VERSION}</protocol>\n`;

  // Project info
  if (config) {
    prompt += `  <project>${config.project_name}</project>\n`;
  }

  // Governance (Rule entries — hard constraints)
  const rules = entries
    .filter((e) => e.type === 'Rule')
    .sort((a, b) => a.id.localeCompare(b.id));
  if (rules.length > 0) {
    prompt += '  <governance>\n';
    for (const r of rules) {
      prompt += `    ↣${r.id}: ${r.content.l1_5}\n`;
    }
    prompt += '  </governance>\n';
  }

  // Decisions (architecture choices, newest first)
  const decisions = entries
    .filter((e) => e.type === 'Decision')
    .sort((a, b) => new Date(b.lifecycle.updated).getTime() - new Date(a.lifecycle.updated).getTime());
  if (decisions.length > 0) {
    prompt += '  <decisions>\n';
    for (const d of decisions.slice(0, PROMPT_MAX_DECISIONS)) {
      prompt += `    ↣${d.id}: ${d.content.l1_5}\n`;
    }
    prompt += '  </decisions>\n';
  }

  // Dictionary (micro-summaries of all entries, stable sort for cache hit)
  const dictEntries = [...entries].sort((a, b) => a.id.localeCompare(b.id));
  if (dictEntries.length > 0) {
    prompt += '  <dictionary>\n';
    for (const e of dictEntries.slice(0, PROMPT_MAX_DICTIONARY)) {
      prompt += `    ↣${e.id} (${e.type}): ${e.content.l1_5}\n`;
    }
    prompt += '  </dictionary>\n';
  }

  // Active task
  if (ws.active_task) {
    const task = entries.find((e) => e.id === ws.active_task && e.type === 'Task');
    if (task) {
      prompt += `  <task id="${task.id}">${task.content.l1_5}</task>\n`;
    }
  }

  // Working set (pinned + hot)
  const hotIds = [...ws.pinned_entries, ...ws.hot_entries].slice(0, 20);
  if (hotIds.length) {
    prompt += '  <working_set>\n';
    for (const id of hotIds) {
      const entry = entries.find((e) => e.id === id);
      if (entry) {
        prompt += `    <entry id="${entry.id}" type="${entry.type}">${entry.content.l1_5}</entry>\n`;
      }
    }
    prompt += '  </working_set>\n';
  }

  // Risks (low quality, stale, or conflicted entries)
  const risks = entries
    .filter((e) => {
      return (
        e.quality.composite_score < 0.5 ||
        e.lifecycle.state === 'stale' ||
        e.conflicts.conflicts_with.length > 0
      );
    })
    .sort((a, b) => a.id.localeCompare(b.id));
  if (risks.length > 0) {
    prompt += '  <risks>\n';
    for (const r of risks.slice(0, PROMPT_MAX_RISKS)) {
      const reasons: string[] = [];
      if (r.quality.composite_score < 0.5) reasons.push(`score=${r.quality.composite_score.toFixed(2)}`);
      if (r.lifecycle.state === 'stale') reasons.push('stale');
      if (r.conflicts.conflicts_with.length > 0) reasons.push(`conflicts=${r.conflicts.conflicts_with.join(',')}`);
      prompt += `    ↣${r.id}: ${r.content.l1_5} [${reasons.join('; ')}]\n`;
    }
    prompt += '  </risks>\n';
  }

  // Recovery (recent session activity)
  try {
    const summary = summarizeSession(adapter.getProjectRoot(), SESSION_DEFAULT_HOURS_BACK);
    if (summary && !summary.startsWith('No activity')) {
      prompt += `  <recovery>\n    ${summary.replace(/\n/g, '\n    ')}\n  </recovery>\n`;
    }
  } catch {
    // ignore — session recall is best-effort
  }

  // Recent files ( Artifact entries sorted by mtime )
  const artifacts = entries
    .filter((e): e is ArtifactEntry => e.type === 'Artifact')
    .filter((e) => e.artifact.fs.exists)
    .sort(
      (a, b) =>
        new Date(b.artifact.fs.last_modified_at).getTime() -
        new Date(a.artifact.fs.last_modified_at).getTime()
    );
  if (artifacts.length > 0) {
    prompt += '  <recent_files>\n';
    for (const a of artifacts.slice(0, PROMPT_MAX_RECENT_FILES)) {
      const mtime = a.artifact.fs.last_modified_at.slice(0, 16).replace('T', ' ');
      prompt += `    ${a.artifact.path} (${mtime})\n`;
    }
    prompt += '  </recent_files>\n';
  }

  // FS Health (unhealthy artifacts)
  const unhealthy = entries
    .filter((e): e is ArtifactEntry => e.type === 'Artifact')
    .filter((e) => e.artifact.health.status !== 'healthy');
  if (unhealthy.length > 0) {
    prompt += '  <fs_health>\n';
    for (const a of unhealthy.slice(0, PROMPT_MAX_FS_HEALTH)) {
      const reasons = a.artifact.health.reasons.join(', ') || a.artifact.health.status;
      prompt += `    ${a.artifact.path}: ${a.artifact.health.status} — ${reasons}\n`;
    }
    prompt += '  </fs_health>\n';
  }

  prompt += '</loom_context>';
  return prompt;
}
