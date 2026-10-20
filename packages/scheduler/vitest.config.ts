import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { defineConfig } from 'vitest/config';

const here = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  test: {
    name: 'scheduler',
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
      '@zod/dedup$': resolve(here, '../dedup/src/fingerprint.ts'),
      '@zod/dedup/precheck': resolve(here, '../dedup/src/precheck.ts'),
      '@zod/dedup/merger': resolve(here, '../dedup/src/merger.ts'),
      '@zod/scout$': resolve(here, '../scout/src/index.ts'),
      '@zod/scout/jobs-screen': resolve(here, '../scout/src/jobs-screen.ts'),
      '@zod/db-hot$': resolve(here, '../db-hot/src/client.ts'),
      '@zod/db-hot/scratchpad': resolve(here, '../db-hot/src/scratchpad.ts'),
      '@zod/sanitize$': resolve(here, '../sanitize/src/index.ts'),
      '@zod/discord-router/portals/types': resolve(here, '../discord-router/src/portals/types.ts'),
      '@zod/discord-router/portals/ctftime': resolve(here, '../discord-router/src/portals/ctftime.ts'),
      '@zod/discord-router/portals/clist': resolve(here, '../discord-router/src/portals/clist.ts'),
      '@zod/discord-router/portals/unstop': resolve(here, '../discord-router/src/portals/unstop.ts'),
      '@zod/discord-router/portals/devfolio': resolve(here, '../discord-router/src/portals/devfolio.ts'),
      '@zod/discord-router/portals/devpost': resolve(here, '../discord-router/src/portals/devpost.ts'),
      '@zod/discord-router/portals/luma': resolve(here, '../discord-router/src/portals/luma.ts'),
      '@zod/discord-router/portals/meetup': resolve(here, '../discord-router/src/portals/meetup.ts'),
    },
  },
});
