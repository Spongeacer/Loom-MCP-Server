import type { StoreAdapter } from '@spongeacer/loom-core';
import { createDecisionEntry, createMemoryEntry, createRuleEntry, createBinding, appendWalAsync } from '@spongeacer/loom-core';

export function runDecisionCommand(args: string[], store: StoreAdapter): string {
  if (args.length < 3) {
    return `Usage: loom decision <question> <chosen> <rationale> [impact...]
Example: loom decision "Which router?" "Hono" "Lighter, better TS support" src/routes src/middleware`;
  }
  const [question, chosen, rationale, ...impactScope] = args;
  const entry = createDecisionEntry(question, chosen, rationale, impactScope);
  store.saveEntry(entry);

  const ws = store.getWorkingSet();
  if (ws.active_task) {
    store.saveBinding(createBinding(entry.id, ws.active_task, 'realized_in', 1.0));
  }

  void appendWalAsync({ type: 'decision_recorded', id: entry.id });
  return `Recorded decision: ${entry.id}\n${question} → ${chosen}`;
}

export function runMemoryCommand(args: string[], store: StoreAdapter): string {
  if (args.length < 1) {
    return `Usage: loom memory <content> [--user] [tag1 tag2...]
Example: loom memory "Prefers TypeScript over JS" --user coding-style frontend`;
  }

  let namespace: 'project' | 'user' = 'project';
  const contentParts: string[] = [];
  const tags: string[] = [];

  for (const arg of args) {
    if (arg === '--user') {
      namespace = 'user';
    } else if (contentParts.length === 0) {
      contentParts.push(arg);
    } else {
      tags.push(arg);
    }
  }

  const content = contentParts.join(' ');
  const entry = createMemoryEntry(content, tags, namespace);
  store.saveEntry(entry);

  if (namespace === 'project') {
    const ws = store.getWorkingSet();
    if (ws.active_task) {
      store.saveBinding(createBinding(entry.id, ws.active_task, 'impacts', 0.8));
    }
  }

  void appendWalAsync({ type: 'memory_added', id: entry.id });
  return `Added memory: ${entry.id}\n${content}`;
}

export function runRuleCommand(args: string[], store: StoreAdapter): string {
  if (args.length < 2) {
    return `Usage: loom rule <scope> <rule> [rationale]
Example: loom rule naming "Use kebab-case for API routes" "Consistency with REST conventions"`;
  }
  const [scope, rule, ...rationaleParts] = args;
  const rationale = rationaleParts.join(' ');
  const entry = createRuleEntry(scope, rule, rationale);
  store.saveEntry(entry);
  void appendWalAsync({ type: 'rule_created', id: entry.id });
  return `Created rule: ${entry.id}\n[${scope}] ${rule}`;
}
