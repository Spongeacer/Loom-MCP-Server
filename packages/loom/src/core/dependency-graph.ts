import * as fs from 'node:fs';
import * as path from 'node:path';
import type { ArtifactEntry, Binding } from '../types/index.js';

interface DependencyGraphResult {
  artifacts: ArtifactEntry[];
  bindings: Binding[];
}

const IMPORT_PATTERNS: { ext: RegExp; regex: RegExp }[] = [
  // JS / TS / JSX / TSX
  { ext: /\.(js|ts|jsx|tsx|mjs|cjs)$/, regex: /(?:import\s+.*?\s+from|require)\s*['"]([^'"]+)['"]|import\s*['"]([^'"]+)['"]/g },
  // Python
  { ext: /\.py$/, regex: /(?:^|\n)\s*(?:from\s+([\w.]+)\s+import|import\s+([\w.]+))/g },
  // Go / Rust / Java / Kotlin / C# / C / C++
  { ext: /\.(go|rs|java|kt|cs|c|cc|cpp|h|hpp)$/, regex: /(?:import\s+["']([^"']+)["']|use\s+([\w:]+)|mod\s+([\w:]+)|#include\s+["']([^"']+)["'])/g },
];

function extractImports(filePath: string): string[] {
  const ext = path.extname(filePath).toLowerCase();
  const matchedPattern = IMPORT_PATTERNS.find((p) => p.ext.test(ext));
  if (!matchedPattern) return [];

  let content: string;
  try {
    content = fs.readFileSync(filePath, 'utf-8');
  } catch (err) {
    console.error('[LOOM] Failed to read file for import extraction:', err);
    return [];
  }

  const imports = new Set<string>();
  const regex = new RegExp(matchedPattern.regex.source, matchedPattern.regex.flags);
  let m: RegExpExecArray | null;
  while ((m = regex.exec(content)) !== null) {
    for (let i = 1; i < m.length; i++) {
      if (m[i]) imports.add(m[i]);
    }
  }
  return Array.from(imports);
}

function resolveImportToRelativePath(
  importPath: string,
  sourceFile: string,
  projectRoot: string,
  allPaths: Set<string>
): string | null {
  const sourceDir = path.dirname(path.join(projectRoot, sourceFile));

  // Relative imports like ./foo or ../bar
  if (importPath.startsWith('.')) {
    const resolved = path.resolve(sourceDir, importPath);
    const candidates = generateCandidates(resolved);
    for (const c of candidates) {
      const rel = path.relative(projectRoot, c).replace(/\\/g, '/');
      if (allPaths.has(rel)) return rel;
    }
    return null;
  }

  // Bare module imports: try to find node_modules or local alias (minimal)
  // Heuristic: if import starts with package name, check if there's a local file with that suffix
  const parts = importPath.split('/');
  for (const p of allPaths) {
    if (p.endsWith(parts[parts.length - 1] + path.extname(sourceFile))) {
      // Very loose heuristic: last segment matches filename
      if (p.includes(parts[0])) return p;
    }
  }

  return null;
}

function generateCandidates(base: string): string[] {
  const exts = ['', '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.py', '.go', '.rs', '.java', '.kt', '.cs', '.c', '.cc', '.cpp', '.h', '.hpp'];
  const indexFiles = exts.map((e) => path.join(base, `index${e}`));
  return [base, ...exts.map((e) => `${base}${e}`), ...indexFiles];
}

function createBinding(sourceArt: ArtifactEntry, targetArt: ArtifactEntry, resolved: string, now: string): Binding {
  return {
    source: sourceArt.id,
    target: targetArt.id,
    relationship: 'depends_on',
    directionality: 'forward',
    status: 'active',
    confidence: 0.75,
    confidence_model: {
      base: 0.75,
      freshness_factor: 1.0,
      evidence_weight: 0.6,
      usage_boost: 1.0,
      drift_penalty: 0,
    },
    evidence: [
      {
        type: 'import_scan',
        detail: `${sourceArt.artifact.path} imports ${resolved}`,
        weight: 0.6,
        discovered: now,
      },
    ],
    decay: {
      half_life_days: 60,
      last_reconfirmed: now,
    },
    invalidation: {
      invalidated_by: null,
      reason: null,
    },
    verification_history: [],
  };
}

export function buildDependencyGraph(
  artifacts: ArtifactEntry[],
  projectRoot: string
): DependencyGraphResult {
  const allPaths = new Set(artifacts.map((a) => a.artifact.path));
  const now = new Date().toISOString();
  const bindings: Binding[] = [];

  // Reset deps
  for (const art of artifacts) {
    if (!art.artifact.deps) art.artifact.deps = { imports: [], imported_by: [] };
    art.artifact.deps.imports = [];
    art.artifact.deps.imported_by = [];
  }

  for (const art of artifacts) {
    if (!art.artifact.fs.exists) continue;
    const rawImports = extractImports(path.join(projectRoot, art.artifact.path));
    const resolvedImports: string[] = [];

    for (const imp of rawImports) {
      const resolved = resolveImportToRelativePath(imp, art.artifact.path, projectRoot, allPaths);
      if (resolved) {
        resolvedImports.push(resolved);
        const target = artifacts.find((a) => a.artifact.path === resolved);
        if (target) {
          target.artifact.deps.imported_by.push(art.artifact.path);
          art.artifact.deps.imports.push(resolved);
          bindings.push(createBinding(art, target, resolved, now));
        }
      }
    }
  }

  return { artifacts, bindings };
}

export function updateDependencyGraphIncremental(
  changedArtifacts: ArtifactEntry[],
  allArtifacts: ArtifactEntry[],
  projectRoot: string
): DependencyGraphResult & { removedBindingIds: string[] } {
  const allPaths = new Set(allArtifacts.map((a) => a.artifact.path));
  const now = new Date().toISOString();
  const bindings: Binding[] = [];
  const removedBindingIds: string[] = [];

  for (const art of changedArtifacts) {
    if (!art.artifact.deps) art.artifact.deps = { imports: [], imported_by: [] };

    const oldImports = new Set(art.artifact.deps.imports);
    const newImports = new Set<string>();

    if (art.artifact.fs.exists) {
      const rawImports = extractImports(path.join(projectRoot, art.artifact.path));
      for (const imp of rawImports) {
        const resolved = resolveImportToRelativePath(imp, art.artifact.path, projectRoot, allPaths);
        if (resolved) newImports.add(resolved);
      }
    }

    // Remove stale links
    for (const oldImp of oldImports) {
      if (!newImports.has(oldImp)) {
        const target = allArtifacts.find((a) => a.artifact.path === oldImp);
        if (target && target.artifact.deps) {
          target.artifact.deps.imported_by = target.artifact.deps.imported_by.filter(
            (p) => p !== art.artifact.path
          );
        }
        removedBindingIds.push(`${art.id}-${target?.id || 'unknown'}`);
      }
    }

    // Add new links
    art.artifact.deps.imports = [];
    for (const resolved of newImports) {
      const target = allArtifacts.find((a) => a.artifact.path === resolved);
      if (target) {
        if (!target.artifact.deps) target.artifact.deps = { imports: [], imported_by: [] };
        if (!target.artifact.deps.imported_by.includes(art.artifact.path)) {
          target.artifact.deps.imported_by.push(art.artifact.path);
        }
        art.artifact.deps.imports.push(resolved);
        bindings.push(createBinding(art, target, resolved, now));
      }
    }
  }

  return { artifacts: allArtifacts, bindings, removedBindingIds };
}
