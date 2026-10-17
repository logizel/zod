# Phase 4: Events Vertical Slice - Pattern Map

**Mapped:** 2026-10-16
**Files analyzed:** 23 new/modified
**Analogs found:** 18 / 23 (5 greenfield, no close analog)

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `packages/discord-router/package.json` | config | config | `packages/scheduler/package.json` | exact |
| `packages/discord-router/tsconfig.json` | config | config | `packages/scheduler/tsconfig.json` | exact |
| `packages/discord-router/vitest.config.ts` | config | config | `packages/scheduler/vitest.config.ts` | exact |
| `packages/discord-router/src/globals.d.ts` | config | config | `packages/scheduler/src/globals.d.ts` | exact |
| `packages/discord-router/src/index.ts` | entry | request-response | `apps/scheduler/src/index.ts` | exact |
| `packages/discord-router/src/gateway.ts` | service | request-response | `packages/llm/src/router.ts` | role-match |
| `packages/discord-router/src/router-service.ts` | service | CRUD | `packages/db-hot/src/scratchpad.ts` | role-match |
| `packages/discord-router/src/embed.ts` | component | transform | — (greenfield, RESEARCH.md Pattern 2) | none |
| `packages/discord-router/src/link-hop.ts` | utility | request-response | `packages/sanitize/src/fetch.ts` | exact |
| `packages/discord-router/src/domain-filter.ts` | utility | request-response | `packages/scout/src/index.ts` | exact |
| `packages/discord-router/src/prize-gate.ts` | utility | request-response | `packages/scout/src/spam.ts` | role-match |
| `packages/discord-router/src/portals/unstop.ts` | controller | CRUD | `packages/scheduler/src/jobs.ts` (POLL_CANDIDATES) | role-match |
| `packages/discord-router/src/portals/devfolio.ts` | controller | CRUD | `packages/scheduler/src/jobs.ts` (POLL_CANDIDATES) | role-match |
| `packages/discord-router/src/portals/devpost.ts` | controller | CRUD | `packages/scheduler/src/jobs.ts` (POLL_CANDIDATES) | role-match |
| `packages/discord-router/src/portals/luma.ts` | controller | CRUD | `packages/scheduler/src/jobs.ts` (POLL_CANDIDATES) | role-match |
| `packages/discord-router/src/portals/meetup.ts` | controller | CRUD | `packages/scheduler/src/jobs.ts` (POLL_CANDIDATES) | role-match |
| `packages/discord-router/src/portals/ctftime.ts` | controller | CRUD | `packages/scheduler/src/jobs.ts` (POLL_CANDIDATES) | role-match |
| `packages/discord-router/src/portals/clist.ts` | controller | CRUD | `packages/scheduler/src/jobs.ts` (POLL_CANDIDATES) | role-match |
| `packages/discord-router/src/link-hop.test.ts` | test | request-response | `packages/scheduler/src/poll-wiring.test.ts` | role-match |
| `packages/discord-router/src/domain-filter.test.ts` | test | request-response | `packages/scout/src/scout.test.ts` | role-match |
| `packages/discord-router/src/prize-gate.test.ts` | test | request-response | `packages/scout/src/spam.test.ts` | role-match |
| `packages/discord-router/src/embed.test.ts` | test | transform | `packages/llm/src/router.test.ts` | role-match |
| `packages/discord-router/src/portals/*.test.ts` | test | CRUD | `packages/scheduler/src/poll-wiring.test.ts` | role-match |
| `packages/scheduler/src/jobs.ts` (modify) | config | config | itself (existing) | exact |
| `packages/config/src/env.ts` (modify) | config | config | itself (existing) | exact |
| `.env.example` (modify) | config | config | itself (existing) | exact |

---

## Pattern Assignments

### `packages/discord-router/package.json` (config, config)

**Analog:** `packages/scheduler/package.json`

