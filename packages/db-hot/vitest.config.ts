import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    name: 'db-hot',
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
