import * as path from 'node:path';
import * as fs from 'node:fs';
import type { Entry, ArtifactEntry, Binding } from '../types/index.js';

interface DiscoveryResult {
  entries: ArtifactEntry[];
  bindings: Binding[];
}

function getFsMeta(filePath: string): ArtifactEntry['artifact']['fs'] {
  try {
    const stat = fs.statSync(filePath);
    const now = new Date().toISOString();
    return {
      last_modified_at: stat.mtime.toISOString(),
      last_seen_at: now,
      size_bytes: stat.size,
      exists: true,
    };
  } catch (_err) {
    console.error('[LOOM] Failed to read fs meta during artifact discovery:', _err);
    return {
      last_modified_at: new Date(0).toISOString(),
      last_seen_at: new Date().toISOString(),
      size_bytes: 0,
      exists: false,
    };
  }
}

function defaultDeps(): ArtifactEntry['artifact']['deps'] {
  return { imports: [], imported_by: [] };
}

function defaultHealth(): ArtifactEntry['artifact']['health'] {
  return {
    status: 'healthy',
    score: 1.0,
    reasons: [],
    suggested_action: 'keep',
  };
}

export function discoverArtifacts(changedFiles: string[], existingEntries: Entry[], projectRoot: string): DiscoveryResult {
  const artifacts: ArtifactEntry[] = [];
  const bindings: Binding[] = [];
  const now = new Date().toISOString();

  // Index existing entries by id to avoid mutating inputs
  const entryCopies = new Map<string, Entry>();
  for (const e of existingEntries) {
    entryCopies.set(e.id, { ...e, bindings_in: [...e.bindings_in], bindings_out: [...e.bindings_out] });
  }

  for (const file of changedFiles) {
    const relativePath = path.relative(projectRoot, file).replace(/\\/g, '/');
    const existing = existingEntries.find((e) => e.type === 'Artifact' && (e as ArtifactEntry).artifact.path === relativePath) as ArtifactEntry | undefined;

    if (existing) {
      const copy: ArtifactEntry = {
        ...existing,
        lifecycle: { ...existing.lifecycle, updated: now },
        quality: { ...existing.quality, freshness: 1.0 },
        artifact: { ...existing.artifact, fs: getFsMeta(file) },
        bindings_in: [...existing.bindings_in],
        bindings_out: [...existing.bindings_out],
      };
      artifacts.push(copy);
      entryCopies.set(existing.id, copy);
    } else {
      const ext = path.extname(relativePath).replace('.', '');
      const id = `art-${relativePath.replace(/[^a-zA-Z0-9]+/g, '-')}`;
      const category = guessCategory(relativePath);
      const artifact: ArtifactEntry = {
        id,
        type: 'Artifact',
        version: 1,
        namespace: 'auto',
        content: {
          l1_5: `${path.basename(relativePath)}`,
          l2: `${relativePath}`,
          l3: { file: relativePath },
        },
        lifecycle: {
          state: 'active',
          created: now,
          updated: now,
          last_accessed: now,
          last_activated: now,
          activation_count: 1,
          verification_count: 0,
          promoted_from: null,
          demotion_reason: null,
        },
        quality: {
          freshness: 1.0,
          trust: 0.6,
          activity: 0.5,
          composite_score: 0.7,
        },
        trust: {
          level: 'derived',
          source: 'tool',
        },
        activation: {
          paths: [relativePath],
          keywords: pathKeywords(relativePath),
          intents: [],
          tools: [],
          entry_refs: [],
        },
        conflicts: {
          supersedes: [],
          conflicts_with: [],
          overridden_by: null,
          precedence: 0,
          resolution_policy: 'newest_wins',
        },
        bindings_out: [],
        bindings_in: [],
        artifact: {
          path: relativePath,
          category,
          file_type: ext,
          granularity: 'file',
          symbol: null,
          span: { start_line: null, end_line: null },
          line_count: 0,
          last_modifier: 'agent',
          content_hash: '',
          summary_hash: '',
          fs: getFsMeta(file),
          deps: defaultDeps(),
          health: defaultHealth(),
        },
      };
      artifacts.push(artifact);
    }
  }

  // Level 0 binding: match artifact paths against non-artifact entry activation.paths
  const nonArtifacts = Array.from(entryCopies.values()).filter((e) => e.type !== 'Artifact');
  for (const art of artifacts) {
    for (const entry of nonArtifacts) {
      if (entry.activation.paths.some((p) => matchPath(art.artifact.path, p))) {
        const binding: Binding = {
          source: entry.id,
          target: art.id,
          relationship: 'governs',
          directionality: 'forward',
          status: 'active',
          confidence: 0.6,
          confidence_model: {
            base: 0.6,
            freshness_factor: 1.0,
            evidence_weight: 0.5,
            usage_boost: 1.0,
            drift_penalty: 0,
          },
          evidence: [
            {
              type: 'path_match',
              detail: `path ${art.artifact.path} matches ${entry.activation.paths.join(', ')}`,
              weight: 0.5,
              discovered: now,
            },
          ],
          decay: {
            half_life_days: 30,
            last_reconfirmed: now,
          },
          invalidation: {
            invalidated_by: null,
            reason: null,
          },
          verification_history: [],
        };
        bindings.push(binding);
        art.bindings_in.push({ source: entry.id, rel: 'governs', conf: 0.6 });
        entry.bindings_out.push({ target: art.id, rel: 'governs', conf: 0.6 });
      }
    }
  }

  return { entries: artifacts, bindings };
}

function guessCategory(filePath: string): ArtifactEntry['artifact']['category'] {
  const lower = filePath.toLowerCase();
  if (lower.includes('test')) return 'source_code';
  if (lower.includes('config') || lower.endsWith('.json') || lower.endsWith('.yaml') || lower.endsWith('.yml') || lower.endsWith('.toml')) return 'config';
  if (lower.includes('migration') || lower.includes('migrate')) return 'migration';
  if (lower.includes('infra') || lower.includes('docker') || lower.includes('k8s')) return 'infra';
  if (lower.endsWith('.md') || lower.endsWith('.mdx')) return 'docs';
  return 'source_code';
}

function pathKeywords(filePath: string): string[] {
  const parts = filePath.split(/[/._-]/).filter((p) => p.length > 2);
  return [...new Set(parts)];
}

function matchPath(filePath: string, pattern: string): boolean {
  // Simple glob-like matching: ** matches anything (including slashes),
  // * matches a single path segment (no slashes).
  const parts = pattern.split('**');
  const regexParts = parts.map((segment) =>
    segment
      .split('*')
      .map((s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
      .join('[^/]*')
  );
  let regexSource = regexParts.join('.*');

  // Make surrounding slashes optional so that a/**/b matches a/b,
  // and **/x matches x as well as dir/x.
  regexSource = regexSource
    .replace(/\\\/\\\.\*\\\//g, '(?:/.*/|/)?')
    .replace(/^\\\.\*\\\//, '(?:.*/)?')
    .replace(/\\\/\\\.\*$/, '(?:/.*)?');

  const regex = new RegExp('^' + regexSource + '$');
  return regex.test(filePath);
}
