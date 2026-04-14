import { getEntry, getWorkingSet, listBindings } from '../core/store.js';

export function runExplain(args: string[]): void {
  const id = args[0];
  if (!id) {
    console.log('Usage: sdp explain <id>');
    return;
  }

  const entry = getEntry(id);
  if (!entry) {
    console.log(`Entry not found: ${id}`);
    return;
  }

  console.log(`Entry: ${entry.id}`);
  console.log(`Type:  ${entry.type}`);
  console.log(`Trust: ${entry.trust.level} (source: ${entry.trust.source})`);
  console.log(`State: ${entry.lifecycle.state}`);
  console.log(`Quality: ${(entry.quality.composite_score * 100).toFixed(0)}%`);
  console.log(`Created: ${entry.lifecycle.created}`);
  console.log(`Updated: ${entry.lifecycle.updated}`);
  console.log(`Summary: ${entry.content.l2}`);

  if (entry.type === 'Task' && 'task' in entry) {
    const t = (entry as any).task;
    console.log(`Task Status: ${t.status}`);
    console.log(`Priority: ${t.priority}`);
    console.log(`Current: ${t.progress.current || 'N/A'}`);
    console.log(`Next: ${t.progress.next || 'N/A'}`);
  }

  if (entry.type === 'Decision' && 'decision' in entry) {
    const d = (entry as any).decision;
    console.log(`Question: ${d.question}`);
    console.log(`Chosen: ${d.chosen}`);
    console.log(`Rationale: ${d.rationale}`);
  }

  if (entry.type === 'Artifact' && 'artifact' in entry) {
    const a = (entry as any).artifact;
    console.log(`Path: ${a.path}`);
    console.log(`Category: ${a.category}`);
    console.log(`Granularity: ${a.granularity}`);
  }

  if (entry.bindings_out.length > 0) {
    console.log(`\nBindings Out:`);
    for (const b of entry.bindings_out) {
      console.log(`  → ${b.target} [${b.rel}] conf=${b.conf.toFixed(2)}`);
    }
  }

  if (entry.bindings_in.length > 0) {
    console.log(`\nBindings In:`);
    for (const b of entry.bindings_in) {
      console.log(`  ← ${b.source || 'unknown'} [${b.rel}] conf=${b.conf.toFixed(2)}`);
    }
  }
}