**Imports pattern** — workspace dependency convention and `@zod/*` naming (lines 1-29):
```typescript
{
  "name": "@zod/discord-router",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "main": "./dist/router-service.js",
  "types": "./dist/router-service.d.ts",
  "exports": {
    ".": {
      "types": "./dist/router-service.d.ts",
      "default": "./dist/router-service.js"
    }
  },
  "scripts": {
    "build": "tsc -b",
    "test": "vitest run"
  },
  "dependencies": {
    "discord.js": "^14.25.1",
    "@zod/config": "workspace:*",
    "@zod/db-hot": "workspace:*",
    "@zod/logger": "workspace:*",
    "@zod/sanitize": "workspace:*"
  },
  "devDependencies": {
    "typescript": "~5.9",
    "vitest": "^3.2.7"
  }
}
```
Copy verbatim from `packages/scheduler/package.json` lines 1-30, changing `name` to `@zod/discord-router`, `main`/`types` entry to `router-service`, and swapping `node-cron` + `@zod/scout` + `@zod/dedup` deps for `discord.js` + `@zod/logger`.

---

### `packages/discord-router/tsconfig.json` (config, config)

**Analog:** `packages/scheduler/tsconfig.json`

**Pattern** (lines 1-17):
```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "composite": true,
    "outDir": "dist",
    "rootDir": "src",
    "types": []
  },
  "include": ["src"],
  "references": [
    { "path": "../config" },
    { "path": "../db-hot" },
    { "path": "../logger" },
    { "path": "../sanitize" }
  ]
}
```
Copy from `packages/scheduler/tsconfig.json` lines 1-17; update `references` to `@zod/config`, `@zod/db-hot`, `@zod/logger`, `@zod/sanitize` (drop `@zod/dedup`, `@zod/scout` unless adapters import them).

---

### `packages/discord-router/vitest.config.ts` (config, config)

**Analog:** `packages/scheduler/vitest.config.ts`

**Pattern** (lines 1-32):
```typescript
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { defineConfig } from 'vitest/config';

const here = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  test: {
    name: 'discord-router',
    environment: 'node',
    include: ['src/**/*.test.ts'],
    env: {
      PB_SERVICE_EMAIL: 'test@example.com',
      PB_SERVICE_PASSWORD: 'test-password',
      TURSO_DATABASE_URL: 'libsql://test.turso.io',
      TURSO_AUTH_TOKEN: 'test-token',
      JINA_API_KEY: 'test-jina-key',
      GROQ_API_KEY: 'test-groq-key',
      GITHUB_TOKEN: 'test-github-token',
      DISCORD_TOKEN: 'test-discord-token',
    },
  },
  resolve: {
    alias: {
      '@zod/config': resolve(here, '../config/src/env.ts'),
      '@zod/db-hot$': resolve(here, '../db-hot/src/client.ts'),
      '@zod/db-hot/scratchpad': resolve(here, '../db-hot/src/scratchpad.ts'),
      '@zod/sanitize$': resolve(here, '../sanitize/src/index.ts'),
    },
  },
});
```
Copy from `packages/scheduler/vitest.config.ts` lines 1-32; rename test to `discord-router`, add `DISCORD_TOKEN` to test env, add `@zod/logger` alias if needed.

---

### `packages/discord-router/src/globals.d.ts` (config, config)

**Analog:** `packages/scheduler/src/globals.d.ts`

**Pattern** (lines 1-27):
```typescript
// Minimal Node globals shim (same precedent as packages/config, packages/logger).
declare const process: {
  env: Record<string, string | undefined>;
  exitCode: number | undefined;
};

declare function setTimeout(handler: (...args: unknown[]) => void, timeout: number): unknown;
declare function clearTimeout(id: unknown): void;

declare module 'node:fs' {
  export function mkdirSync(path: string, options?: { recursive?: boolean }): void;
  export function writeFileSync(path: string, data: string): void;
  export function readFileSync(path: string, encoding: string): string;
  export function renameSync(oldPath: string, newPath: string): void;
}

declare module 'node:path' {
  export function join(...parts: string[]): string;
}

declare module 'node:os' {
  export function tmpdir(): string;
}
```
Copy from `packages/scheduler/src/globals.d.ts` lines 1-27 unchanged. Add `fetch` and `AbortController` declarations if `link-hop.ts` uses native `fetch` without `@types/node`.

---

### `packages/discord-router/src/index.ts` (entry, request-response)

**Analog:** `apps/scheduler/src/index.ts`

