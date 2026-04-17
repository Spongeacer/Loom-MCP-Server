import * as fs from 'node:fs';
import { getWorkingSet, listEntries, getEntry, listBindings, getConfig, writeActivePrompt } from '../core/store.js';
import { ensureUserProfile } from '../core/user-profile.js';
import { runDoctor } from '../core/doctor.js';
import { buildSlotPrompt, computeRisks } from '../core/prompt-builder.js';
import { getRecentlyModifiedArtifacts } from '../core/fs-tracker.js';
import { shouldAutoScan, performFsScan, performFsScanInWorker, getLastScanPath } from '../core/fs-scan.js';
import { readDirtySet, removeFromDirtySet } from '../core/dirty-tracker.js';
import { ensureWatchDaemon } from '../core/watch-daemon.js';
import { summarizeSession } from '../core/session-recall.js';
import { resolveProjectRoot } from '../core/paths.js';
import {
  DEFAULT_WATCH_DIRS,
  DEFAULT_FS_SCAN_DIRS,
  MIN_RESCAN_MS as STATUS_MIN_RESCAN_MS,
  INCREMENTAL_DIRTY_LIMIT,
  PROMPT_MAX_SKILLS,
  PROMPT_MAX_DECISIONS,
  PROMPT_MAX_DICTIONARY,
  PROMPT_MAX_RISKS,
  PROMPT_MAX_RECENT_FILES,
  PROMPT_MAX_FS_HEALTH,
  PROMPT_MAX_DIAGNOSTICS,
} from '../core/constants.js';
import type { Entry, ArtifactEntry, SkillEntry } from '../types/index.js';

export async function runStatus(): Promise<string> {
  if (!getConfig()) {
    throw new Error('LOOM not initialized. Run: .loom init <project-name>');
  }

  const projectRoot = resolveProjectRoot();

  // Auto-start watch daemon if not running (self-healing)
  ensureWatchDaemon(DEFAULT_WATCH_DIRS, projectRoot);

  const MIN_RESCAN_MS = STATUS_MIN_RESCAN_MS;
  const DIRTY_LIMIT = INCREMENTAL_DIRTY_LIMIT;

  // Detect changes via dirty-set, then trigger scan only when needed
  const ds = readDirtySet(projectRoot);
  const hasDirty = ds.files.length > 0 || ds.needs_dependency_scan;

  // Throttle scan to avoid cache-invalidating side effects on rapid MCP calls
  const lastScanPath = getLastScanPath(projectRoot);
  const lastScanMs = fs.existsSync(lastScanPath)
    ? new Date(fs.readFileSync(lastScanPath, 'utf-8').trim()).getTime()
    : 0;
  const canScan = Date.now() - lastScanMs > MIN_RESCAN_MS;

  // Auto-trigger filesystem scan if stale (> 5 min) OR we detected dirty changes (throttled)
  if (canScan && (shouldAutoScan(projectRoot) || hasDirty)) {
    const scannedFiles = ds.files;
    const scannedArtifacts = ds.artifacts;
    const needsFullScan = shouldAutoScan(projectRoot) || scannedFiles.length > DIRTY_LIMIT;
    if (needsFullScan) {
      await performFsScanInWorker(DEFAULT_FS_SCAN_DIRS, projectRoot, { silent: true, updateTimestamp: true, timeoutMs: 15000 });
    } else if (scannedFiles.length > 0) {
      await performFsScan(DEFAULT_FS_SCAN_DIRS, projectRoot, { silent: true, updateTimestamp: false, incremental: true, changedFiles: scannedFiles });
    }
    // Remove only the files we just processed, preserving any new dirty
    // entries that the watch daemon may have written during the scan.
    removeFromDirtySet(scannedFiles, scannedArtifacts, projectRoot);
  }

  ensureUserProfile(projectRoot);

  const ws = getWorkingSet();
  const entries = listEntries();
  const bindings = listBindings();

  const activeTask = ws.active_task ? getEntry(ws.active_task) : null;
  const workingSetIds = [
    ...ws.pinned_entries,
    ...ws.hot_entries,
    ...ws.recently_expanded,
  ].filter((id, idx, arr) => arr.indexOf(id) === idx);
  const workingSetEntries = workingSetIds
    .map((id) => getEntry(id))
    .filter((e): e is Entry => e !== null);

  const governance = entries.filter((e) => e.type === 'Rule' && e.lifecycle.state === 'active');
  const decisions = entries.filter((e) => e.type === 'Decision' && e.lifecycle.state === 'active');
  const skills = entries
    .filter((e): e is SkillEntry => e.type === 'Skill' && (e.lifecycle.state === 'active' || e.lifecycle.state === 'verified'))
    .sort((a, b) => b.quality.composite_score - a.quality.composite_score)
    .slice(0, PROMPT_MAX_SKILLS);
  const userProfile = getEntry('memory-user-profile');
  const dictionaryBase = entries
    .filter((e) => e.lifecycle.state === 'active' || e.lifecycle.state === 'verified')
    .sort((a, b) => b.quality.composite_score - a.quality.composite_score)
    .slice(0, PROMPT_MAX_DECISIONS);
  const dictionary = userProfile
    ? [userProfile, ...dictionaryBase.filter((e) => e.id !== userProfile.id)].slice(0, PROMPT_MAX_DICTIONARY)
    : dictionaryBase;

  const risks = computeRisks(entries, bindings).slice(0, PROMPT_MAX_RISKS);

  const artifacts = entries.filter((e): e is ArtifactEntry => e.type === 'Artifact');
  const recentFiles = getRecentlyModifiedArtifacts(artifacts, PROMPT_MAX_RECENT_FILES);
  const fsHealthRisks: string[] = [];
  for (const art of artifacts) {
    if (art.artifact.health.status !== 'healthy') {
      fsHealthRisks.push(`↣${art.id}: ${art.artifact.path} is ${art.artifact.health.status} (action: ${art.artifact.health.suggested_action}) — ${art.artifact.health.reasons.join('; ')}`);
    }
  }

  const ctx = {
    protocol: 'You have a persistent semantic memory system. If a ↣id might be important but you are unsure of the details, call .loom expand <id>. Before modifying an artifact, check governance / risks / decisions. If you reach a stable conclusion, propose creating a Task / Decision / Rule / Memory.',
    governance,
    activeTask,
    workingSet: workingSetEntries,
    decisions,
    risks,
    recovery: summarizeSession(projectRoot, 1),
    dictionary,
    skills,
    recentFiles,
    fsHealthRisks: fsHealthRisks.slice(0, PROMPT_MAX_FS_HEALTH),
    diagnostics: runDoctor(projectRoot)
      .filter((r) => r.level !== 'ok')
      .map((r) => `[${r.level.toUpperCase()}] ${r.message}`)
      .slice(0, PROMPT_MAX_DIAGNOSTICS),
  };

  const prompt = buildSlotPrompt(ctx);
  writeActivePrompt(prompt);
  return prompt;
}

