import {
  MCP_MAX_OUTPUT_BYTES,
  SANITIZE_ID_MAX_LEN,
  SANITIZE_STRING_MAX_LEN,
  SANITIZE_STRING_ARRAY_ITEM_MAX_LEN,
  SANITIZE_INTEGER_MAX,
} from './core/constants.js';

export function truncateText(text: string): string {
  const buf = Buffer.from(text, 'utf-8');
  if (buf.length <= MCP_MAX_OUTPUT_BYTES) return text;
  let cutoff = MCP_MAX_OUTPUT_BYTES;
  // Walk back to avoid cutting in the middle of a multi-byte UTF-8 sequence
  while (cutoff > 0 && (buf[cutoff] & 0xc0) === 0x80) cutoff--;
  return buf.toString('utf-8', 0, cutoff) + '\n\n[Output truncated: exceeded 200KB limit]';
}

export function sanitizeId(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > SANITIZE_ID_MAX_LEN) return null;
  if (/[;&|`$(){}[\]\n\r]/.test(trimmed)) return null;
  return trimmed;
}

export function sanitizeString(value: unknown, maxLen = SANITIZE_STRING_MAX_LEN): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > maxLen) return null;
  return trimmed;
}

export function sanitizeStringArray(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null;
  const out: string[] = [];
  for (const v of value) {
    const s = sanitizeString(v, SANITIZE_STRING_ARRAY_ITEM_MAX_LEN);
    if (s) out.push(s);
  }
  return out;
}

export function sanitizeInteger(value: unknown, min = 1, max = SANITIZE_INTEGER_MAX): number | null {
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
