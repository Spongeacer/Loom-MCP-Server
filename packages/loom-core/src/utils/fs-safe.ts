import * as fs from 'node:fs';
import * as path from 'node:path';

/**
 * Safely remove a file. Ignores ENOENT (file does not exist).
 * This replaces the ~20× copy-pasted `try { fs.unlinkSync(...) } catch {}` pattern.
 */
export function safeUnlink(filePath: string): void {
  try {
    fs.unlinkSync(filePath);
  } catch (err: any) {
    if (err.code !== 'ENOENT') {
      throw err;
    }
  }
}

export async function safeUnlinkAsync(filePath: string): Promise<void> {
  try {
    await fs.promises.unlink(filePath);
  } catch (err: any) {
    if (err.code !== 'ENOENT') {
      throw err;
    }
  }
}

/**
 * Create a directory recursively if it doesn't exist.
 */
export function safeMkdir(dir: string): void {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

/**
 * Write a file atomically using temp + rename.
 */
export function atomicWriteFile(filePath: string, content: string): void {
  const dir = path.dirname(filePath);
  const tempPath = path.join(
    dir,
    `.tmp-${path.basename(filePath)}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
  );
  try {
    fs.writeFileSync(tempPath, content, 'utf-8');
    fs.renameSync(tempPath, filePath);
  } catch (err) {
    safeUnlink(tempPath);
    throw err;
  }
}

/**
 * Read a file as UTF-8 text. Returns null if file does not exist.
 */
export function readTextFile(filePath: string): string | null {
  try {
    return fs.readFileSync(filePath, 'utf-8');
  } catch (err: any) {
    if (err.code === 'ENOENT') return null;
    throw err;
  }
}

/**
 * Check if a path exists.
 */
export function pathExists(filePath: string): boolean {
  return fs.existsSync(filePath);
}

/**
 * Read a directory. Returns empty array if directory does not exist.
 */
export function safeReaddir(dir: string): string[] {
  try {
    return fs.readdirSync(dir);
  } catch (err: any) {
    if (err.code === 'ENOENT') return [];
    throw err;
  }
}
