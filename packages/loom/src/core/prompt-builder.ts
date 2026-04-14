import type { Entry, WorkingSet, Binding, ArtifactEntry } from '../types/index.js';

export interface PromptContext {
  protocol: string;
  governance: Entry[];
  activeTask: Entry | null;
  workingSet: Entry[];
  decisions: Entry[];
  skills?: Entry[];
  risks: string[];
  recovery: string;
  dictionary: Entry[];
  recentFiles?: ArtifactEntry[];
  fsHealthRisks?: string[];
  diagnostics?: string[];
}

function renderEntryRef(entry: Entry): string {
  const l2 = typeof entry.content.l2 === 'string' ? entry.content.l2 : '';
  return `↣${entry.id}: ${l2}`;
}

function renderL3(entry: Entry): string {
  if (typeof entry.content.l3 === 'string') return entry.content.l3;
  if (entry.content.l3 && typeof entry.content.l3 === 'object' && 'file' in entry.content.l3) {
    return `[see file: ${entry.content.l3.file}]`;
  }
  return '';
}

/** Sort entries by id to ensure stable ordering for KV cache hits. */
function stableSort(entries: Entry[]): Entry[] {
  return [...entries].sort((a, b) => a.id.localeCompare(b.id));
}

export function buildSlotPrompt(ctx: PromptContext): string {
  const lines: string[] = [];
  lines.push('<loom_context>');

  // L0: Static layer — rarely changes, ideal for long-term KV cache
  lines.push('  <protocol>');
  lines.push(`    ${ctx.protocol}`);
  lines.push('  </protocol>');

  if (ctx.governance.length > 0) {
    lines.push('  <governance>');
    for (const e of stableSort(ctx.governance)) {
      lines.push(`    ${renderEntryRef(e)}`);
    }
    lines.push('  </governance>');
  }

  if (ctx.decisions.length > 0) {
    lines.push('  <decisions>');
    for (const e of stableSort(ctx.decisions)) {
      lines.push(`    ${renderEntryRef(e)}`);
    }
    lines.push('  </decisions>');
  }

  if (ctx.dictionary.length > 0) {
    lines.push('  <dictionary>');
    for (const e of stableSort(ctx.dictionary)) {
      lines.push(`    ${renderEntryRef(e)}`);
    }
    lines.push('  </dictionary>');
  }

  // L1: Dynamic layer — changes per session, placed after static layers
  if (ctx.activeTask) {
    const task = ctx.activeTask as Entry & { task?: { title: string; progress: { current: string | null }; unresolved_questions: string[] } };
    lines.push(`  <task id="${ctx.activeTask.id}" status="active">`);
    lines.push(`    目标: ${task.task?.title || ctx.activeTask.content.l2}`);
    lines.push(`    当前: ${task.task?.progress?.current || '未设定'}`);
    if (task.task?.unresolved_questions?.length) {
      lines.push(`    待决: ${task.task.unresolved_questions.join('; ')}`);
    }
    lines.push('  </task>');
  }

  if (ctx.workingSet.length > 0) {
    lines.push('  <working_set>');
    for (const e of stableSort(ctx.workingSet)) {
      lines.push(`    ${renderEntryRef(e)}`);
    }
    lines.push('  </working_set>');
  }

  if (ctx.skills && ctx.skills.length > 0) {
    lines.push('  <skills>');
    for (const e of stableSort(ctx.skills.slice(0, 3))) {
      lines.push(`    ${renderEntryRef(e)}`);
    }
    lines.push('  </skills>');
  }

  if (ctx.risks.length > 0) {
    lines.push('  <risks>');
    for (const r of ctx.risks) {
      lines.push(`    ${r}`);
    }
    lines.push('  </risks>');
  }

  if (ctx.recovery) {
    lines.push('  <recovery>');
    lines.push(`    ${ctx.recovery}`);
    lines.push('  </recovery>');
  }

  if (ctx.recentFiles && ctx.recentFiles.length > 0) {
    lines.push('  <recent_files>');
    for (const art of ctx.recentFiles) {
      const mtime = new Date(art.artifact.fs.last_modified_at).toLocaleDateString();
      lines.push(`    ↣${art.id}: ${art.artifact.path} (modified ${mtime})`);
    }
    lines.push('  </recent_files>');
  }

  if (ctx.fsHealthRisks && ctx.fsHealthRisks.length > 0) {
    lines.push('  <fs_health>');
    for (const r of ctx.fsHealthRisks) {
      lines.push(`    ${r}`);
    }
    lines.push('  </fs_health>');
  }

  if (ctx.diagnostics && ctx.diagnostics.length > 0) {
    lines.push('  <diagnostics>');
    for (const r of ctx.diagnostics) {
      lines.push(`    ${r}`);
    }
    lines.push('  </diagnostics>');
  }

  lines.push('</loom_context>');
  return lines.join('\n');
}

export function buildExpandedPrompt(entry: Entry, level: 'l2' | 'l3' = 'l3'): string {
  const lines: string[] = [];
  lines.push(`<loom_expand id="${entry.id}" type="${entry.type}">`);
  lines.push(`  <meta>`);
  lines.push(`    trust: ${entry.trust.level} | source: ${entry.trust.source} | state: ${entry.lifecycle.state}`);
  lines.push(`    quality: ${(entry.quality.composite_score * 100).toFixed(0)}%`);
  lines.push(`  </meta>`);
  lines.push(`  <content>`);
  if (level === 'l2') {
    lines.push(`    ${entry.content.l2}`);
  } else {
    lines.push(`    ${renderL3(entry)}`);
  }
  lines.push(`  </content>`);

  // Bindings are more dynamic than core content; place them last to preserve
  // KV cache for the stable meta+content prefix across repeated expands.
  const allBindings = [
    ...entry.bindings_out.map(b => ({ dir: '→' as const, id: b.target ?? '', rel: b.rel, conf: b.conf })),
    ...entry.bindings_in.map(b => ({ dir: '←' as const, id: b.source ?? '', rel: b.rel, conf: b.conf })),
  ].filter(b => b.id !== '').sort((a, b) => a.id.localeCompare(b.id));

  if (allBindings.length > 0) {
    lines.push(`  <bindings>`);
    for (const b of allBindings) {
      lines.push(`    ${b.dir} ${b.id} [${b.rel}] conf=${b.conf.toFixed(2)}`);
    }
    lines.push(`  </bindings>`);
  }

  lines.push(`</loom_expand>`);
  return lines.join('\n');
}

export function computeRisks(entries: Entry[], bindings: Binding[]): string[] {
  const risks: string[] = [];
  for (const e of entries) {
    // Only flag truly risky trust levels; "derived" from auto-scan is expected
    if (e.type === 'Artifact' && (e.trust.level === 'inferred' || e.trust.level === 'untrusted')) {
      risks.push(`↣${e.id}: 产物可信度为 ${e.trust.level}`);
    }
  }
  for (const b of bindings) {
    if (b.status === 'weak') {
      risks.push(`↣bind-${b.source}-${b.target}: 绑定置信度降至 ${b.confidence.toFixed(2)}`);
    } else if (b.status === 'broken') {
      risks.push(`↣bind-${b.source}-${b.target}: 绑定已断裂 (${b.confidence.toFixed(2)})`);
    }
  }
  return risks;
}
