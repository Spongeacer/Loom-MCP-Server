import * as dev_mode_js_1 from '../core/dev-mode.js';
import * as session_recall_js_1 from '../core/session-recall.js';
import * as paths_js_1 from '../core/paths.js';

function formatProcess(p) {
    const portStr = p.ports.length ? ` :${p.ports.join(', :')}` : '';
    const argsShort = p.args.length > 60 ? p.args.slice(0, 57) + '...' : p.args;
    return `  ${p.command} (PID ${p.pid})${portStr}  ${argsShort}`;
}
function runDev(rest) {
    const sub = rest[0] || 'status';
    switch (sub) {
        case 'start': {
            return (0, dev_mode_js_1.startDevMode)();
        }
        case 'stop': {
            return (0, dev_mode_js_1.stopDevMode)();
        }
        case 'status': {
            const status = (0, dev_mode_js_1.getDevStatus)();
            if (!status.processes.length) {
                return status.running
                    ? `Dev mode running (pid: ${status.pid}). No relevant processes detected.`
                    : 'Dev mode is not running.';
            }
            const lines = [
                `Dev mode: ${status.running ? `running (pid: ${status.pid})` : 'stopped'}`,
                `Snapshot: ${status.timestamp || 'unknown'}`,
                `Processes:`,
                ...status.processes.map(formatProcess),
            ];
            return lines.join('\n');
        }
        case 'logs': {
            const hours = parseInt(rest[1], 10) || 1;
            const root = (0, paths_js_1.resolveProjectRoot)();
            const events = (0, session_recall_js_1.readWalEvents)(root, 200).filter((e) => e.type?.startsWith('dev_'));
            const cutoff = Date.now() - hours * 60 * 60 * 1000;
            const recent = events.filter((e) => new Date(e.t).getTime() > cutoff);
            if (!recent.length) {
                return `No dev events in the last ${hours}h.`;
            }
            const lines = recent.map((e) => {
                const t = new Date(e.t).toLocaleTimeString();
                const ev = e;
                const pid = Number(ev.pid) || 0;
                const command = String(ev.command || 'unknown');
                const ports = Array.isArray(ev.ports) ? ev.ports : [];
                const oldPorts = Array.isArray(ev.old_ports) ? ev.old_ports : [];
                switch (e.type) {
                    case 'dev_spawned':
                        return `[${t}] + ${command} (PID ${pid})${ports.length ? ` ports ${ports.join(',')}` : ''}`;
                    case 'dev_exited':
                        return `[${t}] - ${command} (PID ${pid})`;
                    case 'dev_port_changed':
                        return `[${t}] ~ ${command} (PID ${pid}) ports ${oldPorts.join(',') || '?'} → ${ports.join(',') || '?'}`;
                    default:
                        return `[${t}] ? ${e.type} (PID ${pid})`;
                }
            });
            return lines.join('\n');
        }
        default:
            return `Unknown dev subcommand: ${sub}
Usage: loom dev [start|stop|status|logs [hours]]`;
    }
}
//# sourceMappingURL=dev.js.map
export { runDev };
