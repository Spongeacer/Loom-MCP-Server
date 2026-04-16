import { initWorkspace, isInitialized } from '../core/store.js';

export function runInit(args: string[]): string {
  const projectName = args[0] || 'unnamed-project';
  if (isInitialized()) {
    throw new Error('LOOM workspace already initialized (.loom/ exists).');
  }
  initWorkspace(projectName);
  return `LOOM workspace initialized for project: ${projectName}\nStorage: .loom/`;
}
