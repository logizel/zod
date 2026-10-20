// Env-drift bijection guard: .env.example ↔ EnvSchema keys must stay locked
// in both directions, permanently.  This is the Pitfall-10 control (T-05-31):
// any new env key added to EnvSchema must be mirrored in .env.example and
// vice versa, so the drift that 05-08 fixed can never silently return.
//
// Reads .env.example from the repo root, parses KEY= lines, and asserts:
//   1. every schema key appears in .env.example exactly once
//   2. every .env.example key exists in EnvSchema
//   3. no duplicate keys in .env.example
//   4. canary keys (channel IDs + Pitfall-10 drift keys) on both sides

import { describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { EnvSchema } from './env.js';

const ENV_EXAMPLE_PATH = path.resolve(__dirname, '../../../.env.example');

function parseEnvExample(content: string): string[] {
  return content
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith('#'))
    .map((line) => line.split('=')[0].trim())
    .filter((key) => key.length > 0);
}

const schemaKeys = Object.keys(EnvSchema.shape);
const exampleContent = fs.readFileSync(ENV_EXAMPLE_PATH, 'utf-8');
const exampleKeys = parseEnvExample(exampleContent);

describe('env-drift bijection (.env.example ↔ EnvSchema)', () => {
  it('every EnvSchema key appears in .env.example exactly once', () => {
    const missing: string[] = [];
    const duplicates: string[] = [];

    for (const key of schemaKeys) {
      const count = exampleKeys.filter((k) => k === key).length;
      if (count === 0) missing.push(key);
      if (count > 1) duplicates.push(key);
    }

    expect(missing, `EnvSchema keys missing from .env.example: ${missing.join(', ')}`).toEqual([]);
    expect(duplicates, `Duplicate keys in .env.example: ${duplicates.join(', ')}`).toEqual([]);
  });

  it('every .env.example key exists in EnvSchema', () => {
    const extra: string[] = [];

    for (const key of exampleKeys) {
      if (!schemaKeys.includes(key)) extra.push(key);
    }

    expect(extra, `.env.example keys not in EnvSchema: ${extra.join(', ')}`).toEqual([]);
  });

  it('no duplicate keys in .env.example', () => {
    const seen = new Set<string>();
    const duplicates: string[] = [];

    for (const key of exampleKeys) {
      if (seen.has(key)) duplicates.push(key);
      seen.add(key);
    }

    expect(duplicates, `Duplicate keys in .env.example: ${duplicates.join(', ')}`).toEqual([]);
  });

  it('canary keys present on both sides (channel IDs + Pitfall-10 drift keys)', () => {
    const canaryKeys = [
      'DISCORD_CHANNEL_JOBS_SYS_CLOUD',
      'DISCORD_CHANNEL_JOBS_GENERAL',
      'DISCORD_CHANNEL_LOOT',
      'DISCORD_CHANNEL_PRIORITY_SYS_CP_SEC',
      'DISCORD_CHANNEL_ONLINE_1LAKH',
      'JINA_API_KEY',
      'GROQ_API_KEY',
      'GITHUB_TOKEN',
      'SAMBANOVA_API_KEY',
    ];

    const missingFromSchema = canaryKeys.filter((k) => !schemaKeys.includes(k));
    const missingFromExample = canaryKeys.filter((k) => !exampleKeys.includes(k));

    expect(missingFromSchema, `Canary keys missing from EnvSchema: ${missingFromSchema.join(', ')}`).toEqual([]);
    expect(missingFromExample, `Canary keys missing from .env.example: ${missingFromExample.join(', ')}`).toEqual([]);
  });

  it('schema and example key sets are identical (bijection)', () => {
    const schemaSet = new Set(schemaKeys);
    const exampleSet = new Set(exampleKeys);

    const onlyInSchema = schemaKeys.filter((k) => !exampleSet.has(k));
    const onlyInExample = exampleKeys.filter((k) => !schemaSet.has(k));

    expect(onlyInSchema, `Keys only in EnvSchema (missing from .env.example): ${onlyInSchema.join(', ')}`).toEqual([]);
    expect(onlyInExample, `Keys only in .env.example (missing from EnvSchema): ${onlyInExample.join(', ')}`).toEqual([]);
  });
});
