import { runDoctor } from '../core/doctor.js';

export function runDoctorCommand(): string {
  const projectRoot = process.cwd();
  const results = runDoctor(projectRoot);
  let hadIssue = false;
  const lines: string[] = [];
  for (const r of results) {
    const icon = r.level === 'ok' ? '✓' : r.level === 'warning' ? '⚠' : '✗';
    lines.push(`${icon} [${r.level.toUpperCase()}] ${r.message}`);
    if (r.level !== 'ok') hadIssue = true;
  }
  if (hadIssue) {
    lines.push('\nRun `.loom doctor` after fixes to re-check.');
  } else {
    lines.push('\nAll checks passed.');
  }
  return lines.join('\n');
}
