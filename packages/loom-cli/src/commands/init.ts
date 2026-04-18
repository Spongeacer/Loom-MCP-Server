import type { StoreAdapter } from '@loom/core';

export function runInit(args: string[], store: StoreAdapter): string {
  const projectName = args[0];
  if (!projectName) {
    return 'Usage: loom init <project-name>';
  }
  if (store.isInitialized()) {
    return 'LOOM already initialized in this directory.';
  }
  store.initWorkspace(projectName);
  return `Initialized LOOM workspace for "${projectName}".`;
}
