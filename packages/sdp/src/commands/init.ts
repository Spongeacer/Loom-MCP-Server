import { initWorkspace, isInitialized } from '../core/store.js';

export function runInit(args: string[]): void {
  const projectName = args[0] || 'unnamed-project';
  if (isInitialized()) {
    console.log('SDP workspace already initialized (.sdp/ exists).');
    return;
  }
  initWorkspace(projectName);
  console.log(`SDP workspace initialized for project: ${projectName}`);
  console.log('Storage: .sdp/');
}