**Entry pattern** (lines 1-17):
```typescript
import { parseEnv } from '@zod/config';
import { createLogger } from '@zod/logger';

// Bot entry: skeleton only, no gateway code.
// Boot order matches every other entrypoint: fail-fast env parse FIRST, then
// the redacting logger, then one JSON boot line.
export function main(): void {
  const env = parseEnv();
  const log = createLogger(env.LOG_LEVEL);
  log.info({ component: 'discord-router' }, 'discord-router boot ok');
  log.flush();
}

main();
```
Copy from `apps/scheduler/src/index.ts` lines 1-17; change component name to `discord-router`. Phase 4 adds gateway start after `log.flush()` (analog: `startSchedulerRegistry(log)` at line 14).

---

### `packages/discord-router/src/gateway.ts` (service, request-response)

**Analog:** `packages/llm/src/router.ts`

**Class constructor + env injection pattern** (lines 63-88):
```typescript
export class LlmRouter {
  private registry: BucketRegistry;
  private ladder: LadderConfig;
  private adapters = new Map<string, { chat: (m: ChatMessage[]) => Promise<ChatOutcome> }>();

  constructor(
    telemetry: TelemetrySink | null = null,
    opts?: {
      ladder?: LadderConfig;
      queue?: PriorityQueue;
      breaker?: SpendCircuitBreaker;
    },
  ) {
    this.ladder = opts?.ladder ?? DEFAULT_LADDER;
    this.registry = new BucketRegistry(this.ladder.all);
    this.telemetry = telemetry;
    this.queue = opts?.queue ?? new PriorityQueue();
    this.breaker = opts?.breaker ?? new SpendCircuitBreaker({ paidOptIn: !!env.SAMBANOVA_API_KEY });
    this.buildAdapters();
  }
```
Copy from `packages/llm/src/router.ts` lines 63-87 for the class-with-constructor + dependency-injection pattern. For `gateway.ts`, substitute `discord.js` `Client` construction (privileged intents) — see **No Analog Found** below; RESEARCH.md Pattern 1 lines 214-217 supplies the discord.js import/intents shape.

**Logger child binding pattern** (line 28):
```typescript
const log = createLogger('info').child({ component: 'llm/router' });
```
Copy from `packages/llm/src/router.ts` line 28; change child binding to `{ component: 'discord-router/gateway' }`.

---

### `packages/discord-router/src/router-service.ts` (service, CRUD)

**Analog:** `packages/db-hot/src/scratchpad.ts`

**PocketBase poll + update pattern** (lines 83-108, `recordFailure`):
```typescript
export async function recordFailure(
  pb: PocketBase,
  id: string,
  error: string,
): Promise<{ attempts: number; tombstoned: boolean }> {
  const row = await readRow(pb, id);
  const attempts = (row.attempts ?? 0) + 1;
  await scratchpad(pb).update(id, {
    attempts,
    last_error: error,
  });
  let tombstoned = false;
  if (attempts >= 5) {
    const url = row.candidate_url;
    const urlHash = hashUrl(normalizeUrl(url));
    await tombstones(pb).create({
      url_hash: urlHash,
      fingerprint: urlHash,
      terminal_status: 'fetch_failed',
      source: 'scratchpad',
      decided_at: new Date().toISOString(),
    });
    tombstoned = true;
  }
  return { attempts, tombstoned };
}
```
Copy from `packages/db-hot/src/scratchpad.ts` lines 83-108 for the `pb.collection().update(id, { status: 'routed' })` + `recordFailure` (5 retries → tombstone) pattern. The router service will `pb.collection('opportunities').getList(... filter: status = 'audited' && bucket_channel != '')` then `.update(id, { status: 'routed' })` after posting (RESEARCH.md Pattern 1 lines 358-365).

**PocketBase client creation pattern** (lines 72-85, `createPbClient`):
```typescript
export async function createPbClient(
  env: HotEnv,
  options: PbClientOptions = {},
): Promise<PocketBase> {
  ensureEventSource();
  const tokenFile = options.tokenFile ?? DEFAULT_TOKEN_FILE;
  const store = createTokenStore(tokenFile);
  const pb = new PocketBase(env.PB_URL, store);
  const authOptions: Record<string, unknown> = {};
  if (options.fetchImpl !== undefined) authOptions['fetch'] = options.fetchImpl;
  await pb
    .collection('_superusers')
    .authWithPassword(env.PB_SERVICE_EMAIL, env.PB_SERVICE_PASSWORD, authOptions);
  return pb;
}
```
Copy from `packages/db-hot/src/client.ts` lines 72-85 for constructing the shared PB service-account client with `AsyncAuthStore`.

