import { describe, it } from 'node:test';
import assert from 'node:assert';
import { sanitizeId, sanitizeString, sanitizeInteger, truncateText } from '../mcp-utils.js';
import { withLock } from '../mcp-cache.js';

describe('mcp-utils', () => {
  it('sanitizeId rejects shell metacharacters', () => {
    assert.strictEqual(sanitizeId('foo;bar'), null);
    assert.strictEqual(sanitizeId('valid-id_123'), 'valid-id_123');
    assert.strictEqual(sanitizeId(''), null);
  });

  it('sanitizeString enforces length limit', () => {
    assert.strictEqual(sanitizeString('a'.repeat(1025)), null);
    assert.strictEqual(sanitizeString('hello'), 'hello');
  });

  it('sanitizeInteger enforces bounds', () => {
    assert.strictEqual(sanitizeInteger(0), null);
    assert.strictEqual(sanitizeInteger(10000), null);
    assert.strictEqual(sanitizeInteger(5), 5);
  });

  it('truncateText limits output size', () => {
    const huge = 'a'.repeat(300_000);
    const result = truncateText(huge);
    assert(result.includes('[Output truncated'));
  });
});

describe('mcp-cache', () => {
  it('withLock prevents concurrent execution', async () => {
    let counter = 0;
    const slowFn = async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
      counter++;
      return { content: [{ type: 'text' as const, text: 'ok' }] };
    };

    const p1 = withLock('test-key', slowFn, 'busy');
    const p2 = withLock('test-key', slowFn, 'busy');

    const [r1, r2] = await Promise.all([p1, p2]);
    assert.strictEqual(counter, 1);
    assert.strictEqual(r1.content[0].text, 'ok');
    assert.strictEqual(r2.content[0].text, 'busy');
  });
});
