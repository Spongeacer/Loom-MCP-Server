import { taskTools } from './task-tools.js';
import { entryTools } from './entry-tools.js';
import { fsTools } from './fs-tools.js';
import { watchTools } from './watch-tools.js';
import { trashTools } from './trash-tools.js';
import { metaTools } from './meta-tools.js';
import { cloudTools } from './cloud-tools.js';
import { knowledgeTools } from './knowledge-tools.js';
import { lifecycleTools } from './lifecycle-tools.js';
import { sessionTools } from './session-tools.js';

export const loomTools = [
  ...sessionTools,
  ...taskTools,
  ...entryTools,
  ...fsTools,
  ...watchTools,
  ...trashTools,
  ...metaTools,
  ...cloudTools,
  ...knowledgeTools,
  ...lifecycleTools,
];
