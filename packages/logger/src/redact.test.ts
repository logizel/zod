import { describe, expect, it } from 'vitest';
import pino from 'pino';
import { REDACT_CENSOR, REDACT_PATHS, createLogger } from './index.js';

const SECRETS = {
  PB_SERVICE_PASSWORD: 'super-secret-pw',
  TURSO_AUTH_TOKEN: 'turso-token-value',
  password: 'pw123',
  token: 'tok456',
  secret: 'shh789',
  cookie: 'sess=abc',
  authToken: 'at-xyz',
};

describe('redacting logger', () => {
  it('censors every secret-shaped field and passes ordinary fields through', () => {
    const chunks: string[] = [];
    const sink = {
      write(chunk: string): void {
        chunks.push(chunk);
      },
    };
    const log = createLogger(
      'info',
      sink as unknown as pino.DestinationStream,
    );
    log.info({
      ...SECRETS,
      nested: { password: 'nested-pw', token: 'nested-tok' },
      headers: { authorization: 'Bearer abc123', cookie: 'sess=1' },
      ordinary: 'visible-value',
    });

    const out = chunks.join('');
    for (const value of [...Object.values(SECRETS), 'nested-pw', 'nested-tok', 'Bearer abc123', 'sess=1']) {
      expect(out, `leaked: ${value}`).not.toContain(value);
    }
    expect(out).toContain(REDACT_CENSOR);
    expect(out).toContain('visible-value');
    expect(REDACT_PATHS.length).toBeGreaterThan(0);
  });
});
