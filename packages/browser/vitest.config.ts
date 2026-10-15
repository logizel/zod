import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    name: 'browser',
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
