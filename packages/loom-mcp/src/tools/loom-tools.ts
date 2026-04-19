import { taskTools } from './task-tools.js';
import { entryTools } from './entry-tools.js';
import { fsTools } from './fs-tools.js';
import { watchTools } from './watch-tools.js';
import { trashTools } from './trash-tools.js';
import { metaTools } from './meta-tools.js';

export const loomTools = [
  ...taskTools,
  ...entryTools,
  ...fsTools,
  ...watchTools,
  ...trashTools,
  ...metaTools,
];