**Opportunity schema fields consumed** (lines 71-96):
```typescript
export const Opportunity = z.object({
  fingerprint_hash: z.string().min(1),
  url_hash: z.string().min(1),
  pipeline: Pipeline,
  bucket_channel: z.string().min(1),
  status: OpportunityStatus,
  title: z.string().min(1),
  organizer: z.string().min(1),
  links: OpportunityLinks,
  prize_cash_inr: z.number().min(0).nullable().default(null),
  prize_text: z.string().default(''),
  deadlines: OpportunityDeadlines,
  end_date: z.iso.datetime().nullable().default(null),
  audit_summary: z.string().default(''),
  description_raw: z.string().default(''),
});
```
Copy from `packages/db-hot/src/schema.ts` lines 71-96 for the `Opportunity` fields the router service reads (`status`, `bucket_channel`, `title`, `organizer`, `links`, `prize_text`, `deadlines`, `audit_summary`).

**Statuses enum** (lines 28-37):
```typescript
export const OPPORTUNITY_STATUSES = [
  'candidate',
  'audited',
  'routed',
  'rejected',
  'tombstoned',
  'expired',
] as const;
export const OpportunityStatus = z.enum(OPPORTUNITY_STATUSES);
export type OpportunityStatus = z.infer<typeof OpportunityStatus>;
```
Copy from `packages/db-hot/src/schema.ts` lines 28-37; router service transitions `audited` → `routed`.

---

### `packages/discord-router/src/embed.ts` (component, transform)

**Analog:** None in codebase (greenfield — discord.js EmbedBuilder is new in Phase 4).

**Reference pattern** (RESEARCH.md Pattern 2, EmbedBuilder audit card per UI-01 — not real codebase lines):
```typescript
import { EmbedBuilder } from 'discord.js';

export function buildAuditCard(opp: Opportunity): EmbedBuilder {
  return new EmbedBuilder()
    .setTitle(opp.title)
    .addFields(
      { name: 'Organizer', value: opp.organizer, inline: true },
      { name: 'Dates', value: fmtDeadlines(opp.deadlines), inline: true },
      { name: 'Prize (liquid cash)', value: opp.prize_text || '—', inline: false },
      { name: 'Links', value: `[Official](${opp.links.official}) • [Aggregator](${opp.links.aggregator})`, inline: false },
      { name: 'Audit', value: opp.audit_summary, inline: false },
    )
    .setColor(0x00AA00)
    .setTimestamp();
}
```
Source: RESEARCH.md "Pattern 2: EmbedBuilder audit card per UI-01" (lines 389-407). The closest codebase analog for "build + return a configured object" is `packages/sanitize/src/fetch.ts` `FacadeResult` construction (lines 61-86), but no EmbedBuilder equivalent exists. Planner should use RESEARCH.md excerpt directly.

---

### `packages/discord-router/src/link-hop.ts` (utility, request-response)

**Analog:** `packages/sanitize/src/fetch.ts`

**SSRF guard / validateUrl pattern** (lines 34-52):
```typescript
function validateUrl(raw: string): URL {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    throw new Error('fetch: invalid URL');
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') {
    throw new Error('fetch: protocol must be http or https');
  }
  if (isPrivateHost(u.hostname)) {
    throw new Error('fetch: private/loopback host refused (SSRF guard)');
  }
  const port = u.port;
  if (port !== '' && port !== '80' && port !== '443') {
    throw new Error('fetch: non-default port refused');
  }
  return u;
}
```
Copy from `packages/sanitize/src/fetch.ts` lines 34-52 for the SSRF guard on every Link-Hopper hop target (Pitfall 6). Reuse `isPrivateHost` from lines 15-32.

