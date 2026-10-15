import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { defineConfig } from 'vitest/config';

const here = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  test: {
    name: 'logger',
    environment: 'node',
    include: ['src/**/*.test.ts'],
    // Dummy secrets so the logger singleton (built from env at module top)
    // constructs under test; redaction itself is asserted on literal values.
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
    // Resolve the workspace sibling to source until dist is built.
    alias: { '@zod/config': resolve(here, '../config/src/env.ts') },
  },
});
