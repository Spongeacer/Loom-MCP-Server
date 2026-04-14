import { runDoctor } from '../core/doctor.js';

export function runDoctorCommand(): void {
  const projectRoot = process.cwd();
  const results = runDoctor(projectRoot);
  let hadIssue = false;
  for (const r of results) {
    const icon = r.level === 'ok' ? '✓' : r.level === 'warning' ? '⚠' : '✗';
    console.log(`${icon} [${r.level.toUpperCase()}] ${r.message}`);
    if (r.level !== 'ok') hadIssue = true;
  }
  if (hadIssue) {
    console.log('\nRun `.loom doctor` after fixes to re-check.');
  } else {
    console.log('\nAll checks passed.');
  }
}
