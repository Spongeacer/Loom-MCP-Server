# LOOM Cloud API Specification

> **Version**: 0.4.0  
> **Base URL**: `https://loom-ai.help` (production) / `http://localhost:8765` (dev)

All endpoints return JSON. Errors use standard HTTP status codes with `{ ok: false, error: string }`.

---

## Auth

### POST /signup
Create a new user account.

**Body:**
```json
{
  "username": "alice",
  "password": "secret"
}
```

**Response (200):**
```json
{ "ok": true, "token": "utk-1234567890-..." }
```

**Errors:** 400 (missing field), 409 (username exists), 429 (rate limited)

---

### POST /login
Authenticate and receive a user token.

**Body:**
```json
{
  "username": "alice",
  "password": "secret"
}
```

**Response (200):**
```json
{ "ok": true, "token": "utk-1234567890-..." }
```

**Errors:** 400 (missing field), 401 (invalid creds), 429 (rate limited)

---

### POST /register
Register a device to the current user (Ed25519 challenge-response).

**Body:**
```json
{
  "deviceId": "dev-1234567890-abc",
  "publicKey": "base64-pem",
  "signature": "base64-sig",
  "userToken": "utk-..."
}
```

The device must sign the challenge string `loom-register-${deviceId}` with its Ed25519 private key.

**Response (200):**
```json
{ "ok": true, "token": "dt-1234567890-..." }
```

**Errors:** 400 (missing field), 401 (invalid user token), 403 (invalid signature)

---

## License

### POST /activate
Activate a license key for the current user.

**Headers:** `Authorization: Bearer <userToken>`

**Body:**
```json
{
  "licenseKey": "LOOM-BETA-XXXX-XXXX-XXXX",
  "userToken": "utk-..."
}
```

**Response (200):**
```json
{ "ok": true, "tier": "beta", "features": 3 }
```

**Errors:** 400 (missing field), 401 (invalid token), 402 (already has license), 404 (key not found), 409 (already activated)

---

### GET /license
Get current license status.

**Headers:** `Authorization: Bearer <deviceToken>`

**Response (200):**
```json
{ "ok": true, "active": true, "tier": "beta", "features": 3, "expiresAt": 1234567890 }
```

**Errors:** 401 (unauthorized), 402 (no license)

---

## Sync

### POST /push
Push local entries to the cloud.

**Headers:** `Authorization: Bearer <deviceToken>`

**Body:**
```json
{
  "projectId": "my-project",
  "entries": [
    { "id": "task-xxx", "version": 3, "payload": "{...json...}" }
  ],
  "baseVersions": { "task-xxx": 2 }
}
```

**Response (200):**
```json
{ "ok": true, "syncedIds": ["task-xxx"] }
```

**Response (409 Conflict):**
```json
{
  "ok": false,
  "error": "Conflict detected",
  "conflicts": [
    { "id": "task-xxx", "cloudVersion": 5 }
  ]
}
```

**Errors:** 400 (bad payload), 401 (unauthorized), 402 (no license)

---

### GET /pull
Pull entries updated since a timestamp.

**Headers:** `Authorization: Bearer <deviceToken>`

**Query:** `?projectId=my-project&since=2024-01-01T00:00:00.000Z`

**Response (200):**
```json
{
  "ok": true,
  "entries": [
    { "id": "task-xxx", "version": 3, "payload": "{...json...}", "updatedAt": "2024-01-02T00:00:00.000Z" }
  ]
}
```

**Errors:** 401 (unauthorized), 402 (no license)

---

## User Profile

### GET /user/profile
Get the cloud-generated user profile (read-only for clients).

**Headers:** `Authorization: Bearer <deviceToken>`

**Response (200):**
```json
{
  "ok": true,
  "entry": {
    "id": "user-profile",
    "version": 5,
    "payload": "{...}",
    "updatedAt": "2024-01-02T00:00:00.000Z"
  }
}
```

**Errors:** 401 (unauthorized), 402 (no license), 404 (not generated yet)

---

### POST /user/profile
Write user profile (admin / aggregator service only).

**Headers:** `Authorization: Bearer <adminSecret>`

**Body:**
```json
{
  "userId": "u-...",
  "entry": {
    "id": "user-profile",
    "version": 6,
    "payload": "{...json...}"
  }
}
```

**Response (200):**
```json
{ "ok": true }
```

**Errors:** 400 (bad payload), 403 (forbidden)

---

## Admin

### POST /admin/allocate
Allocate a new license key.

**Headers:** `Authorization: Bearer <adminSecret>`

**Response (200):**
```json
{ "ok": true, "license": "LOOM-BETA-XXXX-XXXX-XXXX" }
```

**Errors:** 403 (forbidden), 503 (no available licenses)

---

### GET /admin/stats
Get license inventory statistics.

**Headers:** `Authorization: Bearer <adminSecret>`

**Response (200):**
```json
{
  "ok": true,
  "total": 100,
  "available": 96,
  "allocated": 2,
  "activated": 2
}
```

**Errors:** 403 (forbidden)

---

## Public

### GET /health
Health check. No auth required.

**Response (200):**
```json
{ "ok": true, "version": "0.4.0" }
```

---

### POST /beta/apply
Apply for beta access. No auth required.

**Body:**
```json
{ "email": "alice@example.com" }
```

**Response (200):**
```json
{ "ok": true, "message": "Application received." }
```

**Errors:** 400 (invalid email), 429 (rate limited)

---

## Data Model

### Entry (StoredEntry)
```typescript
interface StoredEntry {
  id: string;       // entry id, e.g. "task-xxx"
  version: number;  // optimistic concurrency version
  payload: string;  // JSON-stringified Entry object
  updatedAt: string; // ISO 8601 timestamp
}
```

### CloudConfig (local)
Stored at `~/.loom/cloud.yml`:
```yaml
baseUrl: https://loom-ai.help
token: dt-...       # device token
userToken: utk-...  # user token
registeredAt: "2024-01-01T00:00:00.000Z"
```