**Fetch with redirect-following pattern** (lines 61-86):
```typescript
export async function fetch(url: string, opts?: unknown): Promise<FacadeResult> {
  const u = validateUrl(url);
  const normalized = u.toString();
  const browserFetcher = resolveBrowserFetcher(opts);

  if (Date.now() < jinaCoolingUntil) {
    const html = await browserFetcher(normalized);
    const sanitized = sanitizeHtml(html);
    return { markdown: sanitized.markdown, capped: sanitized.capped, source: 'browser' };
  }

  try {
    const body = await fetchViaJina(normalized);
    const sanitized = sanitizeMarkdown(body);
    return { markdown: sanitized.markdown, capped: sanitized.capped, source: 'jina' };
  } catch (err) {
    if (err instanceof JinaFetchError && err.throttle) {
      jinaCoolingUntil = Date.now() + 60_000;
    }
    const html = await browserFetcher(normalized);
    const sanitized = sanitizeHtml(html);
    return { markdown: sanitized.markdown, capped: sanitized.capped, source: 'browser' };
  }
}
```
Copy from `packages/sanitize/src/fetch.ts` lines 61-86 for the try/catch + fallback structure. `link-hop.ts` adapts this: `fetch(current, { redirect: 'manual' })`, read `res.headers.get('location')`, count hops, stop at 2 (RESEARCH.md Pattern 2 lines 371-387).

**Private-host helper** (lines 15-32):
```typescript
function isPrivateHost(host: string): boolean {
  const h = host.toLowerCase();
  if (h === 'localhost' || h === '::1' || h === '0.0.0.0') return true;
  const v4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(h);
  if (v4) {
    const [a, b] = [Number(v4[1]), Number(v4[2])];
    if (a === 127) return true;
    if (a === 10) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 0) return true;
  }
  if (h.startsWith('fe80') || h.startsWith('fc') || h.startsWith('fd') || h.startsWith('::')) {
    return true;
  }
  return false;
}
```
Copy from `packages/sanitize/src/fetch.ts` lines 15-32 unchanged; Link-Hopper rejects private/loopback hop targets as `link_hop_failed`.

---

### `packages/discord-router/src/domain-filter.ts` (utility, request-response)

**Analog:** `packages/scout/src/index.ts`

**Pure prefilter + zod validation + verdict pattern** (lines 1-29):
```typescript
import * as z from 'zod';
import { extractPastDate } from './expiry.js';
import { isSpam } from './spam.js';

const ScoutInput = z.object({
  title: z.string().min(1),
  snippet: z.string(),
});
export type ScoutInput = z.infer<typeof ScoutInput>;

export type PrefilterResult =
  | { verdict: 'pass' }
  | { verdict: 'reject'; reason: 'expired' | 'spam'; detail: string };

export function prefilter(input: ScoutInput | unknown): PrefilterResult {
  const parsed = ScoutInput.parse(input);
  const past = extractPastDate(`${parsed.title} ${parsed.snippet}`);
  if (past) {
    return { verdict: 'reject', reason: 'expired', detail: `past date ${past.toISOString()}` };
  }
  if (isSpam(parsed.title, parsed.snippet)) {
    return { verdict: 'reject', reason: 'spam', detail: 'blocked keyword matched' };
  }
  return { verdict: 'pass' };
}
```
Copy from `packages/scout/src/index.ts` lines 1-29 for the domain-filter shape: zod-validated input struct, pure function, `{ verdict: 'pass' } | { verdict: 'reject'; reason; detail }` union return. `domain-filter.ts` substitutes 80/20 scoring (SWE admit-all, deep-tech at organizer≥9 AND agenda≥9, reject non-technical) for expiry+spam.

---

### `packages/discord-router/src/prize-gate.ts` (utility, request-response)

**Analog:** `packages/scout/src/spam.ts`

**Pure predicate pattern** (lines 31-34):
```typescript
export function isSpam(title: string, snippet: string): boolean {
  const haystack = `${title} ${snippet}`.toLowerCase();
  return (BLOCKLIST as readonly string[]).some((kw) => haystack.includes(kw.toLowerCase()));
}
```
Copy from `packages/scout/src/spam.ts` lines 31-34 for the pure predicate shape. `prize-gate.ts` substitutes: `passesPrizeGate(prizeText: string, prizeCashInr: number | null): boolean` — hard predicate: explicit INR ≥₹1,00,000, credits/vouchers stripped, `null` does NOT qualify (D-10). Config-driven blocklist of credit keywords (`credits`, 'vouchers', 'certificates', 'worth', 'up to') mirrors `BLOCKLIST` at lines 4-25.

