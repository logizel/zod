import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { defineConfig } from 'vitest/config';

const here = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  test: {
    name: 'db-hot',
    environment: 'node',
    include: ['src/**/*.test.ts'],
    env: {
      JINA_API_KEY: 'test-jina-key',
    },
  },
  resolve: {
    alias: {
      '@zod/config': resolve(here, '../config/src/env.ts'),
      '@zod/dedup': resolve(here, '../dedup/src/fingerprint.ts'),
    },
  },
});
