import { describe, expect, it } from 'vitest';
import { parseEnv } from './env.js';

const REQUIRED = {
  JINA_API_KEY: 'jina-test',
  PB_SERVICE_EMAIL: 'owner@example.com',
  PB_SERVICE_PASSWORD: 's3cret',
  TURSO_DATABASE_URL: 'libsql://zod-turso.turso.io',
  TURSO_AUTH_TOKEN: 't0ken',
  GROQ_API_KEY: 'groq-test-key',
  DISCORD_TOKEN: 'discord-test-token',
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

  it('new channel keys default to empty string when absent, parseEnv still passes', () => {
    const parsed = parseEnv({ ...REQUIRED });
    expect(parsed.DISCORD_CHANNEL_JOBS_SYS_CLOUD).toBe('');
    expect(parsed.DISCORD_CHANNEL_JOBS_GENERAL).toBe('');
    expect(parsed.DISCORD_CHANNEL_LOOT).toBe('');
  });

  it('explicitly set channel IDs are returned as configured', () => {
    const parsed = parseEnv({
      ...REQUIRED,
      DISCORD_CHANNEL_JOBS_SYS_CLOUD: '111000000000000000',
      DISCORD_CHANNEL_JOBS_GENERAL: '222000000000000000',
      DISCORD_CHANNEL_LOOT: '333000000000000000',
    });
    expect(parsed.DISCORD_CHANNEL_JOBS_SYS_CLOUD).toBe('111000000000000000');
    expect(parsed.DISCORD_CHANNEL_JOBS_GENERAL).toBe('222000000000000000');
    expect(parsed.DISCORD_CHANNEL_LOOT).toBe('333000000000000000');
  });

  it('OPERATOR_USER_IDS defaults to empty string when absent, parseEnv still passes', () => {
    const parsed = parseEnv({ ...REQUIRED });
    expect(parsed.OPERATOR_USER_IDS).toBe('');
  });

  it('explicitly set OPERATOR_USER_IDS is returned as configured', () => {
    const parsed = parseEnv({
      ...REQUIRED,
      OPERATOR_USER_IDS: '123456789,987654321',
    });
    expect(parsed.OPERATOR_USER_IDS).toBe('123456789,987654321');
  });

  it('ACCESS_OWNER_EMAIL explicitly set to empty string parses to empty', () => {
    const parsed = parseEnv({ ...REQUIRED, ACCESS_OWNER_EMAIL: '' });
    expect(parsed.ACCESS_OWNER_EMAIL).toBe('');
  });

  it('ACCESS_OWNER_EMAIL absent defaults to empty string', () => {
    const parsed = parseEnv({ ...REQUIRED });
    expect(parsed.ACCESS_OWNER_EMAIL).toBe('');
  });

  it('ACCESS_OWNER_EMAIL preserves a valid owner address', () => {
    const parsed = parseEnv({ ...REQUIRED, ACCESS_OWNER_EMAIL: 'owner@example.com' });
    expect(parsed.ACCESS_OWNER_EMAIL).toBe('owner@example.com');
  });

  it('ACCESS_OWNER_EMAIL rejects a malformed non-empty value', () => {
    expect(() => parseEnv({ ...REQUIRED, ACCESS_OWNER_EMAIL: 'not-an-email' })).toThrow(
      /ACCESS_OWNER_EMAIL/,
    );
  });
});
