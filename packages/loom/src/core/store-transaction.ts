import { withFileLockSync, withFileLock } from './lock.js';
import { invalidateCache } from './store.js';

export function withStoreTransaction<T>(projectRoot: string, fn: () => T): T {
  return withFileLockSync(
    projectRoot,
    'store',
    () => {
      const result = fn();
      invalidateCache(projectRoot);
      return result;
    },
    5000
  );
}

export async function withStoreTransactionAsync<T>(
  projectRoot: string,
  fn: () => Promise<T>
): Promise<T> {
  return withFileLock(
    projectRoot,
    'store',
    async () => {
      const result = await fn();
      invalidateCache(projectRoot);
      return result;
    },
    5000
  );
}
