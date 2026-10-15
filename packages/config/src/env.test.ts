import { describe, expect, it } from 'vitest';
import { parseEnv } from './env.js';

const REQUIRED = {
  JINA_API_KEY: 'jina-test',
  PB_SERVICE_EMAIL: 'owner@example.com',
  PB_SERVICE_PASSWORD: 's3cret',
  TURSO_DATABASE_URL: 'libsql://zod-turso.turso.io',
  TURSO_AUTH_TOKEN: 't0ken',
} as const;

describe('parseEnv', () => {
  it('throws naming the missing key when required secrets are absent', () => {
    expect(() => parseEnv({})).toThrow(/PB_SERVICE_EMAIL/);
  });

  it('names each missing required secret individually', () => {
    for (const key of Object.keys(REQUIRED)) {
      const { [key as keyof typeof REQUIRED]: _omitted, ...rest } = { ...REQUIRED };
      expect(() => parseEnv(rest), key).toThrow(new RegExp(key));
    }
  });

  it('applies loopback PB URL and info log-level defaults', () => {
    const parsed = parseEnv({ ...REQUIRED });
    expect(parsed.PB_URL).toBe('http://127.0.0.1:8090');
    expect(parsed.LOG_LEVEL).toBe('info');
  });

  it('accepts explicit PB URL and log-level overrides', () => {
    const parsed = parseEnv({ ...REQUIRED, PB_URL: 'http://127.0.0.1:8091', LOG_LEVEL: 'debug' });
    expect(parsed.PB_URL).toBe('http://127.0.0.1:8091');
    expect(parsed.LOG_LEVEL).toBe('debug');
  });
});
