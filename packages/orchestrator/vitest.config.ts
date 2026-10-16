import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { defineConfig } from 'vitest/config';

const here = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  test: {
    name: 'orchestrator',
    environment: 'node',
    include: ['src/**/*.test.ts'],
    env: {
      PB_SERVICE_EMAIL: 'test@example.com',
      PB_SERVICE_PASSWORD: 'test-password',
      TURSO_DATABASE_URL: 'libsql://test.turso.io',
      TURSO_AUTH_TOKEN: 'test-token',
      JINA_API_KEY: 'test-jina-key',
      GROQ_API_KEY: 'test-groq-key',
      GITHUB_TOKEN: 'test-github-token',
      DISCORD_TOKEN: 'test-discord-token',
      SAMBANOVA_API_KEY: '',
    },
  },
  resolve: {
    alias: {
      '@zod/config$': resolve(here, '../config/src/env.ts'),
      '@zod/config/jobs-policy': resolve(here, '../config/src/jobs-policy.ts'),
      '@zod/db-hot/schema': resolve(here, '../db-hot/src/schema.ts'),
      '@zod/db-hot/scratchpad': resolve(here, '../db-hot/src/scratchpad.ts'),
      '@zod/dedup': resolve(here, '../dedup/src/fingerprint.ts'),
      '@zod/dedup/precheck': resolve(here, '../dedup/src/precheck.ts'),
      '@zod/llm': resolve(here, '../llm/src/router.ts'),
      '@zod/logger': resolve(here, '../logger/src/index.ts'),
      '@zod/scheduler-registry': resolve(here, '../scheduler/src/registry.ts'),
      '@zod/sanitize/fetch': resolve(here, '../sanitize/src/fetch.ts'),
      '@zod/sanitize': resolve(here, '../sanitize/src/index.ts'),
      '@zod/scout': resolve(here, '../scout/src/index.ts'),
      '@zod/discord-router/link-hop': resolve(here, '../discord-router/src/link-hop.ts'),
      '@zod/discord-router/prize-gate': resolve(here, '../discord-router/src/prize-gate.ts'),
      '@zod/discord-router/domain-filter': resolve(here, '../discord-router/src/domain-filter.ts'),
      '@zod/discord-router/portals/ctftime': resolve(here, '../discord-router/src/portals/ctftime.ts'),
    },
  },
});
