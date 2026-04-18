import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import * as fs_utils_js_1 from './fs-utils.js';
import * as store_js_1 from './store.js';

const DEFAULT_LOG_ROOT = path.join(os.homedir(), '.loom', 'logs');
const MAX_LOG_SIZE = 5 * 1024 * 1024; // 5MB
const MAX_BACKUPS = 3;
function resolveLogDir(projectRoot) {
    const envDir = process.env.LOOM_LOG_DIR;
    if (envDir)
        return envDir;
    let projectName = 'unknown';
    if (projectRoot) {
        try {
            const cfg = (0, store_js_1.getConfig)(projectRoot);
            if (cfg?.project_name) {
                projectName = cfg.project_name.replace(/[^a-zA-Z0-9_-]/g, '_');
            }
            else {
                projectName = path.basename(projectRoot).replace(/[^a-zA-Z0-9_-]/g, '_');
            }
        }
        catch {
            projectName = path.basename(projectRoot).replace(/[^a-zA-Z0-9_-]/g, '_');
        }
    }
    return path.join(DEFAULT_LOG_ROOT, projectName);
}
function rotateIfNeeded(filePath) {
    try {
        const stats = fs.statSync(filePath);
        if (stats.size < MAX_LOG_SIZE)
            return;
    }
    catch {
        return; // file doesn't exist yet
    }
    // Rotate: log.3 -> delete, log.2 -> log.3, log.1 -> log.2, log -> log.1
    const base = filePath;
    for (let i = MAX_BACKUPS - 1; i >= 1; i--) {
        const src = `${base}.${i}`;
        const dst = `${base}.${i + 1}`;
        if (fs.existsSync(src)) {
            try {
                if (fs.existsSync(dst))
                    fs.unlinkSync(dst);
                fs.renameSync(src, dst);
            }
            catch { /* ignore rotation errors */ }
        }
    }
    try {
        const firstBackup = `${base}.1`;
        if (fs.existsSync(firstBackup))
            fs.unlinkSync(firstBackup);
        fs.renameSync(base, firstBackup);
    }
    catch { /* ignore rotation errors */ }
}
class FileLogger {
    stream;
    constructor(filePath) {
        (0, fs_utils_js_1.ensureDir)(path.dirname(filePath));
        rotateIfNeeded(filePath);
        this.stream = fs.createWriteStream(filePath, { flags: 'a' });
        this.stream.on('error', () => { });
    }
    write(level, message) {
        const line = `[${new Date().toISOString()}] [${level.toUpperCase()}] ${message}\n`;
        this.stream.write(line);
    }
    end() {
        this.stream.end();
    }
}
/** Create a logger for a specific log file within the project's log directory. */
function createLogger(fileName, projectRoot) {
    const logDir = resolveLogDir(projectRoot);
    const filePath = path.join(logDir, fileName);
    return new FileLogger(filePath);
}
/** List all project log directories under the global log root. */
function listLogProjects() {
    try {
        if (!fs.existsSync(DEFAULT_LOG_ROOT))
            return [];
        return fs.readdirSync(DEFAULT_LOG_ROOT)
            .map((name) => ({ name, path: path.join(DEFAULT_LOG_ROOT, name) }))
            .filter((p) => fs.statSync(p.path).isDirectory());
    }
    catch {
        return [];
    }
}
/** Read the last N lines of a log file. */
function tailLog(filePath, maxLines = 100) {
    try {
        if (!fs.existsSync(filePath))
            return '';
        const content = fs.readFileSync(filePath, 'utf-8');
        const lines = content.split('\n');
        return lines.slice(-maxLines).join('\n');
    }
    catch {
        return '';
    }
}
//# sourceMappingURL=logger.js.map
export { createLogger, listLogProjects, tailLog };
