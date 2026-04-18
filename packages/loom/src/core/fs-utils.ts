import * as fs from 'node:fs';

/**
 * Ensure a directory exists, creating it recursively if necessary.
 */
export function ensureDir(p: string): void {
  if (!fs.existsSync(p)) {
    fs.mkdirSync(p, { recursive: true });
  }
}
