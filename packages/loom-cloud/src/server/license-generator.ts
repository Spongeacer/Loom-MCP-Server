/**
 * LOOM Cloud Sync — License Generator (Server-side tool)
 *
 * Usage:
 *   node dist/server/license-generator.js --tier pro --expires 2026-12-31 \
 *     --features cloudSync,crossProjectMemory,llmMerge \
 *     --private-key ~/.loom/license-private.pem
 *
 *   node dist/server/license-generator.js --generate-keypair
 */

import { readFileSync, existsSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

import {
  generateLicenseKeyPair,
  generateLicense,
  validateLicense,
  FEATURE_CLOUD_SYNC,
  FEATURE_CROSS_PROJECT,
  FEATURE_TEAM_SHARING,
  FEATURE_LLM_MERGE,
} from '../license.js';
import type { GenerateLicenseOptions } from '../license.js';

// ─────────────────────────────────────────────────────────────────────────────
// CLI
// ─────────────────────────────────────────────────────────────────────────────

function printUsage(): void {
  console.log(`
LOOM License Generator

Generate a new license key:
  node license-generator.js --tier <free|pro> [options]

Options:
  --tier <free|pro>              License tier (required)
  --expires <YYYY-MM-DD|lifetime> Expiration date or lifetime (default: lifetime)
  --features <f1,f2,...>         Comma-separated feature list:
                                 cloudSync, crossProjectMemory, teamSharing, llmMerge
  --private-key <path>           Path to Ed25519 private key PEM (default: ~/.loom/license-private.pem)
  --output <path>                Write license key to file instead of stdout

Generate a new keypair:
  node license-generator.js --generate-keypair [--output-dir <dir>]

Validate an existing license:
  node license-generator.js --validate <license-key> [--public-key <path>]
`);
}

function parseArgs(argv: string[]): Record<string, string | boolean> {
  const args: Record<string, string | boolean> = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg.startsWith('--')) {
      const key = arg.slice(2).replace(/-/g, '_');
      const next = argv[i + 1];
      if (next && !next.startsWith('--')) {
        args[key] = next;
        i++;
      } else {
        args[key] = true;
      }
    }
  }
  return args;
}

function main(): void {
  const args = parseArgs(process.argv.slice(2));

  if (args.help || args.h || Object.keys(args).length === 0) {
    printUsage();
    process.exit(0);
  }

  // ── Generate keypair ─────────────────────────────────────────────────────
  if (args.generate_keypair) {
    const { publicKey, privateKey } = generateLicenseKeyPair();
    const outputDir = typeof args.output_dir === 'string' ? args.output_dir : join(homedir(), '.loom');

    if (!existsSync(outputDir)) {
      // Node 18 mkdirSync doesn't accept { recursive } in all envs
      try {
        const { mkdirSync } = require('node:fs');
        mkdirSync(outputDir, { recursive: true });
      } catch {
        console.error(`Failed to create directory: ${outputDir}`);
        process.exit(1);
      }
    }

    const pubPath = join(outputDir, 'license-public.pem');
    const privPath = join(outputDir, 'license-private.pem');

    writeFileSync(pubPath, publicKey, { mode: 0o644 });
    writeFileSync(privPath, privateKey, { mode: 0o600 });

    console.log(`Keypair generated:
  Public:  ${pubPath}
  Private: ${privPath}

Embed the public key in loom-cloud/src/license.ts (EMBEDDED_PUBLIC_KEY_HEX)
for device-side offline validation.`);
    process.exit(0);
  }

  // ── Validate license ─────────────────────────────────────────────────────
  if (typeof args.validate === 'string') {
    const licenseKey = args.validate;
    let publicKeyPem: string | undefined;
    if (typeof args.public_key === 'string') {
      publicKeyPem = readFileSync(args.public_key, 'utf-8');
    }
    const result = validateLicense(licenseKey, publicKeyPem);
    console.log(`Valid: ${result.valid}`);
    console.log(`Reason: ${result.reason}`);
    if (result.license) {
      console.log(`Tier: ${result.license.tier}`);
      console.log(`Expires: ${result.license.expiresAt ? new Date(result.license.expiresAt * 1000).toISOString() : 'never'}`);
      console.log(`Features:`, result.license.features);
    }
    process.exit(result.valid ? 0 : 1);
  }

  // ── Generate license ─────────────────────────────────────────────────────
  const tier = args.tier;
  if (tier !== 'free' && tier !== 'pro') {
    console.error('Error: --tier must be "free" or "pro"');
    process.exit(1);
  }

  let expiresAt: number | null = null;
  if (typeof args.expires === 'string' && args.expires !== 'lifetime') {
    const d = new Date(args.expires);
    if (isNaN(d.getTime())) {
      console.error(`Error: invalid date: ${args.expires}`);
      process.exit(1);
    }
    expiresAt = Math.floor(d.getTime() / 1000);
  }

  const features: GenerateLicenseOptions['features'] = {};
  if (typeof args.features === 'string') {
    const list = args.features.split(',').map((s) => s.trim());
    for (const f of list) {
      switch (f) {
        case 'cloudSync': features.cloudSync = true; break;
        case 'crossProjectMemory': features.crossProjectMemory = true; break;
        case 'teamSharing': features.teamSharing = true; break;
        case 'llmMerge': features.llmMerge = true; break;
        default:
          console.error(`Unknown feature: ${f}`);
          process.exit(1);
      }
    }
  }

  // Default features for pro tier
  if (tier === 'pro' && !args.features) {
    features.cloudSync = true;
    features.crossProjectMemory = true;
    features.llmMerge = true;
  }

  const privateKeyPath =
    typeof args.private_key === 'string'
      ? args.private_key
      : join(homedir(), '.loom', 'license-private.pem');

  if (!existsSync(privateKeyPath)) {
    console.error(`Private key not found: ${privateKeyPath}`);
    console.error('Run with --generate-keypair first.');
    process.exit(1);
  }

  const privateKeyPem = readFileSync(privateKeyPath, 'utf-8');
  const licenseKey = generateLicense(privateKeyPem, {
    tier,
    expiresAt,
    features,
  });

  if (typeof args.output === 'string') {
    writeFileSync(args.output, licenseKey);
    console.log(`License written to: ${args.output}`);
  } else {
    console.log(licenseKey);
  }
}

main();
