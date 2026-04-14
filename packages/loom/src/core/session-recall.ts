import * as fs from 'node:fs';
import * as path from 'node:path';
import { getPaths } from './paths.js';

export interface WalEvent {
  type: string;
  t: string;
  [key: string]: unknown;
}

export function readWalEvents(
  projectRoot: string,
  limit = 50,
  filterType?: string
): WalEvent[] {
  const paths = getPaths(projectRoot);
  if (!fs.existsSync(paths.wal)) return [];

  const lines = fs.readFileSync(paths.wal, 'utf-8').split('\n').filter(Boolean);
  const events: WalEvent[] = [];
  for (let i = lines.length - 1; i >= 0 && events.length < limit; i--) {
    try {
      const ev = JSON.parse(lines[i]) as WalEvent;
      if (!filterType || ev.type === filterType) {
        events.push(ev);
      }
    } catch {
      // skip malformed
    }
  }
  return events.reverse(); // chronological order
}

export function summarizeSession(
  projectRoot: string,
  hoursBack = 24
): string {
  const since = new Date(Date.now() - hoursBack * 60 * 60 * 1000).toISOString();
  const paths = getPaths(projectRoot);
  if (!fs.existsSync(paths.wal)) return 'No session history found.';

  const lines = fs.readFileSync(paths.wal, 'utf-8').split('\n').filter(Boolean);
  const recent: WalEvent[] = [];
  for (const line of lines) {
    try {
      const ev = JSON.parse(line) as WalEvent;
      if (ev.t >= since) recent.push(ev);
    } catch {
      // skip
    }
  }

  if (recent.length === 0) {
    return `No activity in the last ${hoursBack} hours.`;
  }

  const counts: Record<string, number> = {};
  const tasks = new Set<string>();
  const decisions = new Set<string>();
  const files = new Set<string>();

  for (const ev of recent) {
    counts[ev.type] = (counts[ev.type] || 0) + 1;
    if (ev.type === 'task_set' && ev.id) tasks.add(String(ev.id));
    if (ev.type === 'decision_recorded' && ev.id) decisions.add(String(ev.id));
    if (ev.type === 'watch_flush' && Array.isArray(ev.files)) {
      for (const f of ev.files) files.add(String(f));
    }
  }

  const linesOut: string[] = [];
  linesOut.push(`Session summary for the last ${hoursBack} hours:`);
  linesOut.push(`- Total events: ${recent.length}`);
  linesOut.push(`- Event breakdown: ${Object.entries(counts).map(([k, v]) => `${k}=${v}`).join(', ')}`);
  if (tasks.size > 0) linesOut.push(`- Tasks touched: ${Array.from(tasks).join(', ')}`);
  if (decisions.size > 0) linesOut.push(`- Decisions recorded: ${Array.from(decisions).join(', ')}`);
  if (files.size > 0) linesOut.push(`- Files changed: ${Array.from(files).slice(0, 5).join(', ')}${files.size > 5 ? '...' : ''}`);

  return linesOut.join('\n');
}
