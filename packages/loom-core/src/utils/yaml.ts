import YAML from 'yaml';

/**
 * Parse YAML string safely. Returns fallback on parse error or non-object result.
 * Replaces the scattered `YAML.parse(raw) as T | null` pattern with null-guards.
 */
export function parseYaml<T>(raw: string, fallback: T): T {
  try {
    const parsed = YAML.parse(raw);
    if (parsed === null || parsed === undefined) return fallback;
    if (typeof parsed !== 'object' && typeof fallback === 'object') return fallback;
    return parsed as T;
  } catch {
    return fallback;
  }
}

/**
 * Stringify to YAML with consistent formatting.
 */
export function stringifyYaml(data: unknown): string {
  return YAML.stringify(data, {
    indent: 2,
    lineWidth: 0, // disable line wrapping
  });
}