export async function runStatusJson(): Promise<{
  activeTask: { id: string; title: string; current?: string } | null;
  decisions: { id: string; title: string }[];
  risks: string[];
  fsHealth: string[];
}> {
  if (!getConfig()) {
    throw new Error('LOOM not initialized. Run: .loom init <project-name>');
  }

  const projectRoot = resolveProjectRoot();

  ensureWatchDaemon(DEFAULT_WATCH_DIRS, projectRoot);

  const MIN_RESCAN_MS = STATUS_MIN_RESCAN_MS;
  const DIRTY_LIMIT = INCREMENTAL_DIRTY_LIMIT;
  const ds = readDirtySet(projectRoot);
  const hasDirty = ds.files.length > 0 || ds.needs_dependency_scan;
  const lastScanPath = getLastScanPath(projectRoot);
  const lastScanMs = fs.existsSync(lastScanPath)
    ? new Date(fs.readFileSync(lastScanPath, 'utf-8').trim()).getTime()
    : 0;
  const canScan = Date.now() - lastScanMs > MIN_RESCAN_MS;

  if (canScan && (shouldAutoScan(projectRoot) || hasDirty)) {
    const scannedFiles = ds.files;
    const scannedArtifacts = ds.artifacts;
    const needsFullScan = shouldAutoScan(projectRoot) || scannedFiles.length > DIRTY_LIMIT;
    if (needsFullScan) {
      await performFsScanInWorker(DEFAULT_FS_SCAN_DIRS, projectRoot, { silent: true, updateTimestamp: true, timeoutMs: 15000 });
    } else if (scannedFiles.length > 0) {
      await performFsScan(DEFAULT_FS_SCAN_DIRS, projectRoot, { silent: true, updateTimestamp: false, incremental: true, changedFiles: scannedFiles });
    }
    removeFromDirtySet(scannedFiles, scannedArtifacts, projectRoot);
  }

  ensureUserProfile(projectRoot);

  const ws = getWorkingSet();
  const entries = listEntries();
  const bindings = listBindings();

  const activeTaskEntry = ws.active_task ? getEntry(ws.active_task) : null;
  const activeTask = activeTaskEntry
    ? {
        id: activeTaskEntry.id,
        title:
          (activeTaskEntry as Entry & { task?: { title: string } }).task?.title ||
          activeTaskEntry.content.l2,
        current:
          (activeTaskEntry as Entry & { task?: { progress: { current: string | null } } }).task
            ?.progress?.current || undefined,
      }
    : null;

  const decisions = entries
    .filter((e) => e.type === 'Decision' && e.lifecycle.state === 'active')
    .map((e) => ({ id: e.id, title: e.content.l2 }));

  const risks = computeRisks(entries, bindings)
    .slice(0, PROMPT_MAX_RISKS);

  const artifacts = entries.filter((e): e is ArtifactEntry => e.type === 'Artifact');
  const fsHealth: string[] = [];
  for (const art of artifacts) {
    if (art.artifact.health.status !== 'healthy') {
      fsHealth.push(
        `↣${art.id}: ${art.artifact.path} is ${art.artifact.health.status} (action: ${art.artifact.health.suggested_action}) — ${art.artifact.health.reasons.join('; ')}`
      );
    }
  }

  return {
    activeTask,
    decisions,
    risks,
    fsHealth: fsHealth.slice(0, PROMPT_MAX_FS_HEALTH),
  };
}
