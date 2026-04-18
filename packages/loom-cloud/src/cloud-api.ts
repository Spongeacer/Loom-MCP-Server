export interface CloudApiConfig {
  baseUrl: string;
  timeoutMs?: number;
  retries?: number;
}

export interface PushResult {
  ok: boolean;
  syncedIds?: string[];
  error?: string;
}

export interface PullResult {
  ok: boolean;
  entries?: Array<{ id: string; version: number; payload: string }>;
  error?: string;
}

export class CloudApiClient {
  constructor(private config: CloudApiConfig) {}

  private async fetchWithRetry(path: string, init: RequestInit): Promise<Response> {
    const url = `${this.config.baseUrl}${path}`;
    const timeout = this.config.timeoutMs ?? 10000;
    const retries = this.config.retries ?? 2;

    for (let i = 0; i <= retries; i++) {
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeout);
        const res = await fetch(url, { ...init, signal: controller.signal });
        clearTimeout(timer);
        return res;
      } catch (err) {
        if (i === retries) throw err;
        await new Promise((r) => setTimeout(r, 1000 * (i + 1)));
      }
    }
    throw new Error('Unreachable');
  }

  async register(deviceId: string, publicKey: string, signature: string): Promise<{ ok: boolean; token?: string; error?: string }> {
    try {
      const res = await this.fetchWithRetry('/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deviceId, publicKey, signature }),
      });
      if (!res.ok) return { ok: false, error: `HTTP ${res.status}` };
      const data = await res.json() as { token?: string };
      return { ok: true, token: data.token };
    } catch (err) {
      return { ok: false, error: String(err) };
    }
  }

  async push(token: string, entries: Array<{ id: string; version: number; payload: string }>): Promise<PushResult> {
    try {
      const res = await this.fetchWithRetry('/push', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ entries }),
      });
      if (!res.ok) return { ok: false, error: `HTTP ${res.status}` };
      const data = await res.json() as { syncedIds?: string[] };
      return { ok: true, syncedIds: data.syncedIds };
    } catch (err) {
      return { ok: false, error: String(err) };
    }
  }

  async pull(token: string, since: string): Promise<PullResult> {
    try {
      const res = await this.fetchWithRetry(`/pull?since=${encodeURIComponent(since)}`, {
        method: 'GET',
        headers: { 'Authorization': `Bearer ${token}` },
      });
      if (!res.ok) return { ok: false, error: `HTTP ${res.status}` };
      const data = await res.json() as { entries?: Array<{ id: string; version: number; payload: string }> };
      return { ok: true, entries: data.entries };
    } catch (err) {
      return { ok: false, error: String(err) };
    }
  }
}
