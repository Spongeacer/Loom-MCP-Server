/**
 * Centralized LOOM constants.
 */

export const LOOM_VERSION = '0.5.0';
export const LOOM_DIR_NAME = '.loom';

// Default directories for file watching and scanning
export const DEFAULT_WATCH_DIRS = ['src', 'tests', 'packages'];
export const DEFAULT_FS_SCAN_DIRS = ['src', 'tests', 'packages'];
export const DEFAULT_CLI_WATCH_DIRS = ['src', 'lib', 'packages', 'tests', 'test'];

// MCP cache
export const MCP_CACHE_TTL_MS = 60_000;
export const MCP_CACHE_MAX_SIZE = 256;
export const MCP_MAX_OUTPUT_BYTES = 200_000;

// FS scan throttling
export const SCAN_COOLDOWN_MS = 5 * 60 * 1000; // 5 minutes
export const MIN_RESCAN_MS = 30_000;
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
export const WAL_ROTATE_SIZE_BYTES = 512 * 1024; // 512KB
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
export const SESSION_DEFAULT_HOURS_BACK = 6;
export const WAL_TAIL_CHUNK_SIZE = 4096;
export const WAL_FALLBACK_MAX_LINES = 1000;
export const WAL_READ_LIMIT = 50;

// Prompt builder
export const PROMPT_MAX_DECISIONS = 5;
export const PROMPT_MAX_DICTIONARY = 5;
export const PROMPT_MAX_SKILLS = 3;
export const PROMPT_MAX_RISKS = 3;
export const PROMPT_MAX_FS_HEALTH = 3;
export const PROMPT_MAX_DIAGNOSTICS = 5;
export const PROMPT_MAX_RECENT_FILES = 3;
export const PROMPT_MAX_HOT_ENTRIES = 7;
export const PROMPT_MAX_CHARS = 6000; // hard cap on total prompt length (~2000 tokens)
export const QUALITY_SCORE_RISK_THRESHOLD = 0.5;

// Sanitization limits
export const SANITIZE_ID_MAX_LEN = 256;
export const SANITIZE_STRING_MAX_LEN = 1024;
export const SANITIZE_STRING_ARRAY_ITEM_MAX_LEN = 512;
export const SANITIZE_INTEGER_MAX = 9999;

// ── Decay / Lifecycle (v0.5.0) ──

/** Half-life in days per entry type. Entry decays to 0.5 after this many days of no access. */
export const DECAY_HALF_LIFE_DAYS: Record<string, number> = {
  Rule: 180,
  Decision: 90,
  Memory: 30,
  Skill: 365,
  Pattern: 180,
  Task: 30,       // completed tasks decay fast
  Artifact: 90,   // follows file lifecycle
};

/** Decay score threshold below which an entry is eligible for archival. */
export const DECAY_ARCHIVE_THRESHOLD = 0.15;

/** Decay score floor — entries never decay below this unless manually pruned. */
export const DECAY_MIN_SCORE = 0.01;

/** Working set max sizes before auto-trim kicks in. */
export const WORKING_SET_MAX_PINNED = 20;
export const WORKING_SET_MAX_HOT = 30;

/** Active tasks are immune to decay. */
export const DECAY_IMMUNE_LIFECYCLE_STATES: string[] = ['draft', 'active'];
