import { readWalEvents, summarizeSession } from '../core/session-recall.js';

export function runSession(args: string[]): void {
  const sub = args[0] || 'summary';
  const projectRoot = process.cwd();

  if (sub === 'recent') {
    const limit = parseInt(args[1] || '20', 10);
    const filterType = args[2] || undefined;
    const events = readWalEvents(projectRoot, limit, filterType);
    console.log(`=== Last ${events.length} WAL events ===`);
    for (const ev of events) {
      console.log(`[${ev.t}] ${ev.type}: ${JSON.stringify(Object.fromEntries(Object.entries(ev).filter(([k]) => k !== 't' && k !== 'type')))}`);
    }
    return;
  }

  if (sub === 'summary') {
    const hours = parseInt(args[1] || '24', 10);
    console.log(summarizeSession(projectRoot, hours));
    return;
  }

  console.log('Usage:.loom session [summary [hours] | recent [limit] [filter_type]]');
}
