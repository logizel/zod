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
  // CR-02 / G-06-1: operator allowlist for DM taste-rule creation (Path 3).
  // Empty default = no operators authorized (fail-closed). Comma-separated
  // Discord user IDs.
  OPERATOR_USER_IDS: z.string().default(''),
  // Phase 6: local DK/Udupi domain inventory env override (D-01).
  LOCAL_WATCHLIST_DOMAINS: z.string().default(''),
  // Phase 6: X/LinkedIn session-cookie file path (D-07).
  SOCIAL_COOKIES_PATH: z.string().default(''),
  // Phase 6: external #announcements source channel for the relay (D-04).
  DISCORD_RELAY_SOURCE_CHANNEL_ID: z.string().default(''),
  // Phase 6: bucket channel IDs (env-ID-first resolution in router-service).
  BOOKMARK_EMOJI_ID: z.string().default(''),
  DISCORD_CHANNEL_LOCAL: z.string().default(''),
  DISCORD_CHANNEL_TRAVEL: z.string().default(''),
  DISCORD_CHANNEL_TBA: z.string().default(''),
  DISCORD_CHANNEL_RELAY: z.string().default(''),
  DISCORD_CHANNEL_TRAINING: z.string().default(''),
  // Phase 7: ops-health channel ID (env-ID-first, D-15).
  DISCORD_CHANNEL_OPS_HEALTH: z.string().default(''),
  // Phase 7: client staleness banner threshold in ms (D-07, ~15s heartbeat).
  STALENESS_THRESHOLD_MS: z.string().default('90000'),
  // Phase 7: hard cap on concurrent SSE streams (D-08, ~2 viewers).
  SSE_VIEWER_CAP: z.string().default('2'),
  // Phase 7: SSE connection timeout in ms (CR-04, reap stalled sockets).
  SSE_CONNECTION_TIMEOUT_MS: z.string().default('120000'),
  // Phase 7: GC 25h-missing alert threshold in hours (D-14).
  GC_ALERT_HOURS: z.string().default('25'),
  // G-07-WR-01: owner email for application-layer /api/stream auth check.
  // Accepts a valid address OR the literal empty string, because `.env.example`
  // ships `ACCESS_OWNER_EMAIL=` (present-but-empty) and the env gate must not
  // reject the repo's own convention. Empty stays fail-closed for the
  // application layer: authorizeStream (apps/dashboard-server/src/index.ts)
  // rejects a falsy identity header and requires an exact match, so an empty
  // owner email can never authorize a stream.
  ACCESS_OWNER_EMAIL: z.email().or(z.literal('')).default(''),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
});

export type Env = z.infer<typeof EnvSchema>;

export function parseEnv(input: unknown = process.env): Env {
  return EnvSchema.parse(input);
}

// Singleton for entrypoints: import this and boot fails loudly on bad env.
export const env: Env = parseEnv();
