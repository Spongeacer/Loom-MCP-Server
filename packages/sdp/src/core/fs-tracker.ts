import * as fs from 'node:fs';
import * as path from 'node:path';
import type { ArtifactEntry } from '../types/index.js';

export interface FsScanResult {
  seenPaths: Set<string>;
  missing: ArtifactEntry[];
}

export function scanProjectFiles(dirs: string[], projectRoot: string): string[] {
  const files: string[] = [];
  for (const dir of dirs) {
    const fullDir = path.resolve(projectRoot, dir);
    if (!fs.existsSync(fullDir)) continue;
    walkDir(fullDir, files, projectRoot);
  }
  return files;
}

function walkDir(dir: string, out: string[], projectRoot: string) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (shouldSkipDir(entry.name)) continue;
      walkDir(fullPath, out, projectRoot);
    } else if (entry.isFile()) {
      out.push(path.relative(projectRoot, fullPath).replace(/\\/g, '/'));
    }
  }
}

function shouldSkipDir(name: string): boolean {
  const skip = ['node_modules', 'dist', 'build', '.git', '.sdp', '.vscode', '.idea', 'coverage', '__pycache__'];
  return skip.includes(name) || name.startsWith('.');
}

export function getFsMeta(filePath: string): ArtifactEntry['artifact']['fs'] {
  try {
    const stat = fs.statSync(filePath);
    const now = new Date().toISOString();
    return {
      last_modified_at: stat.mtime.toISOString(),
      last_seen_at: now,
      size_bytes: stat.size,
      exists: true,
    };
  } catch {
    return {
      last_modified_at: new Date(0).toISOString(),
      last_seen_at: new Date().toISOString(),
      size_bytes: 0,
      exists: false,
    };
  }
}

export function updateArtifactsFs(
  artifacts: ArtifactEntry[],
  dirs: string[],
  projectRoot: string
): FsScanResult {
  const allFiles = scanProjectFiles(dirs, projectRoot);
  const seenPaths = new Set(allFiles);
  const now = new Date().toISOString();

  for (const art of artifacts) {
    const fullPath = path.join(projectRoot, art.artifact.path);
    if (seenPaths.has(art.artifact.path)) {
      try {
        const stat = fs.statSync(fullPath);
        art.artifact.fs = {
          last_modified_at: stat.mtime.toISOString(),
          last_seen_at: now,
          size_bytes: stat.size,
          exists: true,
        };
      } catch {
        art.artifact.fs.exists = false;
        art.artifact.fs.last_seen_at = now;
      }
    } else {
      art.artifact.fs.exists = false;
      art.artifact.fs.last_seen_at = now;
    }
  }

  const missing = artifacts.filter((a) => !a.artifact.fs.exists);
  return { seenPaths, missing };
}

export function getRecentlyModifiedArtifacts(
  artifacts: ArtifactEntry[],
  limit = 10
): ArtifactEntry[] {
  return [...artifacts]
    .filter((a) => a.artifact.fs.exists)
    .sort((a, b) => {
      return new Date(b.artifact.fs.last_modified_at).getTime() - new Date(a.artifact.fs.last_modified_at).getTime();
    })
    .slice(0, limit);
}
