import { performFsScan } from './fs-scan.js';
import { drainWalAsync } from './wal-queue.js';

const dirs = JSON.parse(process.argv[2] || '[]') as string[];
const projectRoot = process.argv[3] || process.cwd();

performFsScan(dirs, projectRoot, { silent: true, updateTimestamp: true })
  .then(async () => {
    await drainWalAsync();
    if (process.send) {
      process.send({ success: true });
    } else {
      process.exit(0);
    }
  })
  .catch(async (err: Error) => {
    await drainWalAsync().catch(() => {});
    if (process.send) {
      process.send({ success: false, error: err.message });
    } else {
      console.error('[LOOM FS Scan Worker] Failed:', err);
      process.exit(1);
    }
  });
