import { initWorkspace, isInitialized } from '../core/store.js';

export function runInit(args: string[]): void {
  const projectName = args[0] || 'unnamed-project';
  if (isInitialized()) {
    console.log('LOOM workspace already initialized (.loom/ exists).');
    return;
  }
  initWorkspace(projectName);
  console.log(`LOOM workspace initialized for project: ${projectName}`);
  console.log('Storage: .loom/');
}