---

### `packages/discord-router/src/portals/unstop.ts` … `clist.ts` (controller, CRUD) — 7 files

**Analog:** `packages/scheduler/src/jobs.ts`

**PollCandidate shape + static list pattern** (lines 103-114):
```typescript
export interface PollCandidate {
  url: string;
  title: string;
  snippet: string;
}

export const POLL_CANDIDATES: readonly PollCandidate[] = [
  { url: 'https://unstop.com/competitions/sample-hackathon', title: 'Sample Hackathon 2026', snippet: 'cash prize Rs 1,00,000' },
  { url: 'https://devfolio.co/hackathons/sample', title: 'Devfolio Hackathon', snippet: 'register now prizes' },
  { url: 'https://lu.ma/sample-event', title: 'Luma Community Event', snippet: 'free workshop online' },
];
```
Copy from `packages/scheduler/src/jobs.ts` lines 103-114 for the `PollCandidate` interface + exported static array shape. Each portal adapter exports a `list(opts?: { since?: Date }): Promise<PollCandidate[]>` that emits `title + snippet` from RSS/JSON listing first (D-03); Scout pre-filter runs on that (zero fetch); full fetch happens only for survivors.

**STUB_JOBS cadence definition pattern** (lines 48-73):
```typescript
export const STUB_JOBS: readonly StubJobDef[] = [
  {
    name: 'events-stub',
    expression: '*/20 * * * *',
    maxRandomDelayMs: 5 * 60_000,
    description: 'events pipeline cadence stub (real polling lands Phase 2+)',
  },
  ...
];
```
Copy from `packages/scheduler/src/jobs.ts` lines 48-73 for the staggered cron expression + `maxRandomDelayMs` jitter pattern. The 7 portal adapters register 7 staggered `StubJobDef` entries (D-02) through the single scheduler registry (analog: `packages/scheduler/src/registry.ts` lines 125-158).

**Tick lifecycle + dedup + prefilter + fetch → STEP_2 pattern** (lines 188-315, `runStubTick`):
```typescript
export async function runStubTick(
  def: StubJobDef,
  log: TickLogger,
  opts: TickOptions = {},
): Promise<TickOutcome> {
  const startedAt = Date.now();
  const jobLog = log.child({ job: def.name });
  jobLog.info('tick start');
  opts.sink?.record({ job: def.name, phase: 'start', at: new Date(startedAt).toISOString() });

  // 1. dedup gate first
  let verdict: string;
  try {
    verdict = await runPrecheckSafe(cand);
  } catch (err) {
    cLog.warn({ stage: 'precheck', error: String(err) }, 'precheck failed');
    continue;
  }
  if (verdict === 'hot-hit' || verdict === 'tombstoned') {
    cLog.info({ stage: 'precheck', verdict }, 'skip: candidate gated by dedup');
    continue;
  }

  // 2. scout prefilter (zero fetch)
  const pf = prefilter({ title: cand.title, snippet: cand.snippet } as any) as any;
  if (pf?.verdict === 'reject') {
    ...
    continue;
  }

  // 3. scratchpad resume
  let resume: { row: any; shouldFetch: boolean };
  try {
    resume = await resumeByUrl(pb, cand.url);
  } catch (err) {
    cLog.warn({ stage: 'scratchpad', error: String(err) }, 'scratchpad resume failed');
    continue;
  }

  // 4. fetch -> STEP_2
  try {
    const result = await fetchFn(cand.url);
    await advanceToStep2(pb, resume.row.id, result.markdown);
    ...
  } catch (err) {
    try {
      const { attempts, tombstoned } = await recordFailure(pb, resume.row.id, String(err));
      ...
    } catch (inner) {
      cLog.warn({ stage: 'fetch', error: String(inner) }, 'recordFailure failed');
    }
  }
}
```
Copy from `packages/scheduler/src/jobs.ts` lines 188-315 for the per-candidate pipeline: dedup precheck → Scout prefilter → scratchpad resume → fetch → STEP_2 → recordFailure on error. Each portal adapter's tick follows this same skeleton with the adapter's `list()` replacing `POLL_CANDIDATES`.

