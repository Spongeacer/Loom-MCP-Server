import { readWalEvents, summarizeSession } from '../core/session-recall.js';

export function runSession(args: string[]): string {
  const sub = args[0] || 'summary';
  const projectRoot = process.cwd();

  if (sub === 'recent') {
    const limit = parseInt(args[1] || '20', 10);
    const filterType = args[2] || undefined;
    const events = readWalEvents(projectRoot, limit, filterType);
    const lines: string[] = [];
    lines.push(`=== Last ${events.length} WAL events ===`);
    for (const ev of events) {
      lines.push(`[${ev.t}] ${ev.type}: ${JSON.stringify(Object.fromEntries(Object.entries(ev).filter(([k]) => k !== 't' && k !== 'type')))}`);
    }
    return lines.join('\n');
  }

  if (sub === 'summary') {
    const hours = parseInt(args[1] || '24', 10);
    return summarizeSession(projectRoot, hours);
  }

  return 'Usage:.loom session [summary [hours] | recent [limit] [filter_type]]';
}
