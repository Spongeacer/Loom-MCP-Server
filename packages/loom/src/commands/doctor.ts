import { runDoctor } from '../core/doctor.js';
import { runInstallMcp } from './install-mcp.js';

export function runDoctorCommand(args: string[] = []): string {
  const fixMode = args.includes('--fix');
  const projectRoot = process.cwd();

  if (fixMode) {
    const lines: string[] = [];
    lines.push('Running MCP auto-fix...\n');
    lines.push(runInstallMcp());
    lines.push('\nRe-running doctor checks...\n');
    const results = runDoctor(projectRoot);
    let hadIssue = false;
    for (const r of results) {
      const icon = r.level === 'ok' ? '✓' : r.level === 'warning' ? '⚠' : '✗';
      lines.push(`${icon} [${r.level.toUpperCase()}] ${r.message}`);
      if (r.level !== 'ok') hadIssue = true;
    }
    if (hadIssue) {
      lines.push('\nSome issues remain after auto-fix. Please review above.');
    } else {
      lines.push('\nAll checks passed after auto-fix.');
    }
    return lines.join('\n');
  }

  const results = runDoctor(projectRoot);
  let hadIssue = false;
  const lines: string[] = [];
  for (const r of results) {
    const icon = r.level === 'ok' ? '✓' : r.level === 'warning' ? '⚠' : '✗';
    lines.push(`${icon} [${r.level.toUpperCase()}] ${r.message}`);
    if (r.level !== 'ok') hadIssue = true;
  }
  if (hadIssue) {
    lines.push('\nRun `.loom doctor` after fixes to re-check, or `.loom doctor --fix` to auto-fix MCP configs.');
  } else {
    lines.push('\nAll checks passed.');
  }
  return lines.join('\n');
}
