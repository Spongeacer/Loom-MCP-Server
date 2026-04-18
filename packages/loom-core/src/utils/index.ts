export {
  safeUnlink,
  safeUnlinkAsync,
  safeMkdir,
  atomicWriteFile,
  readTextFile,
  pathExists,
  safeReaddir,
} from './fs-safe.js';

export {
  generateEd25519KeyPair,
  signChallenge,
  verifySignature,
  fingerprintPublicKey,
} from './crypto.js';

export { parseYaml, stringifyYaml } from './yaml.js';

export {
  writePidFile,
  touchHealthFile,
  readDaemonStatus,
  stopDaemon,
} from './pid-file.js';
export type { DaemonStatus } from './pid-file.js';

export {
  registerCleanup,
  gracefulShutdown,
  installSignalHandlers,
} from './shutdown.js';
export type { CleanupFn } from './shutdown.js';

export {
  acquireLockSync,
  releaseLockSync,
  withFileLockSync,
  withFileLock,
  isProcessAlive,
} from './lock.js';
