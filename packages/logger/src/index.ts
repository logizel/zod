import pino from 'pino';
import type { Logger } from 'pino';
import { env } from '@zod/config';

// Every secret-shaped field plus credential names plus auth headers.
// Top-level names AND one-level-deep wildcards: convention is flat or
// single-nested secret objects (see redact.test.ts).
export const REDACT_PATHS: string[] = [
  'password',
  'token',
  'secret',
  'cookie',
  'authToken',
  'authorization',
  '*.password',
  '*.token',
  '*.secret',
  '*.cookie',
  '*.authToken',
  'TURSO_AUTH_TOKEN',
  'PB_SERVICE_PASSWORD',
  'JINA_API_KEY',
  'headers.authorization',
  'headers.cookie',
  'GROQ_API_KEY',
  'GITHUB_TOKEN',
  'SAMBANOVA_API_KEY',
];

export const REDACT_CENSOR = '[Redacted]';

export function createLogger(level: string = 'info', destination?: pino.DestinationStream): Logger {
  const options = {
    level,
    redact: { paths: REDACT_PATHS, censor: REDACT_CENSOR },
  };
  if (destination) {
    return pino(options, destination);
  }
  // pino-pretty transport is dev-only (LOG_PRETTY=1 on a workstation).
  // Never enabled on the VM: raw JSON to stdout stays journald-friendly.
  if (process.env.LOG_PRETTY === '1') {
    return pino(options, pino.transport({ target: 'pino-pretty', options: { colorize: true } }));
  }
  return pino(options);
}

// Base singleton: level comes from the fail-fast env gate above.
export const logger: Logger = createLogger(env.LOG_LEVEL);

// Per-pipeline child bindings, e.g. child({ pipeline: 'scout/events' }).
export function child(bindings: Record<string, unknown>): Logger {
  return logger.child(bindings);
}

export type { Logger };
