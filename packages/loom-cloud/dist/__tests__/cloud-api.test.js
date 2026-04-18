import { describe, it } from 'node:test';
import assert from 'node:assert';
import { CloudApiError, createCloudApiClient, createMemoryTokenManager, } from '../cloud-api.js';
describe('cloud-api', () => {
    it('throws CloudApiError on timeout', async () => {
        const tokenManager = createMemoryTokenManager();
        tokenManager.setToken('test-token', Date.now() / 1000 + 3600);
        const mockFetch = async (_url, init) => {
            return new Promise((_, reject) => {
                const signal = init?.signal;
                if (signal) {
                    signal.addEventListener('abort', () => {
                        const err = new Error('AbortError');
                        err.name = 'AbortError';
                        reject(err);
                    });
                }
                // otherwise hangs until test timeout
            });
        };
        const client = createCloudApiClient({
            apiBaseUrl: 'https://test.loom',
            tokenManager,
            fetchImpl: mockFetch,
            timeoutMs: 50,
        });
        try {
            await client.push({ deviceId: 'd1', projectName: 'p1', entries: [], baseCloudVersion: 0 });
            assert.fail('Expected timeout');
        }
        catch (err) {
            assert.ok(err instanceof CloudApiError);
            assert.ok(err.message.includes('timed out'));
            assert.strictEqual(err.status, 408);
        }
    });
    it('throws CloudApiError on HTTP error', async () => {
        const tokenManager = createMemoryTokenManager();
        tokenManager.setToken('test-token', Date.now() / 1000 + 3600);
        const mockFetch = async () => {
            return new Response('Internal Server Error', { status: 500, statusText: 'Internal Server Error' });
        };
        const client = createCloudApiClient({
            apiBaseUrl: 'https://test.loom',
            tokenManager,
            fetchImpl: mockFetch,
        });
        try {
            await client.pull({ deviceId: 'd1', sinceCloudVersion: 0 });
            assert.fail('Expected HTTP error');
        }
        catch (err) {
            assert.ok(err instanceof CloudApiError);
            assert.strictEqual(err.status, 500);
        }
    });
    it('throws NO_TOKEN when token is missing', async () => {
        const client = createCloudApiClient({
            apiBaseUrl: 'https://test.loom',
            tokenManager: createMemoryTokenManager(),
        });
        try {
            await client.push({ deviceId: 'd1', projectName: 'p1', entries: [], baseCloudVersion: 0 });
            assert.fail('Expected auth error');
        }
        catch (err) {
            assert.ok(err instanceof CloudApiError);
            assert.ok(err.message.includes('No access token'));
            assert.strictEqual(err.code, 'NO_TOKEN');
        }
    });
    it('returns null for invalid license', async () => {
        const mockFetch = async () => {
            return new Response('Unauthorized', { status: 401 });
        };
        const client = createCloudApiClient({
            apiBaseUrl: 'https://test.loom',
            tokenManager: createMemoryTokenManager(),
            fetchImpl: mockFetch,
        });
        const result = await client.validateLicense('bad-key');
        assert.strictEqual(result, null);
    });
    it('successfully registers a device', async () => {
        const mockFetch = async (_url, init) => {
            const body = init?.body ? JSON.parse(String(init.body)) : {};
            return new Response(JSON.stringify({ accessToken: `tok_${body.deviceId}`, expiresAt: Date.now() / 1000 + 3600 }), { status: 200, headers: { 'Content-Type': 'application/json' } });
        };
        const client = createCloudApiClient({
            apiBaseUrl: 'https://test.loom',
            tokenManager: createMemoryTokenManager(),
            fetchImpl: mockFetch,
        });
        const result = await client.registerDevice({
            deviceId: 'dev-001',
            publicKey: 'pubkey-123',
            signedChallenge: 'sig-abc',
        });
        assert.ok(result.accessToken.startsWith('tok_dev-001'));
        assert.ok(result.expiresAt > Date.now() / 1000);
    });
});
//# sourceMappingURL=cloud-api.test.js.map