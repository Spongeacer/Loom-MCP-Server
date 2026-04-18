import type { Entry } from '@loom/core';

export type ConflictStrategy = 'cloud-wins' | 'local-wins' | 'fork-local';

export interface ConflictResult {
  strategy: ConflictStrategy;
  winner: Entry | null;
  fork?: Entry;
  reason: string;
}

export interface EntrySyncState {
  cloudVersion: number;
  lastSyncedAt: string;
  dirty: boolean;
}

export function resolveConflict(
  local: Entry | null,
  cloud: Entry | null,
  sync: EntrySyncState | undefined,
): ConflictResult {
  // Cloud only
  if (!local && cloud) {
    return { strategy: 'cloud-wins', winner: cloud, reason: 'Local absent, cloud exists' };
  }
  // Local only
  if (local && !cloud) {
    return { strategy: 'local-wins', winner: local, reason: 'Cloud absent, local exists' };
  }
  // Both absent
  if (!local && !cloud) {
    return { strategy: 'cloud-wins', winner: null, reason: 'Both absent' };
  }

  const localVersion = local!.version;
  const cloudVersion = cloud!.version;

  // Cloud newer + local clean
  if (cloudVersion > localVersion && !sync?.dirty) {
    return { strategy: 'cloud-wins', winner: cloud, reason: 'Cloud newer, local clean' };
  }

  // Cloud newer + local dirty → fork
  if (cloudVersion > localVersion && sync?.dirty) {
    const fork: Entry = {
      ...structuredClone(local!),
      id: `${local!.id}-local`,
      namespace: 'local',
      version: local!.version + 1,
    };
    return {
      strategy: 'fork-local',
      winner: cloud,
      fork,
      reason: 'Cloud newer, local dirty — cloud wins, local forked to draft',
    };
  }

  // Cloud older or same
  return { strategy: 'local-wins', winner: local, reason: 'Local is same or newer' };
}
