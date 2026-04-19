import { readWalEvents, summarizeSession } from '../session-recall.js';

export interface SessionResult {
  type: 'summary' | 'recent';
  content: string;
}

export function runSession(
  sub: 'summary' | 'recent',
  options: { hours?: number; limit?: number; filterType?: string } = {}
): SessionResult {
  const projectRoot = process.cwd();

  if (sub === 'recent') {
    const limit = options.limit ?? 20;
    const filterType = options.filterType;
    const events = readWalEvents(projectRoot, limit, filterType);
    const lines: string[] = [];
    lines.push(`=== Last ${events.length} WAL events ===`);
    for (const ev of events) {
      lines.push(`[${ev.t}] ${ev.type}: ${JSON.stringify(Object.fromEntries(Object.entries(ev).filter(([k]) => k !== 't' && k !== 'type')))}`);
    }
    return { type: 'recent', content: lines.join('\n') };
  }

  const hours = options.hours ?? 24;
  return { type: 'summary', content: summarizeSession(projectRoot, hours) };
}