---

### `packages/scheduler/src/jobs.ts` (modify, config)

**Analog:** Itself (existing file — extend `STUB_JOBS` / `POLL_CANDIDATES`).

**Extension point** (lines 48-73): Add 7 portal `StubJobDef` entries with staggered cron expressions across the 15–30m window + `maxRandomDelayMs` jitter (D-02). Example pattern from line 48-53:
```typescript
{
  name: 'events-stub',
  expression: '*/20 * * * *',
  maxRandomDelayMs: 5 * 60_000,
  description: 'events pipeline cadence stub',
},
```
Replace `events-stub` with per-portal names (`portal-unstop`, `portal-devfolio`, …) and expressions staggered at 5-minute offsets within `*/15-30 * * * *` range.

**Extension point** (lines 110-114): Replace `POLL_CANDIDATES` static list with real portal adapter imports (D-01). The `runStubTick` `candidates` override (line 213) shows how injected candidate lists flow through:
```typescript
const candidates = (opts.candidates ?? bag.candidates ?? POLL_CANDIDATES) as readonly PollCandidate[];
```

---

### `packages/config/src/env.ts` (modify, config)

**Analog:** Itself (existing file — add `DISCORD_TOKEN`).

**EnvSchema pattern** (lines 7-18):
```typescript
const EnvSchema = z.object({
  PB_URL: z.string().default('http://127.0.0.1:8090'),
  PB_SERVICE_EMAIL: z.email(),
  PB_SERVICE_PASSWORD: z.string().min(1),
  JINA_API_KEY: z.string().min(1),
  TURSO_DATABASE_URL: z.string(),
  TURSO_AUTH_TOKEN: z.string().min(1),
  GROQ_API_KEY: z.string().min(1),
  GITHUB_TOKEN: z.string().min(1),
  SAMBANOVA_API_KEY: z.string().default(''),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
});
```
Add `DISCORD_TOKEN: z.string().min(1),` after `SAMBANOVA_API_KEY` (line 16). Fail-fast `parseEnv()` at lines 22-27 throws before any client constructs (D-09 prerequisite: no `DISCORD_TOKEN` in schema yet — must add before Discord router constructs).

**REDACT_PATHS extension** (analog: `packages/logger/src/index.ts` lines 8-28):
```typescript
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
```
Add `'DISCORD_TOKEN'` and `'headers.authorization'` (already present) — extends `packages/logger/src/index.ts` lines 8-28 so the Discord token is never logged (Pitfall 5).

---

### `.env.example` (modify, config)

**Analog:** Itself (existing file — add `DISCORD_TOKEN` placeholder).

**Pattern** (entire file, lines 1-8):
```
# Placeholder-only example — copy to `.env` (0600, never committed) and fill in.
# Every key below mirrors the zod env schema in packages/config/src/env.ts.
PB_URL=http://127.0.0.1:8090
PB_SERVICE_EMAIL=
PB_SERVICE_PASSWORD=
TURSO_DATABASE_URL=
TURSO_AUTH_TOKEN=
LOG_LEVEL=info
```
Add `DISCORD_TOKEN=` placeholder line (never committed, `.env` gitignored). Mirrors `packages/config/src/env.ts` schema keys.

---

### Test files (all test role)

**`packages/discord-router/src/link-hop.test.ts`** — Analog: `packages/scheduler/src/poll-wiring.test.ts` (injected fake PB + logger + fetch, lines 4-78). Pattern: inject mock `fetch` returning redirect `Location` headers, assert hop count ≤ 2 and `link_hop_failed` tombstone on exhaustion.

**`packages/discord-router/src/domain-filter.test.ts`** — Analog: `packages/scout/src/scout.test.ts` (pure function unit tests, reject/pass verdict matrix). Pattern: table of organizer/agenda scores → admit/reject.

**`packages/discord-router/src/prize-gate.test.ts`** — Analog: `packages/scout/src/spam.test.ts` (pure predicate tests). Pattern: `prize_text` with credits → reject; explicit INR ≥₹1L → pass; `prize_cash_inr` null → reject.

