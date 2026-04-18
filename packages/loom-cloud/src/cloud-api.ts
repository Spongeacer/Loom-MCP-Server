/**
 * LOOM Cloud Sync — HTTP API Client
 *
 * Thin wrapper around fetch() for the cloud REST API.
 * Handles auth token injection, JSON serialization, and basic error mapping.
 */

import type {
  CloudEntry,
  PullPayload,
  PullResponse,
  PushPayload,
  PushResponse,
  RegisterDevicePayload,
  RegisterDeviceResponse,
  SyncConfig,
} from './types.js';

/** Generic API error with optional HTTP status. */
export class CloudApiError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
    public readonly code?: string,
  ) {
    super(message);
    this.name = 'CloudApiError';
  }
}

/** Token manager — stores and refreshes the cloud access token. */
export interface TokenManager {
  getToken(): string | null;
  setToken(token: string, expiresAt: number): void;
  clearToken(): void;
}

/** Simple in-memory token manager (persist to disk in production). */
export function createMemoryTokenManager(): TokenManager {
  let token: string | null = null;
  let expiry = 0;
  return {
    getToken() {
      if (token && Date.now() / 1000 < expiry - 60) return token;
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

// ─────────────────────────────────────────────────────────────────────────────
// CloudApiClient
// ─────────────────────────────────────────────────────────────────────────────

export interface CloudApiClient {
  registerDevice(payload: RegisterDevicePayload): Promise<RegisterDeviceResponse>;
  push(payload: PushPayload): Promise<PushResponse>;
  pull(payload: PullPayload): Promise<PullResponse>;
}

export interface CloudApiClientOptions {
  apiBaseUrl: string;
  tokenManager: TokenManager;
  /** Optional fetch implementation (for testing). */
  fetchImpl?: typeof fetch;
  /** Request timeout in ms. */
  timeoutMs?: number;
}

export function createCloudApiClient(opts: CloudApiClientOptions): CloudApiClient {
  const { apiBaseUrl, tokenManager, fetchImpl = fetch, timeoutMs = 10_000 } = opts;

  async function apiFetch<T>(
    method: string,
    path: string,
    body?: unknown,
    auth = true,
  ): Promise<T> {
    const url = `${apiBaseUrl}${path}`;
    const headers: Record<string, string> = {
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
        throw new CloudApiError(
          `HTTP ${res.status}: ${text || res.statusText}`,
          res.status,
          `HTTP_${res.status}`,
        );
      }

      return (await res.json()) as T;
    } catch (err) {
      if (err instanceof CloudApiError) throw err;
      if (err instanceof Error && err.name === 'AbortError') {
        throw new CloudApiError(`Request timed out after ${timeoutMs}ms`, 408, 'TIMEOUT');
      }
      throw new CloudApiError(err instanceof Error ? err.message : String(err));
    } finally {
      clearTimeout(timer);
    }
  }

  return {
    async registerDevice(payload: RegisterDevicePayload): Promise<RegisterDeviceResponse> {
      return apiFetch<RegisterDeviceResponse>('POST', '/v1/devices/register', payload, false);
    },

    async push(payload: PushPayload): Promise<PushResponse> {
      return apiFetch<PushResponse>('POST', '/v1/sync/push', payload);
    },

    async pull(payload: PullPayload): Promise<PullResponse> {
      return apiFetch<PullResponse>('POST', '/v1/sync/pull', payload);
    },


  };
}

/**
 * Convenience factory that wires up the default token manager.
 */
export function createDefaultCloudApiClient(
  config: Pick<SyncConfig, 'apiBaseUrl'> & { timeoutMs?: number },
): CloudApiClient {
  return createCloudApiClient({
    apiBaseUrl: config.apiBaseUrl,
    tokenManager: createMemoryTokenManager(),
    timeoutMs: config.timeoutMs,
  });
}
