import { FileSystemStoreAdapter } from '@spongeacer/loom-core';
import type { StoreAdapter } from '@spongeacer/loom-core';

let _store: FileSystemStoreAdapter | null = null;
let _storeCwd: string | undefined;

export function getStore(cwd?: string): StoreAdapter {
  if (!_store || (cwd && cwd !== _storeCwd)) {
    _store = new FileSystemStoreAdapter(cwd);
    _storeCwd = cwd ?? process.cwd();
  }
  return _store;
}

export function getStoreCwd(): string {
  return _storeCwd ?? process.cwd();
}

export function resetStore(): void {
  _store = null;
  _storeCwd = undefined;
}
