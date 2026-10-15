# Phase 02: Scraper Foundation - Pattern Map

**Mapped:** 2026-10-15
**Files analyzed:** 12 (new files/groups from CONTEXT.md decisions + RESEARCH.md structure)
**Analogs found:** 6 / 12 — 6 files have direct codebase analogs (Phase 1 shipped the foundation); 6 are greenfield packages with no direct analog but verified RESEARCH.md excerpts

> **Phase 1 → Phase 2 transition:** Phase 1 shipped the foundation packages (`config`, `logger`, `db-hot`, `db-cold`, `dedup`, `scheduler`). Phase 2 builds three NEW packages (`browser`, `sanitize`, `scout`) and extends two existing ones (`db-hot` scratchpad, `scheduler` poll wiring). New packages have no codebase analog — use RESEARCH.md verified excerpts. Modifications to existing packages use the existing file as its own analog (additive change).

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `packages/browser/package.json` | config | build | `packages/scheduler/package.json` | role-match |
| `packages/browser/tsconfig.json` | config | build | `packages/scheduler/tsconfig.json` | exact |
| `packages/browser/vitest.config.ts` | config | build | `packages/scheduler/vitest.config.ts` | exact |
| `packages/browser/src/index.ts` | service (singleton) | request-response | `packages/scheduler/src/registry.ts` (singleton pattern) | role-match |
| `packages/browser/src/queue.ts` | service (semaphore) | request-response | — (greenfield; RESEARCH.md Pattern 2) | none |
| `packages/browser/src/queue.test.ts` | test | batch | `packages/scheduler/src/overlap.test.ts` (fake-injection pattern) | role-match |
| `packages/sanitize/package.json` | config | build | `packages/scheduler/package.json` | role-match |
| `packages/sanitize/tsconfig.json` | config | build | `packages/scheduler/tsconfig.json` | exact |
| `packages/sanitize/vitest.config.ts` | config | build | `packages/scheduler/vitest.config.ts` | exact |
| `packages/sanitize/src/jina.ts` | service (HTTP client) | request-response | — (greenfield; RESEARCH.md Pattern 1) | none |
| `packages/sanitize/src/strip.ts` | utility (transform) | transform | — (greenfield; RESEARCH.md Pattern 3) | none |
| `packages/sanitize/src/fetch.ts` | service (facade) | request-response | — (greenfield; RESEARCH.md Pattern 1+3) | none |
| `packages/sanitize/src/strip.test.ts` | test | batch | `packages/dedup/src/fingerprint.test.ts` (pure-function test pattern) | role-match |
| `packages/sanitize/src/fetch.test.ts` | test | batch | `packages/db-hot/src/client.test.ts` (mocked-fetch pattern) | role-match |
| `packages/scout/package.json` | config | build | `packages/scheduler/package.json` | role-match |
| `packages/scout/tsconfig.json` | config | build | `packages/scheduler/tsconfig.json` | exact |
| `packages/scout/vitest.config.ts` | config | build | `packages/scheduler/vitest.config.ts` | exact |
| `packages/scout/src/expiry.ts` | utility (pure) | transform | `packages/dedup/src/fingerprint.ts` (pure function + zod) | role-match |
| `packages/scout/src/spam.ts` | utility (pure) | transform | `packages/dedup/src/fingerprint.ts` (pure function + zod) | role-match |
| `packages/scout/src/index.ts` | utility (facade) | transform | `packages/dedup/src/precheck.ts` (composed verdict) | role-match |
| `packages/scout/src/expiry.test.ts` | test | batch | `packages/dedup/src/fingerprint.test.ts` (fixture table) | role-match |
| `packages/scout/src/spam.test.ts` | test | batch | `packages/dedup/src/fingerprint.test.ts` (fixture table) | role-match |
| `packages/db-hot/src/scratchpad.ts` | service (store) | CRUD | `packages/db-hot/src/client.ts` (PB client usage) | exact |
| `packages/db-hot/src/scratchpad.test.ts` | test | batch | `packages/db-hot/src/client.test.ts` (fake PB) | exact |
| `packages/config/src/env.ts` (modify) | config | transform | `packages/config/src/env.ts` (self — additive) | exact |
| `packages/scheduler/src/jobs.ts` (modify) | service (entrypoint) | batch | `packages/scheduler/src/jobs.ts` (self — body replacement) | exact |

