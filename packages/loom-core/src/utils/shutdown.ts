/**
 * Unified graceful shutdown handler.
 * Replaces the 4× copy-pasted shutdown logic in mcp.ts, watch-daemon-runner, etc.
 */

export type CleanupFn = () => void | Promise<void>;

const cleanupFns: { fn: CleanupFn; timeoutMs: number; label: string }[] = [];
let shuttingDown = false;

export function registerCleanup(fn: CleanupFn, timeoutMs = 5000, label = 'cleanup'): void {
  cleanupFns.push({ fn, timeoutMs, label });
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms)
    ),
  ]);
}

export async function gracefulShutdown(code = 0): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;

  console.error('[LOOM] Shutting down gracefully...');

  for (const { fn, timeoutMs, label } of cleanupFns) {
    try {
      await withTimeout(Promise.resolve(fn()), timeoutMs, label);
    } catch (err) {
      console.error(`[LOOM] Cleanup error (${label}):`, err);
    }
  }

  process.exit(code);
}

export function installSignalHandlers(): void {
  process.on('SIGINT', () => { void gracefulShutdown(0); });
  process.on('SIGTERM', () => { void gracefulShutdown(0); });
  process.on('SIGPIPE', () => {
    console.error(JSON.stringify({ t: new Date().toISOString(), level: 'warn', event: 'SIGPIPE', message: 'stdout pipe broken; shutting down gracefully' }));
    void gracefulShutdown(0);
  });
  process.on('uncaughtException', (err) => {
    console.error(JSON.stringify({ t: new Date().toISOString(), level: 'fatal', event: 'uncaughtException', error: String(err) }));
    void gracefulShutdown(1);
  });
  process.on('unhandledRejection', (reason) => {
    console.error(JSON.stringify({ t: new Date().toISOString(), level: 'fatal', event: 'unhandledRejection', error: String(reason) }));
    void gracefulShutdown(1);
  });
}
