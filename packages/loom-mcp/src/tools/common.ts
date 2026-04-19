import type { ToolResult } from '@spongeacer/loom-core';

export function ok(text: string): ToolResult {
  return { content: [{ type: 'text', text }] };
}

export function err(text: string): ToolResult {
  return { content: [{ type: 'text', text }], isError: true };
}
