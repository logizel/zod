import { defineConfig } from 'vitest/config';

// NOTE: vitest v3 workspace key is `workspace`. `projects` is v5-only — do not rename.
export default defineConfig({
  test: {
    workspace: ['./packages/*/vitest.config.ts'],
  },
});
