import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import * as logger_js_1 from '../core/logger.js';

const DEFAULT_LOG_ROOT = path.join(os.homedir(), '.loom', 'logs');
function getLogFiles(projectPath) {
    try {
        return fs.readdirSync(projectPath)
            .filter((f) => f.endsWith('.log') || /\.log\.\d+$/.test(f))
            .map((f) => {
            const fp = path.join(projectPath, f);
            const stats = fs.statSync(fp);
            return { name: f, path: fp, size: stats.size };
        })
            .sort((a, b) => a.name.localeCompare(b.name));
    }
    catch {
        return [];
    }
}
function formatSize(bytes) {
    if (bytes < 1024)
        return `${bytes}B`;
    if (bytes < 1024 * 1024)
        return `${(bytes / 1024).toFixed(1)}KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}
function runLogs(rest = []) {
    const projectName = rest[0];
    const follow = rest.includes('--follow') || rest.includes('-f');
    const maxLines = 100;
    // If no project specified, list all projects
    if (!projectName || projectName.startsWith('-')) {
        const projects = (0, logger_js_1.listLogProjects)();
        if (projects.length === 0) {
            return 'No LOOM log directories found. Logs are stored in ~/.loom/logs/<project-name>/';
        }
        const lines = ['LOOM Log Projects:\n'];
        for (const p of projects) {
            const files = getLogFiles(p.path);
            const totalSize = files.reduce((sum, f) => sum + f.size, 0);
            lines.push(`  ${p.name}  (${files.length} files, ${formatSize(totalSize)})`);
            for (const f of files) {
                lines.push(`    ${f.name}  ${formatSize(f.size)}`);
            }
        }
        lines.push('\nRun "loom logs <project-name>" to view the latest entries.');
        return lines.join('\n');
    }
    // Show logs for a specific project
    const logDir = path.join(DEFAULT_LOG_ROOT, projectName);
    if (!fs.existsSync(logDir)) {
        return `Log directory not found: ${logDir}\nRun "loom logs" to see available projects.`;
    }
    const files = getLogFiles(logDir);
    if (files.length === 0) {
        return `No log files found in ${logDir}`;
    }
    // Prefer the main log file (without .N suffix), fallback to the first one
    const mainLog = files.find((f) => f.name === 'watch-daemon.log') || files.find((f) => !/\.log\.\d+$/.test(f.name)) || files[0];
    if (follow) {
        // --follow is not supported in this synchronous command context;
        // instruct the user to use tail -f directly.
        return `Follow mode not available via CLI. Use:\n  tail -f ${mainLog.path}`;
    }
    const content = (0, logger_js_1.tailLog)(mainLog.path, maxLines);
    const header = `=== ${projectName} / ${mainLog.name} (last ${maxLines} lines) ===\n`;
    return header + (content || '(empty log)') + '\n';
}
//# sourceMappingURL=logs.js.map
export { runLogs };
