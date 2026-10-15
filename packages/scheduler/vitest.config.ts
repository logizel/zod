import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    name: 'scheduler',
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
