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
    },
  },
  resolve: {
    alias: {
      '@zod/config': resolve(here, '../config/src/env.ts'),
      '@zod/dedup$': resolve(here, '../dedup/src/fingerprint.ts'),
      '@zod/dedup/precheck': resolve(here, '../dedup/src/precheck.ts'),
      '@zod/scout$': resolve(here, '../scout/src/index.ts'),
      '@zod/db-hot$': resolve(here, '../db-hot/src/client.ts'),
      '@zod/db-hot/scratchpad': resolve(here, '../db-hot/src/scratchpad.ts'),
      '@zod/sanitize$': resolve(here, '../sanitize/src/index.ts'),
    },
  },
});
