import * as fs from 'node:fs';
import * as path from 'node:path';
import { parseYaml, stringifyYaml } from '../utils/yaml.js';

export interface CloudConfig {
  baseUrl?: string;
  token?: string;
  userToken?: string;
  registeredAt?: string;
}

export const CLOUD_CONFIG_PATH = path.join(
  process.env.HOME || process.env.USERPROFILE || '.',
  '.loom',
  'cloud.yml'
);

export function loadCloudConfig(): CloudConfig | null {
  if (!fs.existsSync(CLOUD_CONFIG_PATH)) return null;
  try {
    const raw = fs.readFileSync(CLOUD_CONFIG_PATH, 'utf-8');
    return parseYaml<CloudConfig>(raw, {});
  } catch {
    return null;
  }
}

export function saveCloudConfig(config: CloudConfig): void {
  fs.mkdirSync(path.dirname(CLOUD_CONFIG_PATH), { recursive: true });
  const tmpPath = `${CLOUD_CONFIG_PATH}.tmp-${Date.now()}`;
  const fd = fs.openSync(tmpPath, 'w', 0o600);
  try {
    fs.writeSync(fd, stringifyYaml(config));
  } finally {
    fs.closeSync(fd);
  }
  fs.renameSync(tmpPath, CLOUD_CONFIG_PATH);
}
