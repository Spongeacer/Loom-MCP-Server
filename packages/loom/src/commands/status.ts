import { getWorkingSet, listEntries, getEntry, listBindings, getConfig, writeActivePrompt } from '../core/store.js';
import { ensureUserProfile } from '../core/user-profile.js';
import { runDoctor } from '../core/doctor.js';
import { buildSlotPrompt, computeRisks } from '../core/prompt-builder.js';
import { getRecentlyModifiedArtifacts } from '../core/fs-tracker.js';
import { shouldAutoScan, performFsScan } from '../core/fs-scan.js';
import { readDirtySet, syncDirtyFromGit, clearDirtySet } from '../core/dirty-tracker.js';
import type { Entry, ArtifactEntry, SkillEntry } from '../types/index.js';

export async function runStatus(): Promise<void> {
  if (!getConfig()) {
    console.log('LOOM not initialized. Run:.loom init <project-name>');
    return;
  }

  const projectRoot = process.cwd();

  // Detect changes via Git and dirty-set, then trigger scan only when needed
  const gitDirty = syncDirtyFromGit(projectRoot);
  const ds = readDirtySet(projectRoot);
  const hasDirty = gitDirty || ds.files.length > 0 || ds.needs_dependency_scan;

  // Auto-trigger filesystem scan if stale (> 5 min) OR we detected dirty changes
  if (shouldAutoScan(projectRoot) || hasDirty) {
    await performFsScan(['src', 'tests', 'packages'], projectRoot, { silent: true, updateTimestamp: true });
    clearDirtySet(projectRoot);
  }

  ensureUserProfile(projectRoot);

  const ws = getWorkingSet();
  const entries = listEntries();
  const bindings = listBindings();

  const activeTask = ws.active_task ? getEntry(ws.active_task) : null;
  const workingSetEntries = ws.pinned_entries
    .map((id) => getEntry(id))
    .filter((e): e is Entry => e !== null);

  const governance = entries.filter((e) => e.type === 'Rule' && e.lifecycle.state === 'active');
  const decisions = entries.filter((e) => e.type === 'Decision' && e.lifecycle.state === 'active');
  const skills = entries
    .filter((e): e is SkillEntry => e.type === 'Skill' && (e.lifecycle.state === 'active' || e.lifecycle.state === 'verified'))
    .sort((a, b) => b.quality.composite_score - a.quality.composite_score)
    .slice(0, 3);
  const userProfile = getEntry('memory-user-profile');
  const dictionaryBase = entries
    .filter((e) => e.lifecycle.state === 'active' || e.lifecycle.state === 'verified')
    .sort((a, b) => b.quality.composite_score - a.quality.composite_score)
    .slice(0, 10);
  const dictionary = userProfile
    ? [userProfile, ...dictionaryBase.filter((e) => e.id !== userProfile.id)].slice(0, 11)
    : dictionaryBase;

  const risks = computeRisks(entries, bindings).slice(0, 5);

  const artifacts = entries.filter((e): e is ArtifactEntry => e.type === 'Artifact');
  const recentFiles = getRecentlyModifiedArtifacts(artifacts, 5);
  const fsHealthRisks: string[] = [];
  for (const art of artifacts) {
    if (art.artifact.health.status !== 'healthy') {
      fsHealthRisks.push(`↣${art.id}: ${art.artifact.path} is ${art.artifact.health.status} (action: ${art.artifact.health.suggested_action}) — ${art.artifact.health.reasons.join('; ')}`);
    }
  }

  const ctx = {
    protocol: 'You have a persistent semantic memory system. If a ↣id might be important but you are unsure of the details, call.loom expand <id>. Before modifying an artifact, check governance / risks / decisions. If you reach a stable conclusion, propose creating a Task / Decision / Rule / Memory.',
    governance,
    activeTask,
    workingSet: workingSetEntries,
    decisions,
    risks,
    recovery: 'Last session ended normally.',
    dictionary,
    skills,
    recentFiles,
    fsHealthRisks: fsHealthRisks.slice(0, 5),
    diagnostics: runDoctor(projectRoot)
      .filter((r) => r.level !== 'ok')
      .map((r) => `[${r.level.toUpperCase()}] ${r.message}`)
      .slice(0, 5),
  };

  const prompt = buildSlotPrompt(ctx);
  writeActivePrompt(prompt);
  console.log(prompt);
}
