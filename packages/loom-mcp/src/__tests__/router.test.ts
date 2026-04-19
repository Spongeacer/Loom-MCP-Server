import { describe, it } from 'node:test';
import assert from 'node:assert';
import { dispatch, getVisibleTools, registerTool } from '../router.js';
import type { ToolResult } from '@spongeacer/loom-core';

describe('router', () => {
  it('getVisibleTools returns a non-empty list of tools', () => {
    const tools = getVisibleTools();
    assert.ok(tools.length > 0, 'Expected at least one tool');
    for (const t of tools) {
      assert.ok(t.name, 'Tool must have a name');
      assert.ok(t.description, 'Tool must have a description');
      assert.ok(t.inputSchema, 'Tool must have an inputSchema');
      assert.strictEqual(typeof t.handler, 'function', 'Tool must have a handler');
    }
  });

  it('dispatch returns an error for an unknown tool', async () => {
    const result = await dispatch('loom_nonexistent_tool', {});
    assert.strictEqual(result.isError, true);
    assert.ok(result.content[0].text.includes('Unknown tool'));
  });

  it('registerTool adds a new tool and dispatch can invoke it', async () => {
    const customToolName = 'loom_test_echo';
    registerTool({
      name: customToolName,
      description: 'Echo test tool',
      inputSchema: { type: 'object', properties: { msg: { type: 'string' } } },
      handler: async (args): Promise<ToolResult> => {
        return { content: [{ type: 'text', text: String(args.msg ?? 'empty') }] };
      },
    });

    const tools = getVisibleTools();
    assert.ok(tools.some((t) => t.name === customToolName), 'Registered tool should be visible');

    const result = await dispatch(customToolName, { msg: 'hello' });
    assert.strictEqual(result.isError, undefined);
    assert.strictEqual(result.content[0].text, 'hello');
  });
});
