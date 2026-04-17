import * as path from 'node:path';
import * as fs from 'node:fs';

/**
 * Centralized LOOM constants to reduce hardcoding across the codebase.
 */

export const LOOM_DIR_NAME = '.loom';

// Default directories for file watching and scanning
export const DEFAULT_WATCH_DIRS = ['src', 'tests', 'packages'];
export const DEFAULT_FS_SCAN_DIRS = ['src', 'tests', 'packages'];
export const DEFAULT_CLI_WATCH_DIRS = ['src', 'lib', 'packages', 'tests', 'test'];

// MCP cache
export const MCP_CACHE_TTL_MS = 5000;
export const MCP_CACHE_MAX_SIZE = 256;
export const MCP_MAX_OUTPUT_BYTES = 200_000;

// FS scan throttling
export const SCAN_COOLDOWN_MS = 5 * 60 * 1000; // 5 minutes
export const MIN_RESCAN_MS = 30_000; // status command auto-scan throttle
export const INCREMENTAL_DIRTY_LIMIT = 30;
export const FS_SCAN_WORKER_TIMEOUT_MS = 15_000;
export const CLI_FS_SCAN_TIMEOUT_MS = 30_000;

// Health analysis
export const HEALTH_STALE_DAYS = 90;

// Watch daemon
export const WATCH_DAEMON_MEMORY_LIMIT_MB = 300;
export const WATCH_DAEMON_EVENT_BURST_LIMIT = 500;
export const WATCH_DAEMON_HEARTBEAT_MS = 30_000;
export const WATCH_DAEMON_FLUSH_MS = 800;

// WAL queue
export const WAL_ROTATE_SIZE_BYTES = 10 * 1024 * 1024; // 10MB
export const WAL_QUEUE_MAX_SIZE = 10000;

// Locking
export const FILE_LOCK_TIMEOUT_MS = 5000;
export const WATCH_DAEMON_LOCK_TIMEOUT_MS = 5000;
export const FS_CLEAN_LOCK_TIMEOUT_MS = 30000;

// LLM defaults
export const LLM_DEFAULT_MAX_TOKENS = 1024;
export const LLM_DEFAULT_TEMPERATURE = 0.5;
export const LLM_TIMEOUT_MS = 30_000;

// Session recall
export const SESSION_DEFAULT_HOURS_BACK = 24;
export const WAL_TAIL_CHUNK_SIZE = 4096;
export const WAL_FALLBACK_MAX_LINES = 1000;
export const WAL_READ_LIMIT = 50;

// Prompt builder
export const PROMPT_MAX_DECISIONS = 10;
export const PROMPT_MAX_DICTIONARY = 11;
export const PROMPT_MAX_SKILLS = 3;
export const PROMPT_MAX_RISKS = 5;
export const PROMPT_MAX_FS_HEALTH = 5;
export const PROMPT_MAX_DIAGNOSTICS = 5;
export const PROMPT_MAX_RECENT_FILES = 5;

// Sanitization limits
export const SANITIZE_ID_MAX_LEN = 256;
export const SANITIZE_STRING_MAX_LEN = 1024;
export const SANITIZE_STRING_ARRAY_ITEM_MAX_LEN = 512;
export const SANITIZE_INTEGER_MAX = 9999;

let _loomPackageRoot: string | null = null;

/**
 * Resolve the root directory of the installed loom-mcp package.
 * This works for both monorepo development and global npm installs.
 */
export function getLoomPackageRoot(): string | null {
  if (_loomPackageRoot !== null) return _loomPackageRoot;
  let current = __dirname;
  while (current !== path.dirname(current)) {
    const pkgPath = path.join(current, 'package.json');
    if (fs.existsSync(pkgPath)) {
      try {
        const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8')) as { name?: string };
        if (pkg.name === 'loom-mcp') {
          _loomPackageRoot = current;
          return current;
        }
      } catch {
        // ignore malformed package.json
      }
    }
    current = path.dirname(current);
  }
  _loomPackageRoot = null;
  return null;
}
