#!/usr/bin/env node
/**
 * Dev-mode background runner.
 * Polls for process and port changes, writes snapshot to cache,
 * and records lifecycle events to WAL.
 */
const POLL_INTERVAL_MS = 5000;
const CMD_TIMEOUT_MS = 3000;
const DEV_RELEVANT_COMMANDS = new Set([
    'node', 'npm', 'yarn', 'pnpm', 'npx', 'bun',
    'python', 'python3', 'pip', 'pytest', 'pipenv', 'poetry',
    'ruby', 'bundle', 'rake', 'rails',
    'java', 'javac', 'gradle', 'mvn',
    'go', 'cargo', 'rustc',
    'jest', 'vitest', 'mocha', 'ava', 'tap', 'jasmine',
    'webpack', 'vite', 'rollup', 'esbuild', 'tsc', 'ts-node', 'tsx',
    'docker', 'docker-compose', 'podman',
    'redis-server', 'mongod', 'postgres', 'mysql', 'mariadb',
    'nginx', 'apache2', 'httpd',
]);
function isRelevantCommand(command) {
    const base = path.basename(command).toLowerCase();
    return DEV_RELEVANT_COMMANDS.has(base);
}
function getSnapshotPath() {
    return (0, paths_js_1.getPaths)().root + '/cache/dev-processes.json';
}
function getHealthPath() {
    return (0, paths_js_1.getPaths)().root + '/cache/dev-health.json';
}
function writeHealth() {
    try {
        fs.writeFileSync(getHealthPath(), JSON.stringify({ lastHeartbeat: Date.now(), status: 'ok' }));
    }
    catch { /* ignore */ }
}
function writeShutdown() {
    try {
        fs.writeFileSync(getHealthPath(), JSON.stringify({ lastHeartbeat: Date.now(), status: 'shutdown' }));
    }
    catch { /* ignore */ }
}
function capturePorts() {
    const result = new Map();
    try {
        const output = (0, node_child_process_1.execSync)('lsof -iTCP -sTCP:LISTEN -P -n', {
            encoding: 'utf-8',
            timeout: CMD_TIMEOUT_MS,
            stdio: ['pipe', 'pipe', 'ignore'],
        });
        const lines = output.split('\n');
        for (const line of lines) {
            if (!line.trim() || line.startsWith('COMMAND'))
                continue;
            const match = line.match(/^(\S+)\s+(\d+)\s+.*\s+TCP\s+[^:]+:(\d+)\s+\(LISTEN\)/);
            if (match) {
                const command = match[1];
                const pid = parseInt(match[2], 10);
                const port = parseInt(match[3], 10);
                const existing = result.get(pid);
                if (existing) {
                    if (!existing.ports.includes(port))
                        existing.ports.push(port);
                }
                else {
                    result.set(pid, { command, ports: [port] });
                }
            }
        }
    }
    catch {
        // lsof unavailable or failed
    }
    return result;
}
function captureProcesses() {
    const result = new Map();
    try {
        const output = (0, node_child_process_1.execSync)('ps -eo pid,ppid,comm,args', {
            encoding: 'utf-8',
            timeout: CMD_TIMEOUT_MS,
            stdio: ['pipe', 'pipe', 'ignore'],
        });
        const lines = output.split('\n').slice(1); // skip header
        for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed)
                continue;
            const match = trimmed.match(/^(\d+)\s+(\d+)\s+(\S+)\s+(.*)$/);
            if (match) {
                const pid = parseInt(match[1], 10);
                const ppid = parseInt(match[2], 10);
                const comm = match[3];
                const args = match[4].trim();
                // comm may be truncated (e.g. 16 chars on macOS); derive command from args[0]
                const rawCommand = args.split(/\s+/)[0] || comm;
                const command = path.basename(rawCommand);
                if (isRelevantCommand(command)) {
                    result.set(pid, { ppid, command, args });
                }
            }
        }
    }
    catch {
        // ps unavailable
    }
    return result;
}
function buildSnapshot() {
    const ports = capturePorts();
    const procs = captureProcesses();
    const result = [];
    for (const [pid, proc] of procs) {
        const portInfo = ports.get(pid);
        result.push({ pid, ...proc, ports: portInfo?.ports || [] });
    }
    // Also include port-only processes that look relevant (race condition or short-lived)
    for (const [pid, portInfo] of ports) {
        if (!result.some((p) => p.pid === pid)) {
            const proc = procs.get(pid);
            if (proc) {
                result.push({ pid, ...proc, ports: portInfo.ports });
            }
            else if (isRelevantCommand(portInfo.command)) {
                result.push({ pid, ppid: 0, command: portInfo.command, args: '', ports: portInfo.ports });
            }
        }
    }
    return result;
}
function detectChanges(prev, curr) {
    const events = [];
    const prevMap = new Map(prev.map((p) => [p.pid, p]));
    const currMap = new Map(curr.map((p) => [p.pid, p]));
    for (const [pid, c] of currMap) {
        const p = prevMap.get(pid);
        if (!p) {
            events.push({
                type: 'spawned',
                pid,
                command: c.command,
                args: c.args,
                ports: c.ports,
                timestamp: new Date().toISOString(),
            });
        }
        else {
            const newPorts = c.ports.filter((port) => !p.ports.includes(port));
            const lostPorts = p.ports.filter((port) => !c.ports.includes(port));
            if (newPorts.length > 0 || lostPorts.length > 0) {
                events.push({
                    type: 'port_changed',
                    pid,
                    command: c.command,
                    ports: c.ports,
                    oldPorts: p.ports,
                    timestamp: new Date().toISOString(),
                });
            }
        }
    }
    for (const [pid, p] of prevMap) {
        if (!currMap.has(pid)) {
            events.push({
                type: 'exited',
                pid,
                command: p.command,
                args: p.args,
                ports: p.ports,
                timestamp: new Date().toISOString(),
            });
        }
    }
    return events;
}
function persistSnapshot(snapshot) {
    const snapshotPath = getSnapshotPath();
    fs.mkdirSync(path.dirname(snapshotPath), { recursive: true });
    fs.writeFileSync(snapshotPath, JSON.stringify(snapshot, null, 2));
}
async function logEvents(events) {
    if (events.length === 0)
        return;
    const root = (0, paths_js_1.resolveProjectRoot)();
    for (const event of events) {
        await (0, wal_queue_js_1.appendWalAsync)({
            type: `dev_${event.type}`,
            pid: event.pid,
            command: event.command,
            args: event.args,
            ports: event.ports,
            old_ports: event.oldPorts,
        }, root).catch(() => {
            // ignore WAL failures during shutdown
        });
    }
}
let shuttingDown = false;
let lastSnapshot = [];
async function tick() {
    if (shuttingDown)
        return;
    writeHealth();
    const current = buildSnapshot();
    const events = detectChanges(lastSnapshot, current);
    lastSnapshot = current;
    persistSnapshot({ timestamp: new Date().toISOString(), processes: current });
    if (events.length > 0) {
        await logEvents(events);
    }
}
async function main() {
    const snapshotPath = getSnapshotPath();
    if (fs.existsSync(snapshotPath)) {
        try {
            const data = JSON.parse(fs.readFileSync(snapshotPath, 'utf-8'));
            lastSnapshot = data.processes || [];
        }
        catch {
            lastSnapshot = [];
        }
    }
    // Initial tick
    await tick();
    const timer = setInterval(() => {
        void tick();
    }, POLL_INTERVAL_MS);
    process.on('SIGTERM', () => {
        shuttingDown = true;
        clearInterval(timer);
        writeShutdown();
        process.exit(0);
    });
    process.on('SIGINT', () => {
        shuttingDown = true;
        clearInterval(timer);
        writeShutdown();
        process.exit(0);
    });
}
main().catch((e) => {
    console.error('Dev mode runner error:', e);
    process.exit(1);
});
//# sourceMappingURL=dev-mode-runner.js.map
