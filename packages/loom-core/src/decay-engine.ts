/**
 * Decay Engine — exponential decay with access-driven reinforcement.
 *
 * Core formula: score(t) = score_0 * 2^(-elapsed / half_life)
 * - Access resets the decay clock (reinforcement).
 * - Immune entries never decay.
 * - Entries below DECAY_ARCHIVE_THRESHOLD are eligible for archival.
 */
import type { Entry, DecayInfo, EntryType } from './types/index.js';
import {
  DECAY_HALF_LIFE_DAYS,
  DECAY_ARCHIVE_THRESHOLD,
  DECAY_MIN_SCORE,
  DECAY_IMMUNE_LIFECYCLE_STATES,
} from './constants.js';

/** Create a fresh DecayInfo for a new entry. */
export function createDecayInfo(entryType: EntryType, now?: Date): DecayInfo {
  const t = (now || new Date()).toISOString();
  return {
    score: 1.0,
    half_life_days: DECAY_HALF_LIFE_DAYS[entryType] || 90,
    last_accessed_at: t,
    access_count: 1,
    last_decay_at: t,
    immune: false,
  };
}

/** Compute exponential decay score. */
export function computeDecayScore(decay: DecayInfo, now?: Date): number {
  if (decay.immune) return 1.0;
  const t = now || new Date();
  const elapsed = (t.getTime() - new Date(decay.last_accessed_at).getTime()) / (1000 * 60 * 60 * 24);
  if (elapsed <= 0) return decay.score;
  // Exponential decay: score halves every half_life_days
  const decayed = decay.score * Math.pow(2, -elapsed / decay.half_life_days);
  return Math.max(decayed, DECAY_MIN_SCORE);
}

/** Update decay score for a single entry in-place. Returns true if score changed. */
export function applyDecay(entry: Entry, now?: Date): boolean {
  // Ensure decay metadata exists (backward compat for pre-v0.5.0 entries)
  if (!entry.decay) {
    entry.decay = createDecayInfo(entry.type, now ? new Date(entry.lifecycle.created) : undefined);
  }

  const d = entry.decay;

  // Check immunity: active/draft tasks and explicitly immune entries
  if (DECAY_IMMUNE_LIFECYCLE_STATES.includes(entry.lifecycle.state)) {
    d.immune = true;
    d.score = 1.0;
    d.last_decay_at = (now || new Date()).toISOString();
    return false;
  } else {
    d.immune = false;
  }

  const oldScore = d.score;
  d.score = computeDecayScore(d, now);
  d.last_decay_at = (now || new Date()).toISOString();

  // Sync to quality.freshness for backward compat
  entry.quality.freshness = d.score;

  return d.score !== oldScore;
}

/** Record an access event — resets decay clock. */
export function recordAccess(entry: Entry, now?: Date): void {
  if (!entry.decay) {
    entry.decay = createDecayInfo(entry.type, now);
  }
  const t = (now || new Date()).toISOString();
  entry.decay.last_accessed_at = t;
  entry.decay.access_count += 1;
  // Boost score on access (cap at 1.0)
  entry.decay.score = Math.min(entry.decay.score + 0.05, 1.0);
}

/** Check if an entry is eligible for archival. */
export function isEligibleForArchival(entry: Entry): boolean {
  if (!entry.decay) return false;
  if (entry.decay.immune) return false;
  return entry.decay.score < DECAY_ARCHIVE_THRESHOLD;
}

/** Apply decay to all entries. Returns entries that changed. */
export function applyDecayBatch(entries: Entry[], now?: Date): Entry[] {
  const changed: Entry[] = [];
  for (const entry of entries) {
    if (applyDecay(entry, now)) {
      changed.push(entry);
    }
  }
  return changed;
}

/** Get entries sorted by decay score (lowest first = most stale). */
export function sortByDecay(entries: Entry[]): Entry[] {
  return [...entries].sort((a, b) => {
    const sa = a.decay?.score ?? 1.0;
    const sb = b.decay?.score ?? 1.0;
    return sa - sb;
  });
}

/** Get a human-readable decay status summary. */
export function getDecaySummary(entries: Entry[]): {
  total: number;
  immune: number;
  healthy: number;     // score >= 0.5
  fading: number;      // 0.15 <= score < 0.5
  archival: number;    // score < 0.15
  byType: Record<string, { count: number; avgScore: number }>;
} {
  let immune = 0, healthy = 0, fading = 0, archival = 0;
  const byType: Record<string, { total: number; scoreSum: number }> = {};

  for (const e of entries) {
    const score = e.decay?.score ?? 1.0;
    const isImmune = e.decay?.immune ?? false;

    if (isImmune) immune++;
    else if (score >= 0.5) healthy++;
    else if (score >= DECAY_ARCHIVE_THRESHOLD) fading++;
    else archival++;

    if (!byType[e.type]) byType[e.type] = { total: 0, scoreSum: 0 };
    byType[e.type].total++;
    byType[e.type].scoreSum += score;
  }

  const byTypeResult: Record<string, { count: number; avgScore: number }> = {};
  for (const [type, data] of Object.entries(byType)) {
    byTypeResult[type] = { count: data.total, avgScore: Math.round((data.scoreSum / data.total) * 100) / 100 };
  }

  return { total: entries.length, immune, healthy, fading, archival, byType: byTypeResult };
}
