const MAX_OUTPUT_BYTES = 200_000;

export function truncateText(text: string): string {
  const buf = Buffer.from(text, 'utf-8');
  if (buf.length <= MAX_OUTPUT_BYTES) return text;
  let cutoff = MAX_OUTPUT_BYTES;
  // Walk back to avoid cutting in the middle of a multi-byte UTF-8 sequence
  while (cutoff > 0 && (buf[cutoff] & 0xc0) === 0x80) cutoff--;
  return buf.toString('utf-8', 0, cutoff) + '\n\n[Output truncated: exceeded 200KB limit]';
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

function createMockWrite(collector: { output: string }) {
  return function(chunk: any, encoding?: any, callback?: any): boolean {
    let str: string;
    if (typeof chunk === 'string') {
      str = chunk;
    } else if (Buffer.isBuffer(chunk)) {
      str = chunk.toString(typeof encoding === 'string' ? (encoding as BufferEncoding) : 'utf-8');
    } else {
      str = String(chunk);
    }
    collector.output += str;
    if (typeof callback === 'function') {
      process.nextTick(callback);
    }
    return true;
  } as any;
}

export function captureStdout(fn: () => void): string {
  const originalOut = process.stdout.write.bind(process.stdout);
  const originalErr = process.stderr.write.bind(process.stderr);
  const collector = { output: '' };
  const mockWrite = createMockWrite(collector);
  process.stdout.write = mockWrite;
  process.stderr.write = mockWrite;
  try {
    fn();
  } finally {
    process.stdout.write = originalOut;
    process.stderr.write = originalErr;
  }
  return truncateText(collector.output);
}

export async function captureStdoutAsync(fn: () => Promise<void>): Promise<string> {
  const originalOut = process.stdout.write.bind(process.stdout);
  const originalErr = process.stderr.write.bind(process.stderr);
  const collector = { output: '' };
  const mockWrite = createMockWrite(collector);
  process.stdout.write = mockWrite;
  process.stderr.write = mockWrite;
  try {
    await fn();
  } finally {
    process.stdout.write = originalOut;
    process.stderr.write = originalErr;
  }
  return truncateText(collector.output);
}
