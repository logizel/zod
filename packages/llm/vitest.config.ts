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
    // Optional LLM keys are pinned empty so the ladder tests are hermetic and
    // never pick up a developer's real .env (dotenv does not override these).
    env: {
      JINA_API_KEY: 'test-jina-key',
      PB_SERVICE_EMAIL: 'test@example.com',
      PB_SERVICE_PASSWORD: 'test-password',
      TURSO_DATABASE_URL: 'libsql://test.turso.io',
      TURSO_AUTH_TOKEN: 'test-token',
      GROQ_API_KEY: 'test-groq-key',
      GITHUB_TOKEN: 'test-github-token',
      DISCORD_TOKEN: 'test-discord-token',
      SAMBANOVA_API_KEY: '',
      MISTRAL_API_KEY: '',
      ZAI_API_KEY: '',
      NVIDIA_API_KEY: '',
      OPENROUTER_API_KEY: '',
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
