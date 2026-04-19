import type { StoreAdapter, TaskEntry, ArtifactEntry } from '@spongeacer/loom-core';
import { buildSlotPrompt } from '@spongeacer/loom-core';

export async function runStatus(store: StoreAdapter, args: string[]): Promise<string> {
  if (!store.isInitialized()) {
    return 'LOOM not initialized. Run: loom init <project-name>';
  }

  if (args.includes('--json')) {
    const entries = store.listEntries();
    const ws = store.getWorkingSet();
    const activeTask = ws.active_task
      ? entries.find((e) => e.id === ws.active_task && e.type === 'Task')
      : undefined;

    const status = {
      activeTask: activeTask
        ? {
            id: activeTask.id,
            title: activeTask.content.l1_5,
            current: (activeTask as TaskEntry).task?.progress?.current,
          }
        : undefined,
      decisions: entries
        .filter((e) => e.type === 'Decision')
        .map((e) => ({ id: e.id, title: e.content.l1_5 })),
      risks: entries
        .filter(
          (e) =>
            e.quality.composite_score < 0.5 ||
            e.lifecycle.state === 'stale' ||
            e.conflicts.conflicts_with.length > 0
        )
        .map((e) => `${e.id}: ${e.content.l1_5}`),
      fsHealth: entries
        .filter(
          (e): e is ArtifactEntry =>
            e.type === 'Artifact' && e.artifact.health.status !== 'healthy'
        )
        .map((e) => `${e.artifact.path}: ${e.artifact.health.status}`),
      workingSet: {
        pinned: ws.pinned_entries,
        hot: ws.hot_entries,
      },
      artifacts: entries
        .filter((e): e is ArtifactEntry => e.type === 'Artifact')
        .map((e) => ({
          id: e.id,
          path: e.artifact.path,
          status: e.artifact.health.status,
        })),
      skills: entries
        .filter((e) => e.type === 'Skill')
        .map((e) => ({ id: e.id, title: e.content.l1_5 })),
      memories: entries
        .filter((e) => e.type === 'Memory')
        .map((e) => ({ id: e.id, title: e.content.l1_5 })),
      bindings: store
        .listBindings()
        .map((b) => ({ source: b.source, target: b.target, rel: b.relationship })),
    };
    return JSON.stringify(status);
  }

  const prompt = buildSlotPrompt(store);
  store.writeActivePrompt(prompt);
  return prompt;
}