## Pattern Assignments

### `packages/browser/` — new package, shared browser singleton + queue

**Analog:** `packages/scheduler/src/registry.ts` (singleton pattern) + RESEARCH.md Pattern 2 (verified code)

**Singleton + lazy-init pattern** (from `packages/scheduler/src/registry.ts` lines 36-44):
```typescript
// Source: packages/scheduler/src/registry.ts lines 36-44
// Pattern: module-level nullable singleton with lazy initialization
let browser: Browser | null = null;

async function getBrowser(): Promise<Browser> {
  if (browser === null || !browser.isConnected()) {
    browser = await chromium.launch({
      headless: true,
      args: ['--blink-settings=imagesEnabled=false', '--mute-audio', '--disable-dev-shm-usage'],
    });
  }
  return browser;
}
```

**Queue + fresh-context + close-in-finally pattern** (RESEARCH.md Pattern 2, lines 232-264):
```typescript
// Source: 02-RESEARCH.md Pattern 2 (lines 232-264) — Context7 verified
import pLimit from 'p-limit';

const slots = pLimit(2); // D-08 max 2, FIFO order, await = backpressure (D-09/D-11)
const MEDIA_GLOB = '**/*.{png,jpg,jpeg,webp,gif,svg,woff,woff2,ttf,mp4,webm}';

export function fetchViaBrowser(url: string): Promise<string> {
  return slots(async () => {
    const ctx = await (await getBrowser()).newContext({ javaScriptEnabled: true }); // D-10
    await ctx.route(MEDIA_GLOB, (route) => route.abort()); // D-12
    try {
      const page = await ctx.newPage();
      await page.goto(url, { timeout: 30_000, waitUntil: 'domcontentloaded' }); // D-13
      return await page.content();
    } finally {
      await ctx.close(); // D-15: leak = OOM on ARM
    }
  });
}
```

**Port/adapter pattern for testability** (from `packages/dedup/src/precheck.ts` lines 17-30):
```typescript
// Source: packages/dedup/src/precheck.ts lines 17-30
// Pattern: injectable interfaces so unit tests use fakes, not real services
export interface HotStore {
  hasFingerprint(fingerprint: string): Promise<boolean>;
}
export interface ColdStore {
  findTombstone(urlHash: string): Promise<ColdTombstone | null>;
}
```

**Package scaffold pattern** (from `packages/scheduler/package.json` + `tsconfig.json` + `vitest.config.ts`):
```jsonc
// packages/browser/package.json — copy structure from packages/scheduler/package.json
{
  "name": "@zod/browser",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": { ".": { "types": "./dist/index.d.ts", "default": "./dist/index.js" } },
  "scripts": { "build": "tsc -b", "test": "vitest run" },
  "dependencies": { "playwright-core": "^1.64", "p-limit": "^7" },
  "devDependencies": { "typescript": "~5.9", "vitest": "^3.2.7" }
}
```
```jsonc
// packages/browser/tsconfig.json — identical to packages/scheduler/tsconfig.json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": { "composite": true, "outDir": "dist", "rootDir": "src", "types": [] },
  "include": ["src"]
}
```
```typescript
// packages/browser/vitest.config.ts — identical to packages/scheduler/vitest.config.ts
import { defineConfig } from 'vitest/config';
export default defineConfig({ test: { name: 'browser', environment: 'node', include: ['src/**/*.test.ts'] } });
```

---

### `packages/sanitize/` — new package, Jina fetch + strip pipeline + fetch facade

**Analog:** RESEARCH.md Patterns 1+3 (verified code) + `packages/db-hot/src/schema.ts` (zod schema pattern)

