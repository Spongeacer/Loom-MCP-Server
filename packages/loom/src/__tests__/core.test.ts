import { describe, it } from 'node:test';
import assert from 'node:assert';
import { sanitizeId, sanitizeString, sanitizeInteger, truncateText } from '../mcp-utils.js';
import { withLock, withCache } from '../mcp-cache.js';

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

  it('withCache deduplicates concurrent misses', async () => {
    let counter = 0;
    const slowFn = async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
      counter++;
      return { content: [{ type: 'text' as const, text: 'computed' }] };
    };

    const p1 = withCache('dedup-key', 1000, slowFn);
    const p2 = withCache('dedup-key', 1000, slowFn);
    const p3 = withCache('dedup-key', 1000, slowFn);

    const [r1, r2, r3] = await Promise.all([p1, p2, p3]);
    assert.strictEqual(counter, 1);
    assert.strictEqual(r1.content[0].text, 'computed');
    assert.strictEqual(r2.content[0].text, 'computed');
    assert.strictEqual(r3.content[0].text, 'computed');
  });

  it('withCache returns cached value without calling fn again', async () => {
    let counter = 0;
    const fn = async () => {
      counter++;
      return { content: [{ type: 'text' as const, text: 'v1' }] };
    };

    const r1 = await withCache('cache-hit-key', 1000, fn);
    assert.strictEqual(r1.content[0].text, 'v1');
    assert.strictEqual(counter, 1);

    const r2 = await withCache('cache-hit-key', 1000, fn);
    assert.strictEqual(r2.content[0].text, 'v1');
    assert.strictEqual(counter, 1);
  });
});
