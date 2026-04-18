/**
 * LOOM Cloud Sync — HTTP API Client
 *
 * Thin wrapper around fetch() for the cloud REST API.
 * Handles auth token injection, JSON serialization, and basic error mapping.
 */
import type { PullPayload, PullResponse, PushPayload, PushResponse, RegisterDevicePayload, RegisterDeviceResponse, SyncConfig, LicenseInfo } from './types.js';
/** Generic API error with optional HTTP status. */
export declare class CloudApiError extends Error {
    readonly status?: number | undefined;
    readonly code?: string | undefined;
    constructor(message: string, status?: number | undefined, code?: string | undefined);
}
/** Token manager — stores and refreshes the cloud access token. */
export interface TokenManager {
    getToken(): string | null;
    setToken(token: string, expiresAt: number): void;
    clearToken(): void;
}
/** Simple in-memory token manager (persist to disk in production). */
export declare function createMemoryTokenManager(): TokenManager;
export interface CloudApiClient {
    registerDevice(payload: RegisterDevicePayload): Promise<RegisterDeviceResponse>;
    push(payload: PushPayload): Promise<PushResponse>;
    pull(payload: PullPayload): Promise<PullResponse>;
    validateLicense(licenseKey: string): Promise<LicenseInfo | null>;
}
export interface CloudApiClientOptions {
    apiBaseUrl: string;
    tokenManager: TokenManager;
    /** Optional fetch implementation (for testing). */
    fetchImpl?: typeof fetch;
    /** Request timeout in ms. */
    timeoutMs?: number;
}
export declare function createCloudApiClient(opts: CloudApiClientOptions): CloudApiClient;
/**
 * Convenience factory that wires up the default token manager.
 */
export declare function createDefaultCloudApiClient(config: Pick<SyncConfig, 'apiBaseUrl'> & {
    timeoutMs?: number;
}): CloudApiClient;
//# sourceMappingURL=cloud-api.d.ts.map