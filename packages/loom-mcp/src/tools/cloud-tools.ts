import type { ToolResult } from '@spongeacer/loom-core';
import { CloudApiClient, loadCloudConfig } from '@spongeacer/loom-core';
import { ok, err } from './common.js';

export const cloudTools = [
  {
    name: 'loom_activate_license',
    description: 'Activate a LOOM Cloud license key. Requires prior signup/login.',
    inputSchema: {
      type: 'object',
      properties: {
        license_key: { type: 'string', description: 'License key, e.g. LOOM-BETA-XXXX-XXXX-XXXX' },
      },
      required: ['license_key'],
    },
    handler: async (args: Record<string, unknown>): Promise<ToolResult> => {
      const licenseKey = String(args.license_key || '');
      if (!licenseKey) return err('license_key is required');

      const config = loadCloudConfig();
      if (!config?.userToken || !config.baseUrl) {
        return err('No user token found. Run loom cloud signup/login first.');
      }

      const client = new CloudApiClient({ baseUrl: config.baseUrl });
      const result = await client.activate(config.userToken, licenseKey);

      if (!result.ok) {
        return err(`Activation failed: ${result.error || 'Unknown error'}`);
      }

      return ok(`License activated! Tier: ${result.tier}, Features: ${result.features}`);
    },
  },
  {
    name: 'loom_cloud_status',
    description: 'Show LOOM Cloud connection and license status',
    inputSchema: { type: 'object', properties: {} },
    handler: async (): Promise<ToolResult> => {
      const config = loadCloudConfig();
      if (!config?.token || !config.baseUrl) {
        return ok('Not registered to any cloud server.');
      }

      const client = new CloudApiClient({ baseUrl: config.baseUrl });
      const license = await client.getLicenseStatus(config.token);

      const lines: string[] = [];
      lines.push(`Base URL: ${config.baseUrl}`);
      if (license.ok && license.active) {
        lines.push(`License: active (${license.tier})`);
        lines.push(`Expires: ${license.expiresAt ? new Date(license.expiresAt * 1000).toISOString() : 'never'}`);
      } else {
        lines.push('License: inactive');
      }
      return ok(lines.join('\n'));
    },
  },
];
