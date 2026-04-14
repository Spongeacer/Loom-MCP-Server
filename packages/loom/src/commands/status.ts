import { getWorkingSet, listEntries, getEntry, listBindings, saveWorkingSet, appendWal, getConfig, writeActivePrompt } from '../core/store.js';
import { ensureUserProfile } from '../core/user-profile.js';
import { buildSlotPrompt, computeRisks } from '../core/prompt-builder.js';
import { getRecentlyModifiedArtifacts } from '../core/fs-tracker.js';
import { shouldAutoScan, performFsScan } from '../core/fs-scan.js';
import type { Entry, ArtifactEntry } from '../types/index.js';

export async function runStatus(): Promise<void> {
  if (!getConfig()) {
    console.log('LOOM not initialized. Run:.loom init <project-name>');
    return;
  }

  const projectRoot = process.cwd();

  // Auto-trigger filesystem scan if stale (> 5 min since last scan)
  if (shouldAutoScan(projectRoot)) {
    await performFsScan(['src', 'tests', 'packages'], projectRoot, { silent: true, updateTimestamp: true });
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
    protocol: '你拥有持久语义协作记忆系统。如果某个 ↣id 可能重要但你不确定细节，调用.loom expand <id>。修改 artifact 前，优先查看其 governance / risks / decisions。如果形成稳定结论，可提议创建 Task / Decision / Rule / Memory。',
    governance,
    activeTask,
    workingSet: workingSetEntries,
    decisions,
    risks,
    recovery: '上次会话正常结束。',
    dictionary,
    recentFiles,
    fsHealthRisks: fsHealthRisks.slice(0, 5),
  };

  const prompt = buildSlotPrompt(ctx);
  writeActivePrompt(prompt);
  console.log(prompt);
}
