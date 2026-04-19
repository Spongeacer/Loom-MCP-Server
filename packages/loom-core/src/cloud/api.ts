export interface CloudApiConfig {
  baseUrl: string;
  timeoutMs?: number;
  retries?: number;
}

export interface AuthResult {
  ok: boolean;
  token?: string;
  error?: string;
}

export interface PushConflict {
  id: string;
  cloudVersion: number;
}

export interface PushResult {
  ok: boolean;
  syncedIds?: string[];
  conflicts?: PushConflict[];
  error?: string;
}

export interface PullResult {
  ok: boolean;
  entries?: Array<{ id: string; version: number; payload: string }>;
  error?: string;
}

export interface UserProfileResult {
  ok: boolean;
  entry?: { id: string; version: number; payload: string };
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

  async signup(username: string, password: string): Promise<AuthResult> {
    try {
      const res = await this.fetchWithRetry('/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });
      if (!res.ok) return { ok: false, error: `HTTP ${res.status}` };
      const data = await res.json() as { token?: string };
      return { ok: true, token: data.token };
    } catch (err) {
      return { ok: false, error: String(err) };
    }
  }

  async login(username: string, password: string): Promise<AuthResult> {
    try {
      const res = await this.fetchWithRetry('/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });
      if (!res.ok) return { ok: false, error: `HTTP ${res.status}` };
      const data = await res.json() as { token?: string };
      return { ok: true, token: data.token };
    } catch (err) {
      return { ok: false, error: String(err) };
    }
  }

  async register(deviceId: string, publicKey: string, signature: string, userToken: string): Promise<AuthResult> {
    try {
      const res = await this.fetchWithRetry('/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deviceId, publicKey, signature, userToken }),
      });
      if (!res.ok) return { ok: false, error: `HTTP ${res.status}` };
      const data = await res.json() as { token?: string };
      return { ok: true, token: data.token };
    } catch (err) {
      return { ok: false, error: String(err) };
    }
  }

  async push(
    token: string,
    projectId: string,
    entries: Array<{ id: string; version: number; payload: string }>,
    baseVersions: Record<string, number> = {}
  ): Promise<PushResult> {
    try {
      const res = await this.fetchWithRetry('/push', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ projectId, entries, baseVersions }),
      });
      if (res.status === 409) {
        const data = await res.json() as { conflicts?: PushConflict[]; error?: string };
        return { ok: false, conflicts: data.conflicts, error: data.error || 'Conflict detected' };
      }
      if (!res.ok) return { ok: false, error: `HTTP ${res.status}` };
      const data = await res.json() as { syncedIds?: string[] };
      return { ok: true, syncedIds: data.syncedIds };
    } catch (err) {
      return { ok: false, error: String(err) };
    }
  }

  async pull(token: string, projectId: string, since: string): Promise<PullResult> {
    try {
      const res = await this.fetchWithRetry(`/pull?projectId=${encodeURIComponent(projectId)}&since=${encodeURIComponent(since)}`, {
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

  async getUserProfile(token: string): Promise<UserProfileResult> {
    try {
      const res = await this.fetchWithRetry('/user/profile', {
        method: 'GET',
        headers: { 'Authorization': `Bearer ${token}` },
      });
      if (res.status === 404) return { ok: false, error: 'User profile not found' };
      if (!res.ok) return { ok: false, error: `HTTP ${res.status}` };
      const data = await res.json() as { entry?: { id: string; version: number; payload: string } };
      return { ok: true, entry: data.entry };
    } catch (err) {
      return { ok: false, error: String(err) };
    }
  }

  async saveUserProfile(adminSecret: string, userId: string, entry: { id: string; version: number; payload: string }): Promise<{ ok: boolean; error?: string }> {
    try {
      const res = await this.fetchWithRetry('/user/profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${adminSecret}` },
        body: JSON.stringify({ userId, entry }),
      });
      if (!res.ok) return { ok: false, error: `HTTP ${res.status}` };
      return { ok: true };
    } catch (err) {
      return { ok: false, error: String(err) };
    }
  }

  async activate(userToken: string, licenseKey: string): Promise<{ ok: boolean; tier?: string; features?: number; error?: string }> {
    try {
      const res = await this.fetchWithRetry('/activate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userToken, licenseKey }),
      });
      if (!res.ok) return { ok: false, error: `HTTP ${res.status}` };
      const data = await res.json() as { tier?: string; features?: number };
      return { ok: true, tier: data.tier, features: data.features };
    } catch (err) {
      return { ok: false, error: String(err) };
    }
  }

  async getLicenseStatus(token: string): Promise<{ ok: boolean; active?: boolean; tier?: string; features?: number; expiresAt?: number; error?: string }> {
    try {
      const res = await this.fetchWithRetry('/license', {
        method: 'GET',
        headers: { 'Authorization': `Bearer ${token}` },
      });
      if (!res.ok) return { ok: false, error: `HTTP ${res.status}` };
      const data = await res.json() as { active?: boolean; tier?: string; features?: number; expiresAt?: number };
      return { ok: true, active: data.active, tier: data.tier, features: data.features, expiresAt: data.expiresAt };
    } catch (err) {
      return { ok: false, error: String(err) };
    }
  }

  async adminAllocate(adminSecret: string): Promise<{ ok: boolean; license?: string; error?: string }> {
    try {
      const res = await this.fetchWithRetry('/admin/allocate', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${adminSecret}` },
      });
      if (!res.ok) return { ok: false, error: `HTTP ${res.status}` };
      const data = await res.json() as { license?: string };
      return { ok: true, license: data.license };
    } catch (err) {
      return { ok: false, error: String(err) };
    }
  }

  async adminStats(adminSecret: string): Promise<{ ok: boolean; total?: number; allocated?: number; activated?: number; available?: number; error?: string }> {
    try {
      const res = await this.fetchWithRetry('/admin/stats', {
        method: 'GET',
        headers: { 'Authorization': `Bearer ${adminSecret}` },
      });
      if (!res.ok) return { ok: false, error: `HTTP ${res.status}` };
      const data = await res.json() as { total?: number; allocated?: number; activated?: number; available?: number };
      return { ok: true, total: data.total, allocated: data.allocated, activated: data.activated, available: data.available };
    } catch (err) {
      return { ok: false, error: String(err) };
    }
  }
}
