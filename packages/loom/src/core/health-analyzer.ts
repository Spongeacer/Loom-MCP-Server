import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { ArtifactEntry, Binding, Entry } from '../types/index.js';

interface HealthReport {
  artifacts: ArtifactEntry[];
  byStatus: Record<ArtifactEntry['artifact']['health']['status'], ArtifactEntry[]>;
  trashCandidates: ArtifactEntry[];
}

const STALE_DAYS = 90;
const LEGACY_PATTERNS = /\b(old|backup|bak|copy|deprecated|obsolete|legacy|draft|tmp|temp|unused)\b|[_-](old|backup|bak|copy|deprecated|obsolete|legacy|draft|tmp|temp|unused)[._-]?\d*/i;

function computeContentHash(filePath: string): string {
  try {
    const data = fs.readFileSync(filePath);
    return crypto.createHash('sha256').update(data).digest('hex').slice(0, 16);
  } catch {
    return '';
  }
}

function analyzeArtifactHealth(
  artifact: ArtifactEntry,
  allArtifacts: ArtifactEntry[],
  allBindings: Binding[],
  allEntries: Entry[],
  projectRoot: string
): ArtifactEntry['artifact']['health'] {
  const reasons: string[] = [];
  let score = 1.0;
  let status: ArtifactEntry['artifact']['health']['status'] = 'healthy';
  let action: ArtifactEntry['artifact']['health']['suggested_action'] = 'keep';

  const fileName = path.basename(artifact.artifact.path);

  // 1. Missing
  if (!artifact.artifact.fs.exists) {
    status = 'missing';
    score = 0;
    reasons.push('File no longer exists on disk');
    action = 'delete';
    return { status, score, reasons, suggested_action: action };
  }

  // 2. Legacy naming
  if (LEGACY_PATTERNS.test(fileName)) {
    status = 'legacy';
    score -= 0.4;
    reasons.push(`Filename contains legacy/deprecated keyword: ${fileName}`);
    action = 'review';
  }

  // 3. Stale (not modified in a long time)
  const lastModified = new Date(artifact.artifact.fs.last_modified_at).getTime();
  const daysSinceModified = (Date.now() - lastModified) / (1000 * 60 * 60 * 24);
  if (daysSinceModified > STALE_DAYS) {
    if (status === 'healthy') status = 'stale';
    score -= 0.2;
    reasons.push(`Last modified ${Math.round(daysSinceModified)} days ago (> ${STALE_DAYS})`);
    if (action === 'keep') action = 'review';
  }

  // 4. Orphan (no bindings in or out, not referenced by any task/rule)
  const relatedBindings = allBindings.filter(
    (b) => b.source === artifact.id || b.target === artifact.id
  );
  const referencedByEntries = allEntries.filter(
    (e) =>
      e.id !== artifact.id &&
      (e.activation.paths.includes(artifact.artifact.path) ||
        e.activation.entry_refs.includes(artifact.id))
  );
  const INFRA_PATTERNS = [
    /^packages\/loom\/src\//,
    /^packages\/loom\/bin\//,
    /^packages\/loom-vscode\//,
  ];
  const isInfra = INFRA_PATTERNS.some((p) => p.test(artifact.artifact.path));
  if (relatedBindings.length === 0 && referencedByEntries.length === 0 && !isInfra) {
    if (status === 'healthy') status = 'orphan';
    score -= 0.3;
    reasons.push('No bindings and no entry references this file');
    if (action === 'keep') action = 'review';
  }

  // 5. Redundant (duplicate content)
  const hash = computeContentHash(path.join(projectRoot, artifact.artifact.path));
  artifact.artifact.content_hash = hash;
  const duplicates = allArtifacts.filter(
    (a) =>
      a.id !== artifact.id &&
      a.artifact.fs.exists &&
      a.artifact.content_hash === hash &&
      hash !== ''
  );
  if (duplicates.length > 0) {
    if (status === 'healthy') status = 'redundant';
    score -= 0.35;
    reasons.push(`Content identical to ${duplicates.map((d) => d.artifact.path).join(', ')}`);
    action = 'archive';
  }

  // Final score clamp
  score = Math.max(0, Math.min(1, score));

  // If multiple reasons but status still healthy, downgrade to review
  if (status === 'healthy' && reasons.length > 0) {
    action = 'keep';
  }

  return { status, score, reasons, suggested_action: action };
}

export function runHealthAnalysis(
  artifacts: ArtifactEntry[],
  bindings: Binding[],
  entries: Entry[],
  projectRoot: string
): HealthReport {
  for (const art of artifacts) {
    art.artifact.health = analyzeArtifactHealth(art, artifacts, bindings, entries, projectRoot);
  }

  const byStatus: Record<ArtifactEntry['artifact']['health']['status'], ArtifactEntry[]> = {
    healthy: [],
    stale: [],
    orphan: [],
    legacy: [],
    redundant: [],
    missing: [],
  };

  for (const art of artifacts) {
    byStatus[art.artifact.health.status].push(art);
  }

  const trashCandidates = artifacts.filter(
    (a) => a.artifact.health.suggested_action === 'delete' || a.artifact.health.suggested_action === 'archive'
  );

  return { artifacts, byStatus, trashCandidates };
}
