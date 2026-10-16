import * as z from 'zod';
import 'dotenv/config';

// Fail-fast env gate (D-06/D-07): dotenv loads `.env`, zod parses + validates.
// PB_URL defaults to the loopback PB address; every credential is required.
// Throws on missing/invalid secrets BEFORE any client constructs.
export const EnvSchema = z.object({
  PB_URL: z.string().default('http://127.0.0.1:8090'),
  PB_SERVICE_EMAIL: z.email(),
  PB_SERVICE_PASSWORD: z.string().min(1),
  JINA_API_KEY: z.string().min(1),
  TURSO_DATABASE_URL: z.string(),
  TURSO_AUTH_TOKEN: z.string().min(1),
  GROQ_API_KEY: z.string().min(1),
  GITHUB_TOKEN: z.string().min(1),
  SAMBANOVA_API_KEY: z.string().default(''),
  DISCORD_TOKEN: z.string().min(1),
  // D-14 / Pitfall 8: channel IDs for the three new job/loot buckets.
  // Empty default keeps boot passing when env is unset; resolveChannel uses
  // these IDs first, falling back to exact channel-name matching.
  DISCORD_CHANNEL_JOBS_SYS_CLOUD: z.string().default(''),
  DISCORD_CHANNEL_JOBS_GENERAL: z.string().default(''),
  DISCORD_CHANNEL_LOOT: z.string().default(''),
  // D-06: fellowship allowlist extension — operator-extensible without a
  // release. getFellowshipAllowlist() merges this into the config default.
  FELLOWSHIP_ALLOWLIST_EXTRA: z.string().default(''),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
});

export type Env = z.infer<typeof EnvSchema>;

export function parseEnv(input: unknown = process.env): Env {
  return EnvSchema.parse(input);
}

// Singleton for entrypoints: import this and boot fails loudly on bad env.
export const env: Env = parseEnv();
