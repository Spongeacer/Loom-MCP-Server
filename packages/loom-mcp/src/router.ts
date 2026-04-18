import type { ToolResult } from '@loom/core';
import { loomTools } from './tools/loom-tools.js';

interface ToolDef {
  name: string;
  description: string;
  inputSchema: object;
  handler: (args: Record<string, unknown>) => Promise<ToolResult>;
}

const tools: ToolDef[] = [...loomTools];

export function registerTool(def: ToolDef): void {
  tools.push(def);
}

export function getVisibleTools(): ToolDef[] {
  return tools;
}

export async function dispatch(name: string, args: Record<string, unknown>): Promise<ToolResult> {
  const tool = tools.find((t) => t.name === name);
  if (!tool) {
    return { content: [{ type: 'text', text: `Unknown tool: ${name}` }], isError: true };
  }
  return tool.handler(args);
}
