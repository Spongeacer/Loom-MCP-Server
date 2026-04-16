import { getEntry } from '../core/store.js';

export function runExplain(args: string[]): string {
  const id = args[0];
  if (!id) {
    throw new Error('Usage:.loom explain <id>');
  }

  const entry = getEntry(id);
  if (!entry) {
    throw new Error(`Entry not found: ${id}`);
  }

  const lines: string[] = [];
  lines.push(`Entry: ${entry.id}`);
  lines.push(`Type:  ${entry.type}`);
  lines.push(`Trust: ${entry.trust.level} (source: ${entry.trust.source})`);
  lines.push(`State: ${entry.lifecycle.state}`);
  lines.push(`Quality: ${(entry.quality.composite_score * 100).toFixed(0)}%`);
  lines.push(`Created: ${entry.lifecycle.created}`);
  lines.push(`Updated: ${entry.lifecycle.updated}`);
  lines.push(`Summary: ${entry.content.l2}`);

  if (entry.type === 'Task') {
    const t = entry.task;
    lines.push(`Task Status: ${t.status}`);
    lines.push(`Priority: ${t.priority}`);
    lines.push(`Current: ${t.progress.current || 'N/A'}`);
    lines.push(`Next: ${t.progress.next || 'N/A'}`);
  }

  if (entry.type === 'Decision') {
    const d = entry.decision;
    lines.push(`Question: ${d.question}`);
    lines.push(`Chosen: ${d.chosen}`);
    lines.push(`Rationale: ${d.rationale}`);
  }

  if (entry.type === 'Artifact') {
    const a = entry.artifact;
    lines.push(`Path: ${a.path}`);
    lines.push(`Category: ${a.category}`);
    lines.push(`Granularity: ${a.granularity}`);
  }

  if (entry.bindings_out.length > 0) {
    lines.push(`\nBindings Out:`);
    for (const b of entry.bindings_out) {
      lines.push(`  → ${b.target} [${b.rel}] conf=${b.conf.toFixed(2)}`);
    }
  }

  if (entry.bindings_in.length > 0) {
    lines.push(`\nBindings In:`);
    for (const b of entry.bindings_in) {
      lines.push(`  ← ${b.source || 'unknown'} [${b.rel}] conf=${b.conf.toFixed(2)}`);
    }
  }

  return lines.join('\n');
}
