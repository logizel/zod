import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { defineConfig } from 'vitest/config';

const here = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  test: {
    name: 'dashboard-server',
    environment: 'node',
    include: ['src/**/*.test.ts'],
    // Dummy secrets so importing the env singleton (parsed at module top in
    // index.ts) succeeds under test; missing-secret behavior is asserted via
    // parseEnv({}) elsewhere. index.ts itself is never imported by tests.
    env: {
      PB_URL: 'http://127.0.0.1:8090',
      PB_SERVICE_EMAIL: 'test@example.com',
      PB_SERVICE_PASSWORD: 'test-password',
      JINA_API_KEY: 'test-jina-key',
      TURSO_DATABASE_URL: 'libsql://test.turso.io',
      TURSO_AUTH_TOKEN: 'test-token',
      GROQ_API_KEY: 'test-groq-key',
      GITHUB_TOKEN: 'test-github-token',
      DISCORD_TOKEN: 'test-discord-token',
    },
  },
  resolve: {
    alias: {
      '@zod/db-hot/schema': resolve(here, '../../packages/db-hot/src/schema.ts'),
      '@zod/db-hot/telemetry': resolve(here, '../../packages/db-hot/src/telemetry.ts'),
      '@zod/db-hot': resolve(here, '../../packages/db-hot/src/client.ts'),
      '@zod/config': resolve(here, '../../packages/config/src/env.ts'),
      '@zod/logger': resolve(here, '../../packages/logger/src/index.ts'),
    },
  },
});
