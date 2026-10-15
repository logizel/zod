import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { defineConfig } from 'vitest/config';

const here = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  test: {
    name: 'llm',
    environment: 'node',
    include: ['src/**/*.test.ts'],
    // Dummy secrets so the env singleton (parsed at module top) constructs
    // under test; missing-secret behavior is asserted via parseEnv({}).
    env: {
      JINA_API_KEY: 'test-jina-key',
      PB_SERVICE_EMAIL: 'test@example.com',
      PB_SERVICE_PASSWORD: 'test-password',
      TURSO_DATABASE_URL: 'libsql://test.turso.io',
      TURSO_AUTH_TOKEN: 'test-token',
      GROQ_API_KEY: 'test-groq-key',
      GITHUB_TOKEN: 'test-github-token',
      DISCORD_TOKEN: 'test-discord-token',
    },
  },
  resolve: {
    alias: {
      '@zod/config': resolve(here, '../config/src/env.ts'),
      '@zod/db-hot$': resolve(here, '../db-hot/src/client.ts'),
      '@zod/db-hot/schema': resolve(here, '../db-hot/src/schema.ts'),
      '@zod/db-hot/scratchpad': resolve(here, '../db-hot/src/scratchpad.ts'),
      '@zod/db-hot/telemetry': resolve(here, '../db-hot/src/telemetry.ts'),
      '@zod/logger': resolve(here, '../logger/src/index.ts'),
      '@zod/scheduler-registry': resolve(here, '../scheduler/src/registry.ts'),
    },
  },
});
