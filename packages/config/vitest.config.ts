import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    name: 'config',
    environment: 'node',
    include: ['src/**/*.test.ts'],
    // Dummy secrets so importing the env singleton (parsed at module top)
    // succeeds under test; missing-secret behavior is asserted via parseEnv({}).
    env: {
      JINA_API_KEY: 'test-jina-key',
      PB_SERVICE_EMAIL: 'test@example.com',
      PB_SERVICE_PASSWORD: 'test-password',
      TURSO_DATABASE_URL: 'libsql://test.turso.io',
      TURSO_AUTH_TOKEN: 'test-token',
      GROQ_API_KEY: 'test-groq-key',
      GITHUB_TOKEN: 'test-github-token',
      DISCORD_TOKEN: 'test-discord-token',
    },
  },
});
