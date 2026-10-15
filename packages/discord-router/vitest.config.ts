import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { defineConfig } from 'vitest/config';

const here = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  test: {
    name: 'discord-router',
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
      '@zod/config': resolve(here, '../config/src/env.ts'),
      '@zod/db-hot$': resolve(here, '../db-hot/src/client.ts'),
      '@zod/db-hot/schema': resolve(here, '../db-hot/src/schema.ts'),
      '@zod/db-hot/scratchpad': resolve(here, '../db-hot/src/scratchpad.ts'),
      '@zod/sanitize$': resolve(here, '../sanitize/src/index.ts'),
      '@zod/sanitize/fetch': resolve(here, '../sanitize/src/fetch.ts'),
      '@zod/scheduler/jobs': resolve(here, '../scheduler/src/jobs.ts'),
      '@zod/browser': resolve(here, '../browser/src/index.ts'),
      '@zod/discord-router/portals/ctftime': resolve(here, './src/portals/ctftime.ts'),
      '@zod/discord-router/portals/clist': resolve(here, './src/portals/clist.ts'),
      '@zod/discord-router/portals/unstop': resolve(here, './src/portals/unstop.ts'),
      '@zod/discord-router/portals/devfolio': resolve(here, './src/portals/devfolio.ts'),
      '@zod/discord-router/portals/devpost': resolve(here, './src/portals/devpost.ts'),
      '@zod/discord-router/portals/luma': resolve(here, './src/portals/luma.ts'),
      '@zod/discord-router/portals/meetup': resolve(here, './src/portals/meetup.ts'),
    },
  },
});
