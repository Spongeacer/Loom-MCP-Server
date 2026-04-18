/**
 * LOOM Cloud Sync — HTTP API Client
 *
 * Thin wrapper around fetch() for the cloud REST API.
 * Handles auth token injection, JSON serialization, and basic error mapping.
 */
/** Generic API error with optional HTTP status. */
export class CloudApiError extends Error {
    status;
    code;
    constructor(message, status, code) {
        super(message);
        this.status = status;
        this.code = code;
        this.name = 'CloudApiError';
    }
}
/** Simple in-memory token manager (persist to disk in production). */
export function createMemoryTokenManager() {
    let token = null;
    let expiry = 0;
    return {
        getToken() {
            if (token && Date.now() / 1000 < expiry - 60)
                return token;
            return null;
        },
        setToken(t, e) {
            token = t;
            expiry = e;
        },
        clearToken() {
            token = null;
            expiry = 0;
        },
    };
}
export function createCloudApiClient(opts) {
    const { apiBaseUrl, tokenManager, fetchImpl = fetch, timeoutMs = 10_000 } = opts;
    async function apiFetch(method, path, body, auth = true) {
        const url = `${apiBaseUrl}${path}`;
        const headers = {
            'Content-Type': 'application/json',
            Accept: 'application/json',
        };
        if (auth) {
            const token = tokenManager.getToken();
            if (!token) {
                throw new CloudApiError('No access token; device may need registration.', 401, 'NO_TOKEN');
            }
            headers['Authorization'] = `Bearer ${token}`;
        }
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeoutMs);
        try {
            const res = await fetchImpl(url, {
                method,
                headers,
                body: body ? JSON.stringify(body) : undefined,
                signal: controller.signal,
            });
            if (!res.ok) {
                const text = await res.text().catch(() => '');
                throw new CloudApiError(`HTTP ${res.status}: ${text || res.statusText}`, res.status, `HTTP_${res.status}`);
            }
            return (await res.json());
        }
        catch (err) {
            if (err instanceof CloudApiError)
                throw err;
            if (err instanceof Error && err.name === 'AbortError') {
                throw new CloudApiError(`Request timed out after ${timeoutMs}ms`, 408, 'TIMEOUT');
            }
            throw new CloudApiError(err instanceof Error ? err.message : String(err));
        }
        finally {
            clearTimeout(timer);
        }
    }
    return {
        async registerDevice(payload) {
            return apiFetch('POST', '/v1/devices/register', payload, false);
        },
        async push(payload) {
            return apiFetch('POST', '/v1/sync/push', payload);
        },
        async pull(payload) {
            return apiFetch('POST', '/v1/sync/pull', payload);
        },
        async validateLicense(licenseKey) {
            try {
                return await apiFetch('POST', '/v1/license/validate', { licenseKey }, false);
            }
            catch (err) {
                if (err instanceof CloudApiError && err.status === 401)
                    return null;
                throw err;
            }
        },
    };
}
/**
 * Convenience factory that wires up the default token manager.
 */
export function createDefaultCloudApiClient(config) {
    return createCloudApiClient({
        apiBaseUrl: config.apiBaseUrl,
        tokenManager: createMemoryTokenManager(),
        timeoutMs: config.timeoutMs,
    });
}
//# sourceMappingURL=cloud-api.js.map