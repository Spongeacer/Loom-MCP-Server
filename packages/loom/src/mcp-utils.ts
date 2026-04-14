import { spawn } from 'node:child_process';
import * as path from 'node:path';

const cliPath = path.resolve(__dirname, '../dist/cli.js');
export const MAX_OUTPUT_BYTES = 200_000;

export function truncateText(text: string): string {
  const bytes = Buffer.byteLength(text, 'utf-8');
  if (bytes <= MAX_OUTPUT_BYTES) return text;
  let cutoff = MAX_OUTPUT_BYTES;
  while (cutoff > 0 && (text.charCodeAt(cutoff) & 0xc0) === 0x80) cutoff--;
  return text.slice(0, cutoff) + '\n\n[Output truncated: exceeded 200KB limit]';
}

export function runCliAsync(args: string[], timeout = 15000): Promise<string> {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [cliPath, ...args], {
      cwd: process.cwd(),
      shell: false,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';
    let timer: NodeJS.Timeout | null = null;
    let settled = false;

    const finalize = (code: number | null) => {
      if (settled) return;
      settled = true;
      if (timer) { clearTimeout(timer); timer = null; }
      if (code === 0) {
        resolve(stdout);
      } else {
        resolve(stderr || stdout || `Error: exited with code ${code}`);
      }
    };

    child.stdout.on('data', (data: Buffer) => { stdout += data.toString('utf-8'); });
    child.stderr.on('data', (data: Buffer) => { stderr += data.toString('utf-8'); });

    child.on('error', (err) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      resolve(`Error: ${err.message}`);
    });

    child.on('close', finalize);
    child.on('exit', finalize);

    timer = setTimeout(() => {
      child.kill('SIGTERM');
      setTimeout(() => {
        if (!settled) child.kill('SIGKILL');
      }, 2000);
      if (!settled) resolve('Error: command timed out after 15s');
    }, timeout);
  });
}

export function sanitizeId(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 256) return null;
  if (/[;&|`$(){}[\]\n\r]/.test(trimmed)) return null;
  return trimmed;
}

export function sanitizeString(value: unknown, maxLen = 1024): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > maxLen) return null;
  return trimmed;
}

export function sanitizeStringArray(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null;
  const out: string[] = [];
  for (const v of value) {
    const s = sanitizeString(v, 512);
    if (s) out.push(s);
  }
  return out;
}

export function sanitizeInteger(value: unknown, min = 1, max = 9999): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  const int = Math.floor(value);
  if (int < min || int > max) return null;
  return int;
}

export function mcpError(message: string) {
  return {
    content: [{ type: 'text' as const, text: message }],
    isError: true,
  };
}
