import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { defineConfig } from 'vitest/config';

const here = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  test: {
    name: 'sanitize',
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
    },
  },
  resolve: {
    alias: {
      '@zod/config': resolve(here, '../config/src/env.ts'),
      '@zod/browser': resolve(here, '../browser/src/index.ts'),
    },
  },
});
