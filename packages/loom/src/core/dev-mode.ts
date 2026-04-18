import * as cp from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as paths_js_1 from './paths.js';
import * as lock_js_1 from './lock.js';

function getPidFile(cwd) {
    return (0, paths_js_1.getPaths)(cwd).root + '/cache/dev-pid.txt';
}
function getHealthFile(cwd) {
    return (0, paths_js_1.getPaths)(cwd).root + '/cache/dev-health.json';
}
function getSnapshotFile(cwd) {
    return (0, paths_js_1.getPaths)(cwd).root + '/cache/dev-processes.json';
}
function isDevModeHealthy(cwd) {
    const healthFile = getHealthFile(cwd);
    if (!fs.existsSync(healthFile))
        return true;
    try {
        const health = JSON.parse(fs.readFileSync(healthFile, 'utf-8'));
        const ageMs = Date.now() - (health.lastHeartbeat || 0);
        if (ageMs > 2 * 60 * 1000)
            return false;
        if (health.status === 'shutdown')
            return false;
        return true;
    }
    catch {
        return true;
    }
}
function getDevStatus(cwd) {
    const pidFile = getPidFile(cwd);
    const snapshotFile = getSnapshotFile(cwd);
    let processes = [];
    let timestamp;
    if (fs.existsSync(snapshotFile)) {
        try {
            const data = JSON.parse(fs.readFileSync(snapshotFile, 'utf-8'));
            processes = data.processes || [];
            timestamp = data.timestamp;
        }
        catch {
            // ignore malformed snapshot
        }
    }
    if (!fs.existsSync(pidFile)) {
        return { running: false, processes, timestamp };
    }
    const pid = parseInt(fs.readFileSync(pidFile, 'utf-8').trim(), 10);
    if (isNaN(pid)) {
        try {
            fs.unlinkSync(pidFile);
        }
        catch { /* ignore */ }
        return { running: false, processes, timestamp };
    }
    if (!(0, lock_js_1.isProcessAlive)(pid)) {
        try {
            fs.unlinkSync(pidFile);
        }
        catch { /* ignore */ }
        return { running: false, processes, timestamp };
    }
    if (!isDevModeHealthy(cwd)) {
        try {
            fs.unlinkSync(pidFile);
        }
        catch { /* ignore */ }
        return { running: false, processes, timestamp };
    }
    return { running: true, pid, processes, timestamp };
}
function stopDevMode(cwd) {
    const status = getDevStatus(cwd);
    if (!status.running || !status.pid) {
        return 'Dev mode is not running.';
    }
    try {
        process.kill(status.pid, 'SIGTERM');
        const deadline = Date.now() + 2000;
        while (Date.now() < deadline) {
            if (!(0, lock_js_1.isProcessAlive)(status.pid))
                break;
            const buffer = new SharedArrayBuffer(4);
            const view = new Int32Array(buffer);
            Atomics.wait(view, 0, 0, 100);
        }
        if ((0, lock_js_1.isProcessAlive)(status.pid)) {
            try {
                process.kill(status.pid, 'SIGKILL');
            }
            catch { /* ignore */ }
        }
        const pidFile = getPidFile(cwd);
        const healthFile = getHealthFile(cwd);
        for (const f of [pidFile, healthFile]) {
            if (fs.existsSync(f)) {
                try {
                    fs.unlinkSync(f);
                }
                catch { /* ignore */ }
            }
        }
        return `Dev mode stopped (pid: ${status.pid}).`;
    }
    catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        return `Failed to stop dev mode: ${message}`;
    }
}
function startDevMode(cwd) {
    const projectRoot = cwd || process.cwd();
    const status = getDevStatus(projectRoot);
    if (status.running) {
        return `Dev mode already running (pid: ${status.pid}).`;
    }
    if (!(0, lock_js_1.acquireLockSync)(projectRoot, 'dev-mode-start')) {
        return 'Dev mode start is already in progress in another process.';
    }
    const statusAfterLock = getDevStatus(projectRoot);
    if (statusAfterLock.running) {
        (0, lock_js_1.releaseLockSync)(projectRoot, 'dev-mode-start');
        return `Dev mode already running (pid: ${statusAfterLock.pid}).`;
    }
    const candidates = [
        path.resolve(projectRoot, 'packages/loom/dist/core/dev-mode-runner.js'),
        path.resolve(projectRoot, 'dist/core/dev-mode-runner.js'),
        path.join(__dirname, 'dev-mode-runner.js'),
    ];
    const actualScript = candidates.find((p) => fs.existsSync(p));
    if (!actualScript) {
        (0, lock_js_1.releaseLockSync)(projectRoot, 'dev-mode-start');
        return 'Dev mode runner not found.';
    }
    const healthFile = getHealthFile(projectRoot);
    if (fs.existsSync(healthFile)) {
        try {
            fs.unlinkSync(healthFile);
        }
        catch { /* ignore */ }
    }
    const child = cp.spawn('node', [actualScript], {
        detached: true,
        stdio: 'ignore',
        cwd: projectRoot,
    });
    child.unref();
    const pidFile = getPidFile(projectRoot);
    fs.writeFileSync(pidFile, String(child.pid));
    (0, lock_js_1.releaseLockSync)(projectRoot, 'dev-mode-start');
    return `Dev mode started (pid: ${child.pid}). Polling every 5s.`;
}
//# sourceMappingURL=dev-mode.js.map
export { getDevStatus, stopDevMode, startDevMode };