**Jina fetch with fail signals** (RESEARCH.md Pattern 1, lines 199-223):
```typescript
// Source: 02-RESEARCH.md Pattern 1 (lines 199-223) — live-verified 2026-10-15
const JINA_TIMEOUT_MS = 30_000; // D-07
const SHORT_BODY_CHARS = 500;   // "short output" fail signal (planner-tunable)

export async function fetchViaJina(url: string): Promise<string> {
  const res = await fetch(`https://r.jina.ai/${url}`, {
    headers: {
      Authorization: `Bearer ${env.JINA_API_KEY}`, // never logged (pino redact)
      Accept: 'text/plain',
      'X-Timeout': '25',
      'X-Retain-Links': 'all',     // D-04: links must survive
      'X-Retain-Images': 'none',   // D-04: images are token waste
      'X-Remove-Selector': 'nav, footer, .sidebar, #ads',
    },
    signal: AbortSignal.timeout(JINA_TIMEOUT_MS),
  });
  if (!res.ok) throw new JinaFetchError(`jina ${res.status} for ${url}`);
  const body = await res.text();
  if (body.length < SHORT_BODY_CHARS) throw new JinaFetchError(`jina short body (${body.length}c)`);
  return body;
}
```

**Sanitize pipeline** (RESEARCH.md Pattern 3, lines 272-298):
```typescript
// Source: 02-RESEARCH.md Pattern 3 (lines 272-298) — Context7 verified
import * as cheerio from 'cheerio';
import TurndownService from 'turndown';

const STRIP_SELECTORS = [
  'script', 'style', 'noscript', 'svg', 'nav', 'header', 'footer',
  'aside', 'form', 'iframe', '.sidebar', '.comments', '.related-posts',
  '#ads', '[aria-hidden="true"]',
].join(', ');

const turndown = new TurndownService({ headingStyle: 'atx', codeBlockStyle: 'fenced' });
export const MARKDOWN_CAP = 8000; // D-03

export function sanitizeHtml(html: string): { markdown: string; capped: boolean; rawBytes: number } {
  const $ = cheerio.load(html);
  $(STRIP_SELECTORS).remove();
  const markdown = turndown.turndown($.html() ?? '');
  const rawBytes = Buffer.byteLength(html, 'utf8');
  const capped = markdown.length > MARKDOWN_CAP;
  return { markdown: capped ? markdown.slice(0, MARKDOWN_CAP) : markdown, capped, rawBytes };
}
```

**zod schema validation pattern** (from `packages/db-hot/src/schema.ts` lines 135-144):
```typescript
// Source: packages/db-hot/src/schema.ts lines 135-144
// Pattern: zod v4 schema + z.infer type + .catchall(z.unknown()) for PB system fields
export const TaskScratchpad = z.object({
  candidate_url: z.url(),
  step_position: z.string().min(1),
  partial_buffer: z.string().default(''),
  attempts: z.number().int().min(0).default(0),
  last_error: z.string().nullable().default(null),
});
export type TaskScratchpad = z.infer<typeof TaskScratchpad>;
```

**Pure-function test pattern** (from `packages/dedup/src/fingerprint.test.ts` — fixture-table style):
```typescript
// Source: packages/dedup/src/fingerprint.test.ts
// Pattern: describe block per function, it.each fixture table, expect().toEqual()
import { describe, expect, it } from 'vitest';
import { sanitizeHtml } from './strip.js';

describe('sanitizeHtml', () => {
  it.each([
    { name: 'strips scripts', html: '<script>alert(1)</script><p>Hi</p>', expectIn: 'Hi', expectNotIn: 'alert' },
    { name: 'preserves links', html: '<a href="https://x.com">X</a>', expectIn: 'https://x.com' },
  ])('$name', ({ html, expectIn, expectNotIn }) => {
    const result = sanitizeHtml(html);
    expect(result.markdown).toContain(expectIn);
    if (expectNotIn) expect(result.markdown).not.toContain(expectNotIn);
  });
});
```

---

### `packages/scout/` — new package, Scout pre-filter (expiry + spam)

**Analog:** `packages/dedup/src/fingerprint.ts` (pure function + zod validation pattern)

**Pure function + zod input validation pattern** (from `packages/dedup/src/fingerprint.ts` lines 40-46):
```typescript
// Source: packages/dedup/src/fingerprint.ts lines 40-46
// Pattern: zod schema at boundary, z.infer type, pure function, no side effects
const FingerprintInput = z.object({
  url: z.string().trim().min(1, 'fingerprint url must not be empty'),
  title: z.string().trim().min(1, 'fingerprint title must not be empty'),
  date: z.string().trim().default(''),
  organizer: z.string().trim().default(''),
});
export type FingerprintInput = z.infer<typeof FingerprintInput>;
```

**Composed verdict pattern** (from `packages/dedup/src/precheck.ts` lines 15-48):
```typescript
// Source: packages/dedup/src/precheck.ts lines 15-48
// Pattern: discriminated union return type, async composition, early return on first hit
export type PrecheckVerdict = 'fresh' | 'hot-hit' | 'tombstoned';

