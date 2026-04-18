/**
 * LOOM Cloud Sync — Type Definitions
 *
 * These types extend the core LOOM Entry model with cloud-sync-specific
 * metadata.  All cloud-aware fields live in a single `sync` sub-object so
 * the core Entry schema never has to change.
 */

import type { Entry, EntryType } from '../../loom/dist/types/index.js';

// ───────────────────────────────────────────────────────────────────────────
// Device Identity
// ───────────────────────────────────────────────────────────────────────────

export interface DeviceIdentity {
  /** Stable device identifier (derived from Ed25519 public key fingerprint). */
  deviceId: string;
  /** Human-readable label (e.g. "MacBook-Pro-001"). */
  label: string;
  /** Ed25519 public key (base64, 32 bytes). */
  publicKey: string;
  /** ISO timestamp of first registration. */
  registeredAt: string;
}

/** Local on-disk representation of device keys. */
export interface DeviceKeyPair {
  deviceId: string;
  publicKey: string;
  /** Base64-encoded private key (stored in OS keychain in production). */
  privateKey: string;
  createdAt: string;
}

// ───────────────────────────────────────────────────────────────────────────
// Sync Index (stored in .loom/cache/sync-index.yml)
// ───────────────────────────────────────────────────────────────────────────

export interface SyncIndex {
  /** Monotonically-increasing version stamped by the cloud server. */
  cloudVersion: number;
  /** When the local device last successfully pulled from cloud. */
  lastPulledAt: string | null;
  /** When the local device last successfully pushed to cloud. */
  lastPushedAt: string | null;
  /** Per-entry sync state. */
  entries: Record<string, EntrySyncState>;
}

export interface EntrySyncState {
  /** Last known cloud version for this entry (null = not yet synced). */
  cloudVersion: number | null;
  /** When this entry was last pushed to cloud. */
  lastPushAt: string | null;
  /** When this entry was last pulled from cloud. */
  lastPullAt: string | null;
  /** true if local changes have not yet been pushed. */
  dirty: boolean;
  /** If the entry was forked due to an offline conflict, points to the fork. */
  forkedTo: string | null;
}

// ───────────────────────────────────────────────────────────────────────────
// Cloud Entry (wire format)
// ───────────────────────────────────────────────────────────────────────────

/** Metadata attached to every entry that travels through the cloud. */
export interface CloudMeta {
  /** Cloud-assigned version (separate from Entry.version). */
  cloudVersion: number;
  /** Which project(s) contributed to this user-level entry. */
  sourceProjects: string[];
  /** Which devices have seen this version. */
  seenByDevices: string[];
  /** How this entry was produced: 'direct' | 'llm-merged' | 'llm-extracted'. */
  provenance: CloudProvenance;
  /** If merged by LLM, the IDs of source entries. */
  mergedFrom?: string[];
}

export type CloudProvenance = 'direct' | 'llm-merged' | 'llm-extracted';

/** Wire-format wrapper: core Entry + cloud metadata. */
export interface CloudEntry {
  entry: Entry;
  cloud: CloudMeta;
}

// ───────────────────────────────────────────────────────────────────────────
// Push / Pull payloads
// ───────────────────────────────────────────────────────────────────────────

export interface PushPayload {
  deviceId: string;
  projectName: string;
  /** Project-level entries created or modified since last push. */
  entries: Entry[];
  /** Client-reported cloudVersion (optimistic concurrency check). */
  baseCloudVersion: number;
}

export interface PushResponse {
  /** Server-accepted cloud version after this push. */
  newCloudVersion: number;
  /** Entry IDs that were accepted. */
  accepted: string[];
  /** Entry IDs that were rejected (e.g. validation errors). */
  rejected: { id: string; reason: string }[];
}

export interface PullPayload {
  deviceId: string;
  /** Only pull entries whose cloudVersion > this. */
  sinceCloudVersion: number;
  /** Filter by namespace (usually 'user'). */
  namespace?: 'user' | 'team';
}

export interface PullResponse {
  /** Current cloud version. */
  cloudVersion: number;
  /** User-level (or team-level) entries produced by cloud merge pipeline. */
  entries: CloudEntry[];
  /** true if the cloud merge pipeline is still running (client should poll again). */
  pipelinePending: boolean;
}

// ───────────────────────────────────────────────────────────────────────────
// Auth / Registration
// ───────────────────────────────────────────────────────────────────────────

export interface RegisterDevicePayload {
  deviceId: string;
  publicKey: string;
  /** Signed challenge proving possession of private key. */
  signedChallenge: string;
}

export interface RegisterDeviceResponse {
  /** JWT or opaque token for subsequent requests. */
  accessToken: string;
  /** Unix timestamp (seconds) when token expires. */
  expiresAt: number;
}

export interface LicenseInfo {
  licenseKey: string;
  tier: 'free' | 'pro';
  /** Unix timestamp (seconds) when license expires, or null for lifetime. */
  expiresAt: number | null;
  features: {
    cloudSync: boolean;
    crossProjectMemory: boolean;
    teamSharing: boolean;
    llmMerge: boolean;
  };
}

// ───────────────────────────────────────────────────────────────────────────
// Conflict Resolution
// ───────────────────────────────────────────────────────────────────────────

export type ConflictStrategy = 'cloud-wins' | 'local-wins' | 'fork-local';

export interface ConflictResult {
  /** The entry that should be kept as the canonical version. */
  winner: Entry;
  /** If non-null, a forked local draft was created for manual resolution. */
  fork: Entry | null;
  /** Which strategy was applied. */
  strategy: ConflictStrategy;
  /** Human-readable explanation. */
  reason: string;
}

// ───────────────────────────────────────────────────────────────────────────
// Sync Engine Config
// ───────────────────────────────────────────────────────────────────────────

export interface SyncResult {
  pushed: number;
  pulled: number;
  conflicts: ConflictResult[];
  errors: string[];
}

export interface SyncConfig {
  /** Cloud API base URL. */
  apiBaseUrl: string;
  /** Polling interval for pull (milliseconds). Default: 60_000. */
  pullIntervalMs: number;
  /** How long to wait before declaring a push failed (ms). Default: 10_000. */
  pushTimeoutMs: number;
  /** true = enable background polling (daemon mode). */
  backgroundSync: boolean;
  /** Pro-tier LLM merge on cloud (always true server-side; client hints). */
  llmMergeEnabled: boolean;
}

export const DEFAULT_SYNC_CONFIG: SyncConfig = {
  apiBaseUrl: 'https://cloud.loom-mcp.dev',
  pullIntervalMs: 60_000,
  pushTimeoutMs: 10_000,
  backgroundSync: false,
  llmMergeEnabled: true,
};