**`packages/discord-router/src/embed.test.ts`** — Analog: `packages/llm/src/router.test.ts` (class/service unit tests with mocked dependencies). Pattern: assert `EmbedBuilder` fields (title, organizer, dates, prize, links, audit_summary) built from a fixture `OpportunityRow`.

**`packages/discord-router/src/portals/*.test.ts`** — Analog: `packages/scheduler/src/poll-wiring.test.ts` (injected fake PB, logger, fetch). Pattern: mock portal listing HTML/JSON, assert adapter emits `PollCandidate[]` with title+snippet.

---

## Shared Patterns

### Authentication / Fail-fast Env Gate
**Source:** `packages/config/src/env.ts` (lines 7-27) and `packages/db-hot/src/client.ts` (lines 72-85)
**Apply to:** `packages/discord-router/src/index.ts`, `packages/discord-router/src/gateway.ts`, `packages/discord-router/src/router-service.ts`
```typescript
// env gate — parseEnv() throws on missing DISCORD_TOKEN before any client constructs
const env = parseEnv();  // fail-fast, names missing key
// PB client — shared service-account AsyncAuthStore, 0600 token file
const pb = await createPbClient(env);  // authWithPassword vs _superusers
```

### Error Handling / recordFailure (5 retries → tombstone)
**Source:** `packages/db-hot/src/scratchpad.ts` (lines 83-108)
**Apply to:** `packages/discord-router/src/router-service.ts` (failed Discord posts retry via scratchpad), `packages/discord-router/src/portals/*.ts` (fetch failures)
```typescript
const { attempts, tombstoned } = await recordFailure(pb, id, String(err));
if (tombstoned) {
  // terminal_status written to tombstone_ledger, never re-audited
}
```

### SSRF Guard / validateUrl
**Source:** `packages/sanitize/src/fetch.ts` (lines 34-52, `isPrivateHost` lines 15-32)
**Apply to:** `packages/discord-router/src/link-hop.ts` (every hop target before following `Location` header)

### Structured Logging / pino child loggers
**Source:** `packages/logger/src/index.ts` (lines 32-54) and `packages/llm/src/router.ts` (line 28)
**Apply to:** All `packages/discord-router/*` files
```typescript
const log = createLogger(env.LOG_LEVEL).child({ component: 'discord-router/router-service' });
log.warn({ job: def.name, error: String(err) }, 'tick handler threw');
```

### Scheduler Registry / noOverlap + jitter + Asia/Kolkata
**Source:** `packages/scheduler/src/registry.ts` (lines 125-158, `registerStubJobs`)
**Apply to:** `packages/scheduler/src/jobs.ts` (7 portal-poll cron jobs)
```typescript
mod.schedule(def.expression, () => runStubTick(def, log, { sink, heartbeatDir }), {
  name: def.name,
  timezone: SCHEDULER_TIMEZONE,   // 'Asia/Kolkata'
  noOverlap: true,
  maxRandomDelay: def.maxRandomDelayMs,
});
task.on('execution:overlap', () => log.child({ job: def.name }).warn('tick skipped: previous run pending'));
```

---

## No Analog Found

Files with no close match in the codebase (planner should use RESEARCH.md patterns instead):

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| `packages/discord-router/src/embed.ts` | component | transform | discord.js `EmbedBuilder` + gateway intents are greenfield in Phase 4; no discord.js code exists yet (`apps/bot/src/index.ts` is a skeleton, lines 1-16) |
| `packages/discord-router/src/gateway.ts` | service | request-response | discord.js `Client` + `GatewayIntentBits` + `Partials` construction has no codebase analog; RESEARCH.md Pattern 1 (lines 214-217) supplies the shape |
| `packages/discord-router/src/router-service.ts` | service | CRUD | Dedicated Discord router service polling `status='audited'` + `bucket_channel` is greenfield; closest analog is `packages/db-hot/src/scratchpad.ts` PB update pattern only |

---

## Metadata

**Analog search scope:** `apps/`, `packages/` — all TypeScript source files under the monorepo root
**Files scanned:** 41 (all `packages/*/src/*.ts`, `apps/*/src/*.ts`, package scaffolds)
**Pattern extraction date:** 2026-10-16
**Git-tracked gate:** All analog paths verified via `git ls-files` (all tracked; no gitignored mirror paths cited)