export async function precheck(
  input: FingerprintInput,
  hot: HotStore,
  cold: ColdStore,
): Promise<PrecheckVerdict> {
  const digest = fingerprint(input);
  if (await hot.hasFingerprint(digest)) {
    return 'hot-hit';
  }
  const urlHash = hashUrl(normalizeUrl(input.url));
  const tombstone = await cold.findTombstone(urlHash);
  return tombstone === null ? 'fresh' : 'tombstoned';
}
```

**Scout expiry + spam pattern** (RESEARCH.md Pattern 4, lines 300-303):
```typescript
// Source: 02-RESEARCH.md Pattern 4 (lines 300-303) — date-fns verified
import { parseISO, parse, isValid, isPast } from 'date-fns';

const FORMATS = ['dd MMM yyyy', 'MMM dd, yyyy', 'dd/MM/yyyy', 'yyyy-MM-dd'];

export function extractPastDate(text: string): Date | null {
  for (const candidate of extractDateCandidates(text)) {
    const d = candidate.includes('T') ? parseISO(candidate) : tryFormats(candidate);
    if (isValid(d) && isPast(d)) return d; // strict, no grace (D-16)
  }
  return null;
}
```

---

### `packages/db-hot/src/scratchpad.ts` — new file, PB scratchpad store

**Analog:** `packages/db-hot/src/client.ts` (PB client construction + auth pattern)

**PB client usage pattern** (from `packages/db-hot/src/client.ts` lines 72-86):
```typescript
// Source: packages/db-hot/src/client.ts lines 72-86
// Pattern: createPbClient(env) → authenticated PocketBase instance → pb.collection()
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

