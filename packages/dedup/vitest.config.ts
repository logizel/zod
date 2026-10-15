import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    name: 'dedup',
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
