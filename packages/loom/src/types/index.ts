export type EntryType = 'Rule' | 'Memory' | 'Skill' | 'Pattern' | 'Artifact' | 'Task' | 'Decision';

export type LifecycleState = 'draft' | 'active' | 'verified' | 'stale' | 'deprecated' | 'archived' | 'tombstone';

export type TrustLevel = 'trusted' | 'verified' | 'derived' | 'inferred' | 'untrusted';

export type TrustSource = 'human' | 'tool' | 'model' | 'import' | 'pattern' | 'external';

export interface Content {
  l1_5: string;
  l2: string;
  l3: string | { file: string };
}

export interface Lifecycle {
  state: LifecycleState;
  created: string;
  updated: string;
  last_accessed: string;
  last_activated: string;
  activation_count: number;
  verification_count: number;
  promoted_from: string | null;
  demotion_reason: string | null;
}

export interface Quality {
  freshness: number;
  trust: number;
  activity: number;
  composite_score: number;
}

export interface Trust {
  level: TrustLevel;
  source: TrustSource;
}

export interface Activation {
  paths: string[];
  keywords: string[];
  intents: string[];
  tools: string[];
  entry_refs: string[];
}

export interface ConflictInfo {
  supersedes: string[];
  conflicts_with: string[];
  overridden_by: string | null;
  precedence: number;
  resolution_policy: 'newest_wins' | 'verified_wins' | 'manual_wins' | 'scoped_wins';
}

export interface BindingRef {
  target?: string;
  source?: string;
  rel: string;
  conf: number;
}

export interface ArtifactFsMeta {
  last_modified_at: string;
  last_seen_at: string;
  size_bytes: number;
  exists: boolean;
}

export interface ArtifactDeps {
  imports: string[];
  imported_by: string[];
}

export type ArtifactHealthStatus = 'healthy' | 'stale' | 'orphan' | 'legacy' | 'redundant' | 'missing';

export interface ArtifactHealth {
  status: ArtifactHealthStatus;
  score: number;
  reasons: string[];
  suggested_action: 'keep' | 'archive' | 'delete' | 'review';
}

export interface ArtifactDetails {
  path: string;
  category: 'source_code' | 'config' | 'schema' | 'migration' | 'infra' | 'docs';
  file_type: string;
  granularity: 'file' | 'symbol' | 'span' | 'heading' | 'config_key';
  symbol: string | null;
  span: { start_line: number | null; end_line: number | null };
  line_count: number;
  git_tracked: boolean;
  last_git_commit: string | null;
  last_modifier: 'agent' | 'user' | 'both';
  content_hash: string;
  summary_hash: string;
  fs: ArtifactFsMeta;
  deps: ArtifactDeps;
  health: ArtifactHealth;
}

export interface TaskDetails {
  title: string;
  status: 'open' | 'active' | 'blocked' | 'done' | 'abandoned';
  intent: 'bugfix' | 'feature' | 'refactor' | 'analysis' | 'docs' | 'ops';
  priority: 'low' | 'medium' | 'high' | 'critical';
  working_set: string[];
  related_entries: string[];
  acceptance_criteria: string[];
  unresolved_questions: string[];
  progress: {
    completed: string[];
    current: string | null;
    next: string | null;
    blocked_by: string | null;
  };
  started_in: string;
  last_touched: string;
}

export interface DecisionDetails {
  question: string;
  chosen: string;
  rationale: string;
  rejected: { option: string; reason: string }[];
  assumptions: string[];
  impact_scope: string[];
  supersedes: string | null;
  made_in: string;
}

export interface BaseEntry {
  id: string;
  type: EntryType;
  version: number;
  namespace: 'project' | 'user' | 'auto' | 'team' | 'local';
  content: Content;
  lifecycle: Lifecycle;
  quality: Quality;
  trust: Trust;
  activation: Activation;
  conflicts: ConflictInfo;
  bindings_out: BindingRef[];
  bindings_in: BindingRef[];
}

export type ArtifactEntry = BaseEntry & { type: 'Artifact'; artifact: ArtifactDetails };
export type TaskEntry = BaseEntry & { type: 'Task'; task: TaskDetails };
export type DecisionEntry = BaseEntry & { type: 'Decision'; decision: DecisionDetails };
export type RuleEntry = BaseEntry & { type: 'Rule' };
export type MemoryEntry = BaseEntry & { type: 'Memory' };
export type SkillEntry = BaseEntry & { type: 'Skill' };
export type PatternEntry = BaseEntry & { type: 'Pattern' };

export type Entry = ArtifactEntry | TaskEntry | DecisionEntry | RuleEntry | MemoryEntry | SkillEntry | PatternEntry;

export interface Binding {
  source: string;
  target: string;
  relationship: 'governs' | 'realized_in' | 'depends_on' | 'exemplifies' | 'co_evolves' | 'impacts' | 'blocked_by';
  directionality: 'forward' | 'bidirectional' | 'inferred_reverse';
  status: 'active' | 'weak' | 'broken' | 'superseded';
  confidence: number;
  confidence_model: {
    base: number;
    freshness_factor: number;
    evidence_weight: number;
    usage_boost: number;
    drift_penalty: number;
  };
  evidence: {
    type: string;
    detail: string;
    weight: number;
    discovered: string;
  }[];
  decay: {
    half_life_days: number;
    last_reconfirmed: string;
  };
  invalidation: {
    invalidated_by: string | null;
    reason: string | null;
  };
  verification_history: {
    date: string;
    method: string;
    result: 'passed' | 'weakened' | 'failed' | 'inconclusive';
  }[];
}

export interface WorkingSet {
  active_task: string | null;
  pinned_entries: string[];
  hot_entries: string[];
  recently_expanded: string[];
  blocked_entries: string[];
}

export interface LoomConfig {
  version: string;
  project_name: string;
  initialized_at: string;
  default_namespace: 'project' | 'user' | 'auto' | 'team' | 'local';
}