**Scratchpad get-or-create + STEP transition + retry/tombstone** (RESEARCH.md Pattern 5, lines 305-310):
```typescript
// Source: 02-RESEARCH.md Pattern 5 (lines 305-310) — PB SDK verified
import { ClientResponseError } from 'pocketbase';

async function getOrCreateScratchpad(url: string) {
  try {
    return await pb.collection('task_scratchpad')
      .getFirstListItem(`candidate_url = '${url.replace(/'/g, "''")}'`);
  } catch (err) {
    if (err instanceof ClientResponseError && err.status === 404) {
      return await pb.collection('task_scratchpad').create({
        candidate_url: url, step_position: 'STEP_1', attempts: 0,
      });
    }
    throw err;
  }
}
// then: pb.collection('task_scratchpad').update(id, { step_position: 'STEP_2', ... })
```

**Schema reference** (from `packages/db-hot/src/schema.ts` lines 135-151):
```typescript
// Source: packages/db-hot/src/schema.ts lines 135-151
// The locked TaskScratchpad shape — Phase 2 reads but does NOT modify
export const TaskScratchpad = z.object({
  candidate_url: z.url(),
  step_position: z.string().min(1),  // free string, NOT enum — enforce STEP_1/STEP_2 at app level
  partial_buffer: z.string().default(''),
  attempts: z.number().int().min(0).default(0),
  last_error: z.string().nullable().default(null),
});
export const TaskScratchpadRow = TaskScratchpad.extend({
  id: z.string().min(1),
  created: z.iso.datetime(),
  updated: z.iso.datetime(),
}).catchall(z.unknown());
```

---

### `packages/config/src/env.ts` — modification: add JINA_API_KEY

**Analog:** `packages/config/src/env.ts` (self — additive change only)

**Additive env field pattern** (from `packages/config/src/env.ts` lines 7-14):
```typescript
// Source: packages/config/src/env.ts lines 7-14
// Pattern: add JINA_API_KEY as required string field in the zod schema
const EnvSchema = z.object({
  PB_URL: z.string().default('http://127.0.0.1:8090'),
  PB_SERVICE_EMAIL: z.email(),
  PB_SERVICE_PASSWORD: z.string().min(1),
  TURSO_DATABASE_URL: z.string(),
  TURSO_AUTH_TOKEN: z.string().min(1),
  JINA_API_KEY: z.string().min(1),  // ADD THIS — D-06 keyed Jina
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
});
```

**Logger redaction extension** (from `packages/logger/src/index.ts` lines 8-24):
```typescript
// Source: packages/logger/src/index.ts lines 8-24
// Pattern: extend REDACT_PATHS with JINA_API_KEY so pino censors it in all logs
export const REDACT_PATHS: string[] = [
  'password', 'token', 'secret', 'cookie', 'authToken', 'authorization',
  '*.password', '*.token', '*.secret', '*.cookie', '*.authToken',
  'TURSO_AUTH_TOKEN', 'PB_SERVICE_PASSWORD',
  'JINA_API_KEY',  // ADD THIS — never log the Jina key
  'headers.authorization', 'headers.cookie',
];
```

---

### `packages/scheduler/src/jobs.ts` — modification: replace stub tick with real poll wiring

**Analog:** `packages/scheduler/src/jobs.ts` (self — body replacement, structure preserved)

**Stub tick plug point** (from `packages/scheduler/src/jobs.ts` lines 126-144):
```typescript
// Source: packages/scheduler/src/jobs.ts lines 126-144
// Pattern: runStubTick is the plug point — replace the body between "tick start" and "tick done"
// The existing structure (logging, metrics sink, heartbeat) is PRESERVED
export async function runStubTick(
  def: StubJobDef,
  log: TickLogger,
  opts: TickOptions = {},
): Promise<TickOutcome> {
  const startedAt = Date.now();
  const jobLog = log.child({ job: def.name });
  jobLog.info('tick start');
  opts.sink?.record({ job: def.name, phase: 'start', at: new Date(startedAt).toISOString() });
  // ─── PHASE 2: replace this comment with real poll logic ───
  // 1. Discover candidate URLs (from portal adapters — Phase 3+)
  // 2. Run precheck() dedup gate (packages/dedup)
  // 3. Run Scout pre-filter (packages/scout)
  // 4. getOrCreate scratchpad row
  // 5. fetch(url) → sanitize → STEP_2
  // 6. recordFailure on error, advance on success
  const durationMs = Date.now() - startedAt;
  const outcome: TickOutcome = { job: def.name, durationMs };
  jobLog.info({ durationMs }, 'tick done');
  opts.sink?.record({ job: def.name, phase: 'done', durationMs, at: new Date().toISOString() });
  if (opts.heartbeatDir !== undefined) {
    writeHeartbeat(opts.heartbeatDir, def.name, outcome, log);
  }
  return outcome;
}
```

**Registry registration pattern** (from `packages/scheduler/src/registry.ts` lines 121-154):
```typescript
// Source: packages/scheduler/src/registry.ts lines 121-154
// Pattern: the registry calls runStubTick — Phase 2 keeps this unchanged
// Real poll logic lives INSIDE runStubTick body, not in the registry
export function registerStubJobs(
  log: TickLogger,
  mod: SchedulerModule = cron,
  opts: RegisterOptions = {},
): RegistryHandle {
  assertSchedulerGuards(mod);
  const tasks = STUB_JOBS.map((def) => {
    const task = mod.schedule(
      def.expression,
      () => runStubTick(def, log, { sink: opts.sink, heartbeatDir }),
      { name: def.name, timezone: SCHEDULER_TIMEZONE, noOverlap: true, maxRandomDelay: def.maxRandomDelayMs },
    );
    task.on('execution:overlap', () => {
      log.child({ job: def.name }).warn('tick skipped: previous run pending');
    });
    void task.start();
    return task;
  });
  return { tasks, stop: () => { for (const t of tasks) void t.stop(); } };
}
```

---

## Shared Patterns

### zod v4 at every external boundary
**Source:** `packages/db-hot/src/schema.ts` (lines 135-151), `packages/dedup/src/fingerprint.ts` (lines 40-46)
**Apply to:** All new packages — Jina response, Scout input, scratchpad rows, browser URL validation
```typescript
// Pattern: z.object().parse() at boundary, z.infer<> types, .catchall(z.unknown()) for PB rows
const Input = z.object({ url: z.string().min(1), title: z.string().min(1) });
export type Input = z.infer<typeof Input>;
```

### Injectable ports for testability
**Source:** `packages/dedup/src/precheck.ts` (lines 17-30), `packages/db-hot/src/client.ts` (lines 22-37)
**Apply to:** `packages/browser` (fake Browser/Context), `packages/sanitize` (mocked fetch), `packages/db-hot/scratchpad` (fake PB collection)
```typescript
// Pattern: define minimal interface, inject via options param, default to real impl
export interface FetchLike { (url: string, init?: Record<string, unknown>): Promise<FetchLikeResponse>; }
export interface PbCollectionLike {
  getFirstListItem(filter: string): Promise<Record<string, unknown>>;
  create(body: Record<string, unknown>): Promise<Record<string, unknown>>;
  update(id: string, body: Record<string, unknown>): Promise<Record<string, unknown>>;
}
```

### pino child loggers per pipeline
**Source:** `packages/logger/src/index.ts` (lines 48-50), `packages/scheduler/src/jobs.ts` (line 132)
**Apply to:** All new packages — `child({ pipeline: 'scout' })`, `child({ pipeline: 'fetch' })`, `child({ pipeline: 'browser' })`
```typescript
// Pattern: create base logger, per-module child with pipeline binding
import { child } from '@zod/logger';
const log = child({ pipeline: 'sanitize' });
log.info({ url, bytes }, 'fetch complete');
```

### Package scaffold (package.json + tsconfig.json + vitest.config.ts)
**Source:** `packages/scheduler/package.json`, `packages/scheduler/tsconfig.json`, `packages/scheduler/vitest.config.ts`
**Apply to:** All three new packages (`browser`, `sanitize`, `scout`)
```jsonc
// Standard package shape — copy verbatim, change name + deps
{
  "name": "@zod/<name>",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": { ".": { "types": "./dist/index.d.ts", "default": "./dist/index.js" } },
  "scripts": { "build": "tsc -b", "test": "vitest run" },
  "devDependencies": { "typescript": "~5.9", "vitest": "^3.2.7" }
}
```

### Loud failure at boundaries
**Source:** `packages/dedup/src/fingerprint.ts` (lines 52-56), `packages/scheduler/src/jobs.ts` (lines 163-166)
**Apply to:** All new packages — throw on invalid input, never silently coerce
```typescript
// Pattern: validation failures throw immediately, never return null/guess
if (trimmed === '') {
  throw new Error('normalizeUrl: empty URL');
}
```

### ESM import convention
**Source:** All Phase 1 files use `.js` extension on relative imports
**Apply to:** All new files
```typescript
// Pattern: always use .js extension on relative imports (nodenext module resolution)
import { fingerprint } from './fingerprint.js';
import { env } from '@zod/config';
```

## No Analog Found

Files with no direct codebase analog (greenfield packages — planner must use RESEARCH.md verified excerpts):

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| `packages/browser/src/queue.ts` | service (semaphore) | request-response | No semaphore/queue pattern exists in codebase; RESEARCH.md Pattern 2 has verified p-limit code |
| `packages/sanitize/src/jina.ts` | service (HTTP client) | request-response | No HTTP client exists in codebase; RESEARCH.md Pattern 1 has verified Jina fetch code |
| `packages/sanitize/src/strip.ts` | utility (transform) | transform | No HTML sanitizer exists; RESEARCH.md Pattern 3 has verified cheerio/turndown code |
| `packages/sanitize/src/fetch.ts` | service (facade) | request-response | No fetch facade exists; RESEARCH.md Patterns 1+3 compose the facade |
| `packages/scout/src/expiry.ts` | utility (pure) | transform | No date-parsing logic exists; RESEARCH.md Pattern 4 has verified date-fns code |
| `packages/scout/src/spam.ts` | utility (pure) | transform | No spam filter exists; RESEARCH.md Pattern 4 has the strategy |

## Metadata

**Analog search scope:** `packages/**/src/**/*.ts`, `apps/**/src/**/*.ts`, `packages/**/package.json`, `packages/**/tsconfig.json`, `packages/**/vitest.config.ts`
**Files scanned:** 8 analog files read in full (all ≤ 2000 lines)
**Pattern extraction date:** 2026-10-15
**Phase 1 PATTERNS.md consulted:** `/home/jizelxprince/projects/zod-root/zod/.planning/phases/01-foundation/01-PATTERNS.md` — format followed, greenfield convention extended with analog-aware assignments where Phase 1 code now exists
**Key transition from Phase 1:** Phase 1 was fully greenfield (0 analogs). Phase 2 has 6 files with direct analogs (existing Phase 1 files to extend) and 6 greenfield files with RESEARCH.md verified excerpts.
