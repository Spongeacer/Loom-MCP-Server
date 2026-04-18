# LOOM Cloud Sync Architecture

> **Status**: Design-complete, implementation in progress  
> **Package**: `packages/loom-cloud/`  
> **Depends on**: `packages/loom/` (types + StoreAdapter)

## Core Philosophy

**Cloud is the brain; device is the terminal.**

- The cloud server runs LLM-based merge pipelines across all projects.
- Devices only perform simple version arbitration — no LLM calls, no semantic analysis.
- Local `.loom/` remains the source of truth; cloud sync is fire-and-forget.

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              CLOUD SERVER                                    │
│  ┌──────────────┐    ┌──────────────────────┐    ┌──────────────────────┐  │
│  │ Receives push │───>│ LLM Merge Pipeline   │───>│ User-level entries   │  │
│  │ from devices  │    │ (cross-project)      │    │ (namespace='user')   │  │
│  └──────────────┘    └──────────────────────┘    └──────────────────────┘  │
│                                                             │               │
└─────────────────────────────────────────────────────────────┼───────────────┘
                                                              │ pull
┌─────────────────────────────────────────────────────────────┼───────────────┐
│                         DEVICE A                            │               │
│  ┌──────────────┐    ┌──────────────────────┐              │               │
│  │ Local Store  │───>│ Sync Engine          │<─────────────┘               │
│  │ (.loom/)     │    │ - conflict-resolver  │                              │
│  └──────────────┘    │ - cloud-api client   │                              │
│       ▲              └──────────────────────┘                              │
│       │                        │                                           │
│  push │                   ┌────┴────┐                                      │
│       │                   │ Auth    │                                      │
│       └───────────────────│ Ed25519 │                                      │
│                           └─────────┘                                      │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Directory Structure

```
packages/loom-cloud/
├── src/
│   ├── types.ts              # Cloud sync types (SyncIndex, CloudEntry, etc.)
│   ├── conflict-resolver.ts  # Device-side conflict arbitration (no LLM)
│   ├── auth.ts               # Ed25519 device key + license management
│   ├── cloud-api.ts          # HTTP client for cloud REST API
│   ├── sync-engine.ts        # Orchestrates push/pull with local store
│   └── index.ts              # Public exports
├── src/server/               # Cloud server (future, separate deployable)
│   └── README.md
├── ARCHITECTURE.md           # This file
├── package.json
└── tsconfig.json
```

## Conflict Resolution Strategy

### Device-side (Deterministic, O(1))

Three scenarios, handled by `conflict-resolver.ts`:

| Scenario | Local | Cloud | Action |
|----------|-------|-------|--------|
| 1 | ❌ absent | ✅ present | Adopt cloud version |
| 2 | ✅ present | ❌ absent | Keep local, mark dirty |
| 3 | ✅ present | ✅ present (newer) | Cloud wins; if local was dirty, fork to draft |

Key rule: **cloud always wins when `cloudVersion > local.cloudVersion`** because the cloud has already run LLM merge across all projects.

### Cloud-side (LLM-powered)

The cloud merge pipeline (server-side, not in this package):

1. **Aggregate** all `namespace='project'` entries from a user's devices.
2. **Cluster** by semantic similarity using embeddings.
3. **Merge** each cluster with an LLM prompt:
   - Input: `[entryA, entryB, entryC]` from projects X, Y, Z
   - Output: one refined `namespace='user'` entry
4. **Version** the result with monotonically-increasing `cloudVersion`.
5. **Distribute** to all connected devices via pull.

## Data Flow

### Push (Device → Cloud)

```
User edits local entry
    → store.saveEntry()
    → syncEngine.markDirty(entryId)
    → [5s debounce]
    → syncEngine._push()
    → api.push({ deviceId, projectName, entries[], baseCloudVersion })
    → Cloud accepts → update SyncIndex (dirty=false, lastPushAt=now)
```

### Pull (Cloud → Device)

```
[Every 60s, or manual sync]
    → syncEngine._pull()
    → api.pull({ deviceId, sinceCloudVersion })
    → For each CloudEntry:
        → resolveConflict(local, cloud, syncState)
        → save winner to local store
        → if fork created, save fork as namespace='local' draft
    → update SyncIndex (cloudVersion, lastPullAt)
```

### Offline Edit Conflict

```
T0: local and cloud at v5
T1: device offline, user edits entry → local dirty
T2: cloud merges other devices, generates v6
T3: device online, pulls v6
    → cloudVersion 6 > local 5
    → local was dirty → FORK
    → winner = cloud v6 (saved as main entry)
    → fork = local-edit-v5 (saved as draft, namespace='local')
    → user sees conflict hint in next `loom status`
```

## Authentication

**Zero-registration Ed25519 device keys:**

1. Device generates Ed25519 keypair on first use.
2. `deviceId` = SHA-256(publicKey)[0:32].
3. Registration sends `{deviceId, publicKey, signedChallenge}` to `/v1/devices/register`.
4. Cloud verifies signature, issues short-lived JWT access token.
5. Token is stored in-memory (persist to keychain in production).

No passwords, no OAuth, no user accounts. The license key is the only shared secret.

## Sync Index

Stored in `.loom/cache/sync-index.yml` (JSON for now):

```yaml
cloudVersion: 42
lastPulledAt: "2026-04-18T15:00:00Z"
lastPushedAt: "2026-04-18T14:55:00Z"
entries:
  task-001:
    cloudVersion: 42
    lastPushAt: "2026-04-18T14:55:00Z"
    lastPullAt: "2026-04-18T15:00:00Z"
    dirty: false
    forkedTo: null
```

The sync index is intentionally separate from Entry schema. No cloud fields pollute core LOOM types.

## Namespaces

| namespace | source | sync direction | visibility |
|-----------|--------|----------------|------------|
| `project` | local | device → cloud | same project, all devices |
| `user` | cloud merge | cloud → device | all projects for this user |
| `local` | local fork | none | current device only |
| `team` | cloud (future) | bidirectional | team members |

## Error Handling

- **Network failures**: Silent. Entries remain dirty, retry next sync cycle.
- **Auth failures**: Clear token, trigger re-registration on next sync.
- **Push rejections**: Entry stays dirty, error logged, user sees in `loom status`.
- **Pull conflicts**: Fork created, conflict recorded in sync index, user prompted.

## Testing Strategy

1. **Conflict resolver**: Unit tests for all 3 scenarios + edge cases.
2. **Sync engine**: Mock StoreAdapter + mock CloudApiClient.
3. **Auth**: Key generation, signing, fingerprinting.
4. **Cloud API**: Mock fetch, test timeout, retry, error mapping.

## Future Work

- [ ] Real Ed25519 signing (remove HMAC fallback in `auth.ts`)
- [ ] Persistent token storage (OS keychain / Windows Credential Manager)
- [ ] Background sync daemon (`loom sync start` / `loom sync stop`)
- [ ] Cloud server implementation (separate repo or `src/server/`)
- [ ] Team/organization namespaces
- [ ] End-to-end encryption (device keys encrypt payloads)
