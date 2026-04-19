import type { DoctorReport } from '../commands/doctor.js';

export function formatDoctorReport(report: DoctorReport): string {
  const lines: string[] = [];
  let hadIssue = false;

  for (const c of report.ok) {
    lines.push(`✓ [OK] ${c.message}`);
  }
  for (const c of report.warnings) {
    lines.push(`⚠ [WARNING] ${c.message}`);
    hadIssue = true;
  }
  for (const c of report.critical) {
    lines.push(`✗ [CRITICAL] ${c.message}`);
    hadIssue = true;
  }

  if (hadIssue) {
    lines.push('\nSome issues found. Review above.');
  } else {
    lines.push('\nAll checks passed.');
  }

  return lines.join('\n');
}
