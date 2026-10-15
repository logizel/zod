# Phase 02: Scraper Foundation - Research

**Researched:** 2026-10-15
**Domain:** URL → capped-markdown fetch pipeline (Jina-first + headless fallback), pre-scrape Scout filter, PB-backed scratchpad STEP_1→STEP_2
**Confidence:** MEDIUM-HIGH

## Summary

Phase 2 builds the `fetch(url) → capped markdown` contract every later agent depends on, plus the two gates that protect it: the Scout pre-filter (SWM-01, before any scrape/LLM spend) and the `task_scratchpad` STEP_1→STEP_2 lifecycle with crash-resume and 5-retries-then-tombstone (SWM-03). The sanitizer must prove ≥85% byte reduction vs raw HTML (ING-06).

The highest-value findings from this session: (1) **live probe confirms the Jina contract** — `GET https://r.jina.ai/<url>` returns a `Title:/URL Source:/Markdown Content:` envelope, `Authorization: Bearer <key>` is the keyed scheme (invalid key → 401 vs 200 keyless), keyless quota is 20 RPM and keyed is 500 RPM; (2) **the installed `node-cron@4.6.0` already supports `noOverlap` + `maxRandomDelay`** — the STACK.md "kelektiv/node-cron (NOT node-cron)" wording is stale and the planner must NOT switch to kelektiv's `cron` npm package (different `CronJob`-class API, no jitter option); (3) **`task_scratchpad.step_position` is a free string in the locked schema, not an enum** — STEP_1..STEP_4 literals live only in convention, so Phase 2 must enforce them at app level without touching the one-way-locked schema; (4) **PB SDK has no native upsert** — scratchpad writes go through `getFirstListItem(filter)` → 404-means-create / else `update(id)`; (5) **SSRF guard is a Phase 2 security requirement** — the fetcher must refuse private-range URLs or a poisoned candidate URL can reach Oracle instance metadata (`169.254.169.254`).

**Primary recommendation:** Build three new packages — `packages/sanitize` (Jina-first client with 30s cap + fail-trigger fallback into `packages/browser`), `packages/browser` (one `chromium.launch()` + `p-limit(2)` FIFO queue + fresh-context-per-job + route-level media abort), and Scout + scratchpad-store modules — reusing the Phase 1 `TaskScratchpad` schema, `precheck` gate, `env.parse()` gate, and pino child loggers unchanged.

## User Constraints (from CONTEXT.md)

### Locked Decisions

#### Fetch + sanitizer pipeline
- **D-01:** Jina-first strict — every URL goes to Jina Reader first; headless browser is fallback only, never default — **Reversibility:** costly — swapping default fetch path touches every pipeline caller
- **D-02:** Browser fallback triggers on fail signals only — Jina empty/short output, HTTP error, or explicit throttle; no JS-sniffing heuristic in v1
- **D-03:** Capped markdown at 8k chars — balanced for free-tier LLMs, avoids 413s by construction
- **D-04:** Keep links in sanitized markdown — official/aggregator links must survive for 2-hop audit; strip scripts/styles/SVG/nav/footer aggressively, abort images/fonts/video
- **D-05:** Prove ≥85% cut by byte comparison — raw HTML bytes vs capped markdown bytes on representative sources (not token estimate)
- **D-06:** Keyed Jina (JINA_API_KEY in env, never in repo) — higher rate limits vs keyless
- **D-07:** 30s per-fetch cap before fallback — fast fail to avoid head-of-line block

#### Browser queue behavior
- **D-08:** Max 2 concurrent tabs — lower RAM, safer on ARM with 2.5GB reclaim buffer (criterion allows ≤3, we hold 2) — **Reversibility:** costly — concurrency change alters RAM + throughput profile under scheduler load
- **D-09:** Strict FIFO, no priority lanes in v1 — simplest fair ordering; revisit lanes only on evidence of head-of-line block
- **D-10:** Fresh browser context per job — isolates cookies/sessions (X/LI posture), prevents leak
- **D-11:** Backpressure on overflow — scheduler waits, never drops URLs
- **D-12:** Block media at route level (`**/*.{png,jpg,jpeg,woff2,mp4}` abort) + media-off launch args
- **D-13:** 30s per-navigation timeout — fast fail, frees tab quickly
- **D-14:** `playwright-core` + `--only-shell` chromium (small ARM footprint), never full `playwright` on VM
- **D-15:** Strict close discipline — close context after every fetch; leak = OOM on ARM

#### Scout pre-filter rules
- **D-16:** Strict expiry — reject past-date items from title/snippet date parse, no grace window
- **D-17:** Aggressive spam filter from title/snippet alone — beyond obvious crypto/casino/adult; false-positive bias toward precision (drop noise over saving edge cases)
- **D-18:** Date parsing via `date-fns` (+ `date-fns-tz` for IST display) — reject on unparseable-past per Scout contract
- **D-19:** Scout runs before any scrape and before LLM spend — title/snippet gate only; full fetch only for survivors

#### Scratchpad lifecycle
- **D-20:** Phase 2 scope is STEP_1 (discovered) → STEP_2 (sanitized) only — full STEP_1..4 rows exist in schema but STEP_3/4 writers land in Phase 3/4 — **Reversibility:** one-way — STEP semantics are depended on by Phase 3 baton-pass + Phase 4 auditor
- **D-21:** PB-backed persistence — `task_scratchpad` row is source of truth (candidate_url unique point lookup); no memory-first caching in v1
- **D-22:** Crash resume by URL — resume STEP_1..2 position via candidate_url lookup after crash, never restart fresh
- **D-23:** 5 retries per URL (user freeform override of 3) then tombstone as failed — attempts + last_error tracked on row

### Agent's Discretion
No "you decide" selections — user chose concrete options for all 24 decisions. Researcher/planner have flexibility on: exact cheerio strip selector list, turndown vs readability fallback choice, fingerprint-vs-Scout ordering micro-detail, heartbeat/metric naming, and exact index sets — as long as success criteria and locked decisions above hold.

### Deferred Ideas (OUT OF SCOPE)
None — discussion stayed within phase scope. No scope creep raised; no todos folded (todo match count 0).

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| ING-06 | Sanitizer strips scripts/styles/SVG/nav via Jina-first + shared headless browser fallback, cutting token payload ≥85% | Jina fetch contract + cheerio/turndown pipeline + byte-comparison proof method below; D-01..D-07 |
| SWM-01 | Scout rejects expired items and obvious spam from titles/snippets before any scrape | date-fns parse/isPast/isValid + aggressive keyword filter operating on title/snippet only; D-16..D-19 |
| SWM-03 | Every candidate URL gets a persistent Task_Scratchpad (STEP_1..STEP_4 + partial_stream_buffer) in local memory | PB `task_scratchpad` get-or-create + STEP_1→STEP_2 transitions + resume-by-URL + retry/tombstone; D-20..D-23 (STEP_3/4 writers deferred to Phase 3/4) |

## Project Constraints (from AGENTS.md)

- **Cost:** Zero monthly infra + LLM — permanent free tiers only (Jina free keyed tier qualifies; no paid fetcher).
- **Compute:** Hold 22–30% RAM via 2.5GB cache buffer — browser package must stay inside the 2-tab budget; never `browser.launch()` per scrape.
- **Single language/toolchain:** Node 22 + TypeScript strict + pnpm 10 workspaces; `zod` v4 `z.infer` at every external boundary; boundary failures stay LOUD via `Schema.parse()`.
- **Scheduler:** Single scheduler module owns all jobs; `packages/scheduler` already uses `node-cron@^4.6.0` with `noOverlap` + `maxRandomDelay` (verified below — keep it).
- **Logging:** `pino` JSON to stdout + per-pipeline child loggers; `pino-pretty` dev only.
- **Secrets:** `dotenv` + `zod` `env.parse()` fail-fast gate at entrypoint; JINA_API_KEY follows the same contract (never in repo).
- **Tests:** `vitest` from day one for pure functions (Scout parsers, strip selectors, retry math are ideal unit targets).
- **PB:** `localhost:8090` only, never `0.0.0.0`; scratchpad rows are the durable state token.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Jina-first fetch + fail-trigger fallback | API / Backend (scheduler process) | — | Outbound HTTP from the single scheduler process; no browser involved on the happy path, zero RAM cost |
| Shared headless browser queue | API / Backend (singleton package) | — | One `chromium.launch()` owned by `packages/browser`; all pipelines consume the `fetchHtml(url)` facade, never Playwright APIs directly |
| HTML → capped-markdown sanitize | API / Backend (`packages/sanitize`) | — | Pure function stage (cheerio strip → turndown → 8k cap) applied to both Jina and browser outputs before any LLM sees them |
| Scout expiry/spam pre-filter | API / Backend (pipeline stage) | — | Runs on title/snippet strings before any fetch; chains AFTER the Phase 1 `precheck` dedup gate |
| Task_Scratchpad STEP_1→STEP_2 lifecycle | Database / Storage (PocketBase hot) | — | PB row is the source of truth; crash resume is a `candidate_url` point lookup, never an in-memory rebuild |
| Tombstone-on-exhaustion (5 retries) | Database / Storage (PB mirror + Turso cold) | — | Terminal `failed` rows written to the hot tombstone mirror; cold-ledger batching stays Phase 7 GC scope |

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Node built-in `fetch` + `AbortSignal.timeout` | Node 22 (repo `engines: >=22`) [VERIFIED: package.json] | Jina Reader HTTP client with 30s per-fetch cap | Zero deps; `AbortSignal.timeout(30_000)` is the exact D-07 mechanism; native Undici on 22 |
| `cheerio` | `^1.1` (registry `1.2.0`, verified 2026-10-15) [CITED: https://github.com/cheeriojs/cheerio] | Strip scripts/styles/SVG/nav/footer from browser-fetched HTML | jQuery-like API; `remove()` deletes subtrees entirely; `.prop('innerText')` skips script/style source where `.text()` does not [CITED: /cheeriojs/cheerio via Context7] |
| `turndown` | `^7.2` (registry `7.2.4`, verified 2026-10-15) [CITED: https://github.com/mixmark-io/turndown] | HTML → Markdown keeping links + tables | `new TurndownService({ headingStyle: 'atx', codeBlockStyle: 'fenced' })`; links/tables preserved by default; `turndown(html)` is the single call [CITED: /mixmark-io/turndown via Context7] |
| `playwright-core` | `^1.64` (registry `1.64.1`, verified 2026-10-15) [CITED: https://github.com/microsoft/playwright] | Shared headless Chromium (fallback path only) | `chromium.launch()` once + `browser.newContext()` per job + `context.route(glob, abort)` + `context.close()` in `finally` is the verified upstream pattern [CITED: /microsoft/playwright via Context7]; `--only-shell` install keeps ARM image small |
| `p-limit` | `^7` (registry `7.3.3`, verified 2026-10-15) [CITED: https://github.com/sindresorhus/p-limit] | Max-2-tab FIFO semaphore for the browser queue | `pLimit(2)` starts queued jobs in call order (FIFO per D-09) with backpressure by awaiting (D-11); ESM-only (`"type": "module"` on registry) — compatible with this ESM monorepo, import as `import pLimit from 'p-limit'` |
| `date-fns` | `^4` (registry `4.4.0`, verified 2026-10-15) [CITED: https://github.com/date-fns/date-fns] | Scout date parse + strict-past check | `parseISO` for ISO strings, `parse` with explicit format list, `isValid` guard (NaN-time check), `isPast` strict `< Date.now()` [CITED: /date-fns/date-fns via Context7] |
| `date-fns-tz` | `^3` (registry `3.2.0`, verified 2026-10-15) | IST display of parsed deadlines | Companion to date-fns v4 (`TZDate`/Intl-based formatting) [CITED: /date-fns/tz via Context7] |
| `pocketbase` JS SDK | Keep repo pin `^0.28.1` (registry `0.28.1`, verified 2026-10-15) [VERIFIED: packages/db-hot/package.json] | Scratchpad CRUD through existing `db-hot` client | `getFirstListItem(filter)` (throws 404 when absent) + `create` + `update(id)` PATCH is the documented upsert emulation [CITED: /pocketbase/js-sdk via Context7] |
| `node-cron` (mainline) | Keep repo pin `^4.6.0` [VERIFIED: packages/scheduler/package.json] | Unchanged scheduler cadence owner | Installed `node-cron@4.6.0` type definitions declare `noOverlap?: boolean` and `maxRandomDelay?: number` on `TaskOptions` [VERIFIED: node_modules/.pnpm/node-cron@4.6.0/node_modules/node-cron/dist/node-cron.d.ts:26-41] — no scheduler dependency change needed in Phase 2 |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `eventsource` | Keep repo pin `^5.1.3` | Already installed for PB realtime; scratchpad needs no SSE in Phase 2 | No new install |
| `zod` v4 | `^4.6.7` (registry `4.6.7`) | Validate Jina envelope, Scout input, scratchpad rows | Every external boundary per project convention |
| `pino` v10 | `^10.4.0` (registry `10.4.0`) | Per-pipeline child loggers (`scout`, `fetch`, `browser`) + JINA key redaction | Always; never log `Authorization` header value |
| `vitest` | Keep repo pin `^3.2.7` — do NOT upgrade to registry latest `5.0.4` | Unit tests for Scout parsers, strip pipeline, retry math | Phase 1 standardized on v3; a major bump mid-phase is unneeded churn |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `node-cron@4.6.0` (keep) | kelektiv `cron` npm package | REJECT: different API (`CronJob` class, `waitForCompletion` instead of `noOverlap`, no `maxRandomDelay` jitter) [CITED: https://raw.githubusercontent.com/kelektiv/node-cron/main/README.md] — switching rewrites the Phase 1 scheduler registry for zero gain |
| `p-limit` | Hand-rolled 20-line semaphore | Hand-roll only if `p-limit` ESM import fights the Vitest config; p-limit is 340M-downloads/week standard — prefer it |
| `turndown` | `readability` (`@mozilla/readability`) article extraction | Readability is better at boilerplate removal on article pages but drops link tables aggressively; D-04 (keep links) favors turndown post-cheerio-strip. Planner MAY add readability as a fallback branch (explicit agent's-discretion allowance), not the default |
| Jina Reader default | Self-hosted Crawl4AI Docker | Only on evidence of persistent Jina 402/429 throttling; the sanitize contract (URL in → capped markdown out) is unchanged so the swap is a fetcher flip, never a pipeline rewrite |

**Installation:**
```bash
pnpm --filter @zod/browser add playwright-core@^1.64 p-limit@^7
pnpm --filter @zod/sanitize add cheerio@^1.1 turndown@^7.2
pnpm --filter @zod/scout add date-fns@^4 date-fns-tz@^3
pnpm exec playwright-core install --only-shell chromium   # ARM VM, headless-shell only (D-14)
```

**Version verification:** All six versions above confirmed via `npm view <pkg> version` on 2026-10-15 (cheerio 1.2.0, turndown 7.2.4, date-fns 4.4.0, date-fns-tz 3.2.0, playwright-core 1.64.1, p-limit 7.3.3, zod 4.6.7, vitest latest 5.0.4 / repo-pinned 3.2.7, pocketbase 0.28.1, eventsource 5.1.3, dotenv 18.0.8).

## Package Legitimacy Audit

Consulted the legitimacy seam on 2026-10-15 for all six new installs.

| Package | Registry | Age | Downloads | Source Repo | Verdict | Disposition |
|---------|----------|-----|-----------|-------------|---------|-------------|
| `cheerio` | npm | est. 2012 (v1.2.0 pub 2026-01-23) | 27M/wk | github.com/cheeriojs/cheerio | OK | Approved |
| `turndown` | npm | est. 2016 (v7.2.4 pub 2026-04-03) | 10M/wk | github.com/mixmark-io/turndown | OK | Approved |
| `playwright-core` | npm | v1.64.1 pub 2026-10-14 | 125M/wk | github.com/microsoft/playwright | SUS (`too-new`) | Flagged — `too-new` only (published yesterday); Microsoft-official, 125M/wk, no postinstall. Planner must add `checkpoint:human-verify` before install per protocol |
| `p-limit` | npm | v7.3.3 pub 2026-09-18 | 340M/wk | github.com/sindresorhus/p-limit | SUS (`too-new`) | Flagged — `too-new` only (recent publish); sindresorhus-standard, 340M/wk, no postinstall. Planner must add `checkpoint:human-verify` before install per protocol |
| `date-fns` | npm | v4.4.0 current | very high | github.com/date-fns/date-fns | OK | Approved |
| `date-fns-tz` | npm | v3.2.0 current | high | date-fns org | OK | Approved |

**Postinstall check:** `npm view playwright-core scripts.postinstall` returns empty — no postinstall exfiltration vector on any of the six.
**Packages removed due to SLOP verdict:** none.
**Packages flagged as suspicious (SUS):** `playwright-core`, `p-limit` — both flagged SOLELY on the `too-new` recency heuristic despite official repos and 100M+ weekly downloads; treat as false-positive-shaped but keep the planner checkpoint per protocol.

## Architecture Patterns

### System Architecture Diagram

Phase 2 data flow (STEP_1→STEP_2 only; STEP_3/4 writers are Phase 3/4):

```
Scheduler tick (node-cron, single-flight)
    │ enqueue candidate {url, title, snippet}
    ▼
precheck() — fingerprint vs hot PB, then Turso tombstone   (Phase 1, reuse as-is)
    │ fresh? ──no──▶ DROP + telemetry
    ▼ yes
Scout pre-filter (title/snippet ONLY, zero fetch)           SWM-01
    │ strict-expiry reject? aggressive-spam reject?
    │──reject──▶ tombstone row (terminal, reason code) + telemetry
    ▼ survive
task_scratchpad row ← STEP_1 discovered                     SWM-03
    │ (getFirstListItem candidate_url → 404? create : resume by step_position)
    ▼
fetch(url) facade ──▶ Jina Reader FIRST (30s cap, keyed)    ING-06 / D-01
    │ fail signal? (HTTP error / empty-short / throttle)
    │──yes──▶ browser queue (p-limit 2, FIFO, fresh ctx,  media-abort, 30s nav)
    ▼ markdown (either path)
sanitize: cheerio strip → turndown → 8k cap → byte-compare log
    │
    ▼
task_scratchpad row ← STEP_2 sanitized (markdown in partial_buffer or linked store)
    │ attempts++, last_error on failure; 5 fails → tombstone `failed`
    ▼
(YIELD to Phase 3: STEP_3 audit reads STEP_2 markdown — zero re-scraping)
```

File-to-implementation mapping belongs in the planner's task breakdown; the packages are `packages/sanitize` (Jina client + strip pipeline + `fetch` facade), `packages/browser` (singleton + queue), Scout filter module, and a scratchpad-store module inside `packages/db-hot` or `packages/pipelines`.

### Recommended Project Structure

```
packages/
├── browser/          # SINGLETON: launch(), fetchHtml(url), shutdown(); p-limit(2) queue inside
│   └── src/{index,queue,singleton}.ts
├── sanitize/         # fetch(url) facade: jina() → fallback browser → strip() → cap()
│   └── src/{jina,strip,fetch}.ts
├── scout/ (or pipelines/scout.ts)  # prefilter({title,snippet}) → pass|expired|spam (pure, vitest-heavy)
│   └── src/{expiry,spam,index}.ts
├── db-hot/           # ADD scratchpad.ts: getOrCreate/resume/advanceToStep2/recordFailure (getFirstListItem upsert)
├── config/           # ADD JINA_API_KEY (required) to EnvSchema; 8k cap + thresholds as consts
└── scheduler/        # UNCHANGED registry; poll logic calls Scout → scratchpad → fetch facade
```

### Pattern 1: Jina-first fetch facade with fail-trigger fallback
**What:** One `fetch(url): Promise<CappedMarkdown>` function owns the D-01/D-02 policy. Every caller uses the facade; nobody branches on fetch mode.
**When to use:** Always — this is the D-01 one-way door; the facade is what makes a future Crawl4AI swap a one-file change.
**Fail-signal thresholds (recommended; planner may tune):** HTTP status ≠ 2xx → fallback; body missing `Markdown Content` section or total length < 500 chars → fallback ("short"); HTTP 402/429 or `Retry-After` present → fallback AND cool the Jina path briefly (in-memory 60s park, not a scheduler stop). No content sniffing for JS-gatedness in v1 per D-02.
**Jina request shape (live-verified 2026-10-15):** `GET https://r.jina.ai/<url>` with `Authorization: Bearer ${JINA_API_KEY}`, `Accept: text/plain` (default envelope) or `Accept: application/json`, plus `X-Timeout`, `X-Retain-Links: all` (D-04 link survival), `X-Retain-Images: none`, `X-No-Cache: true` when freshness matters (default 5-min/1h server cache otherwise) [VERIFIED: live curl probe 2026-10-15 — keyless 200 with `Title:/URL Source:/Markdown Content:` envelope; bogus Bearer → 401]. Rate envelope: 20 RPM keyless / 500 RPM keyed [CITED: https://jina.ai/reader].
**Example:**
```typescript
// Source: verified live probe 2026-10-15 + https://jina.ai/reader header table
import { env } from '@zod/config';

const JINA_TIMEOUT_MS = 30_000; // D-07
const SHORT_BODY_CHARS = 500;   // "short output" fail signal (planner-tunable)

export async function fetchViaJina(url: string): Promise<string> {
  const res = await fetch(`https://r.jina.ai/${url}`, {
    headers: {
      Authorization: `Bearer ${env.JINA_API_KEY}`, // never logged (pino redact)
      Accept: 'text/plain',
      'X-Timeout': '25',            // server-side bound inside our 30s cap
      'X-Retain-Links': 'all',     // D-04: links must survive
      'X-Retain-Images': 'none',   // D-04: images are token waste
      'X-Remove-Selector': 'nav, footer, .sidebar, #ads', // D-04 aggressive strip, server-side
    },
    signal: AbortSignal.timeout(JINA_TIMEOUT_MS),
  });
  if (!res.ok) throw new JinaFetchError(`jina ${res.status} for ${url}`);
  const body = await res.text();
  if (body.length < SHORT_BODY_CHARS) throw new JinaFetchError(`jina short body (${body.length}c)`);
  return body;
}
```

### Pattern 2: Shared-browser semaphore queue (max 2, FIFO, fresh context, close-in-finally)
**What:** Module-level lazy `chromium.launch({ headless: true, args: [...] })` singleton; all concurrency through `pLimit(2)`; each job creates its own `browser.newContext()`, registers the D-12 route abort, `page.goto(url, { timeout: 30_000, waitUntil: 'domcontentloaded' })`, returns `page.content()`, and closes the context in `finally`.
**When to use:** Every fallback fetch; also the byte-proof harness (raw HTML source).
**Media-off launch args (recommended):** `'--blink-settings=imagesEnabled=false'`, `'--mute-audio'`, `'--disable-dev-shm-usage'` (container/VM safety), plus route abort `**/*.{png,jpg,jpeg,webp,gif,svg,woff,woff2,ttf,mp4,webm}` → `route.abort()` (D-12 glob extended to font/video formats — planner-tunable). `waitUntil: 'domcontentloaded'` (not `networkidle`) so slow ad/media frames can't hold the tab past the 30s nav timeout (D-13).
**Headless-shell note:** Playwright selects the `chromium-headless-shell` executable automatically when `headless: true` with no channel [CITED: /microsoft/playwright via Context7 — `getExecutableName` returns `chromium-headless-shell` for headless]; install with `playwright-core install --only-shell chromium` on the ARM VM (D-14). Dev machine already has `chromium_headless_shell-1243` in `~/.cache/ms-playwright` [VERIFIED: shell listing 2026-10-15].
**Example:**
```typescript
// Source: Context7 /microsoft/playwright route-abort + isolated-context patterns
import { chromium, type Browser } from 'playwright-core';
import pLimit from 'p-limit';

let browser: Browser | null = null;
const slots = pLimit(2); // D-08 max 2, FIFO order, await = backpressure (D-09/D-11)
const MEDIA_GLOB = '**/*.{png,jpg,jpeg,webp,gif,svg,woff,woff2,ttf,mp4,webm}';

async function getBrowser(): Promise<Browser> {
  if (browser === null || !browser.isConnected()) {
    browser = await chromium.launch({
      headless: true,
      args: ['--blink-settings=imagesEnabled=false', '--mute-audio', '--disable-dev-shm-usage'],
    });
  }
  return browser;
}

export function fetchViaBrowser(url: string): Promise<string> {
  return slots(async () => {
    const ctx = await (await getBrowser()).newContext({ javaScriptEnabled: true }); // D-10
    await ctx.route(MEDIA_GLOB, (route) => route.abort()); // D-12
    try {
      const page = await ctx.newPage();
      await page.goto(url, { timeout: 30_000, waitUntil: 'domcontentloaded' }); // D-13
      return await page.content(); // raw HTML → sanitize pipeline
    } finally {
      await ctx.close(); // D-15: leak = OOM on ARM
    }
  });
}
```

### Pattern 3: Sanitize pipeline (cheerio strip → turndown → 8k cap) applied to BOTH paths
**What:** Jina markdown AND browser HTML both exit through one `sanitize()` that normalizes to capped markdown with links. Jina output is already markdown — run a light pass (drop image syntax, enforce cap) rather than re-parsing; browser HTML gets the full strip.
**Strip selector list (recommended starting set, planner-tunable):** `script, style, noscript, svg, nav, header, footer, aside, form, iframe, .sidebar, .comments, .related-posts, #ads, [aria-hidden="true"]` via `$('...').remove()` [CITED: /cheeriojs/cheerio via Context7]. Use `.prop('innerText')`-aware extraction where script/style residue is a risk (`.text()` includes script source [CITED: /cheeriojs/cheerio via Context7]).
**Cap rule (D-03):** hard slice at 8000 chars on the final markdown; keep the head (event/job pages front-load title/date/organizer). Record `capped: true` + original length on the scratchpad row so Phase 3 knows input was truncated.
**Byte-proof method (D-05):** `rawBytes = Buffer.byteLength(rawHtml, 'utf8')` vs `outBytes = Buffer.byteLength(cappedMarkdown, 'utf8')`; assert `outBytes <= 0.15 * rawBytes` on a fixed representative URL set (3–5 national portal pages incl. one JS-gated page via the browser path). For the Jina path there is no fetched raw HTML — fetch the same URLs via the browser path in the proof harness to obtain the denominator. Criterion is byte comparison, NOT token estimates.
**Example:**
```typescript
// Sources: Context7 /cheeriojs/cheerio (remove/prop) + /mixmark-io/turndown (options)
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
  $('a').each((_, el) => { // absolutize so kept links survive outside page context
    const href = $(el).attr('href');
    if (href !== undefined) $(el).attr('href', href);
  });
  const markdown = turndown.turndown($.html() ?? '');
  const rawBytes = Buffer.byteLength(html, 'utf8');
  const capped = markdown.length > MARKDOWN_CAP;
  return { markdown: capped ? markdown.slice(0, MARKDOWN_CAP) : markdown, capped, rawBytes };
}
```

### Pattern 4: Scout gate AFTER dedup precheck, BEFORE any fetch (pure functions, vitest-heavy)
**What:** `prefilter({ title, snippet }) → 'pass' | { reject: 'expired' | 'spam', reason }`. Order: `precheck()` (fingerprint + tombstone, Phase 1 reuse) FIRST, then Scout expiry, then Scout spam — Scout never runs on already-seen URLs, and nothing rejected ever reaches `fetch()`.
**Expiry parse strategy (D-16/D-18):** try `parseISO` first, then a fixed format list via `parse(candidate, format, new Date())` guarded by `isValid`, then `isPast` for the strict reject [CITED: /date-fns/date-fns via Context7]. Date candidates come from regex pre-extraction over title+snippet (e.g. ISO date, `dd MMM yyyy`, `MMM dd, yyyy`, `dd/MM/yyyy` patterns) — date-fns parses known formats, it does NOT find dates in free text, so the regex-extract-then-parse split is load-bearing [ASSUMED — standard practice, confirm format list against real portal titles in planning]. Unparseable + no future signal → per D-18 "reject on unparseable-past": if NO date is extractable at all, PASS (can't prove expired); if a date IS extracted and `isPast` → REJECT with zero grace. IST display via `date-fns-tz` for telemetry/rejection log.
**Spam strategy (D-17, precision-biased):** case-insensitive keyword/phrase blocklist matched on `title + ' ' + snippet`: crypto-giveaway (`airdrop`, `2x returns`, `double your`), casino/betting (`betting`, `casino`, `odds`), adult, plus generic noise (`viagra`, `loan offer`, `work from home earn ₹`, `telegram-only`). Exact list is planner discretion; ship as a config const with a vitest fixture table of must-reject/must-pass pairs. False-positive bias toward dropping is LOCKED — do not add an appeal path in Phase 2.

### Pattern 5: Scratchpad store (PB get-or-create, STEP_1→STEP_2, resume, 5-and-tombstone)
**What:** `getOrCreate(url)`, `advanceToStep2(id, markdownMeta)`, `recordFailure(id, error)` in one module; PB row is source of truth (D-21).
**Upsert emulation (no native PB upsert):** `getFirstListItem(\`candidate_url = '${escaped}'\`)` → 404 means `create`, else reuse/update by `record.id` [CITED: /pocketbase/js-sdk via Context7 — `getFirstListItem(filter)` signature + 404 behavior + `update(id, body)` PATCH]. Filter-escape candidate URLs containing single quotes (see Pitfalls) and rely on the `candidate_url (unique)` index for point-lookup cost [VERIFIED: packages/db-hot/src/schema.ts:206-217 — `task_scratchpad: ['candidate_url (unique)']` with comment "Resume-by-URL after a crash must be a point lookup."].
**Row shape (locked, read verbatim):** `candidate_url: z.url()`, `step_position: z.string().min(1)`, `partial_buffer: z.string().default('')`, `attempts: z.number().int().min(0).default(0)`, `last_error: z.string().nullable().default(null)` [VERIFIED: packages/db-hot/src/schema.ts:135-144]. **`step_position` is a free string, NOT an enum** — `'STEP_1'`/`'STEP_2'` literals are convention only; Phase 2 must define and enforce a `StepPosition = z.enum(['STEP_1','STEP_2','STEP_3','STEP_4'])` app-level type WITHOUT altering the locked schema (schema change = one-way migration per Phase 1 D-09). Store the STEP_2 markdown summary in `partial_buffer` (it is the cross-phase stream buffer per D-20/ARCHITECTURE) or a linked field — planner decides, capped at 8k so rows stay small.
**Resume rule (D-22):** on crash, `getOrCreate` returns the existing row; if `step_position` is already `STEP_2`, skip re-fetch entirely (idempotent resume); if `STEP_1`, re-run fetch (attempts NOT incremented on resume — only on genuine fetch failure).
**Retry/tombstone (D-23):** `recordFailure` increments `attempts` + sets `last_error`; at `attempts >= 5`, write terminal status to the hot `tombstone_ledger` mirror (`url_hash` unique point lookup [VERIFIED: packages/db-hot/src/schema.ts:206-217 — `tombstone_ledger: ['url_hash (unique)', 'fingerprint']`]) with reason `fetch_failed` and stop retrying. `url_hash` = `hashUrl(normalizeUrl(url))` via the Phase 1 fingerprint module (reuse, don't reimplement) [VERIFIED: packages/dedup/src/fingerprint.ts:52-79].

### Anti-Patterns to Avoid
- **Browser-first or parallel Jina+browser racing:** violates D-01 and doubles cost; the browser tab is fallback-only on fail signals, never speculative.
- **Raw HTML (or uncapped markdown) into any store/LLM path:** 413s + free-tier burn; the 8k cap runs before the scratchpad write, not after.
- **`browser.launch()` anywhere but the singleton + `page` without `context.close()` in `finally`:** RAM death on the ARM box; grep-verify in review (see Pitfalls).
- **Scout calling fetch "to check the date":** D-19 forbids it; title/snippet gate only.
- **Switching to kelektiv's `cron` package:** different API, no jitter; keep installed `node-cron@4.6.0`.
- **Full `playwright` package on the VM or headed browsers:** ~2x disk + X deps; `playwright-core` + `--only-shell` only (D-14).
- **Changing `TaskScratchpad` schema for STEP literals:** one-way migration trap; enforce literals at app level.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| HTML→Markdown conversion | Regex tag stripper | `cheerio` + `turndown` | Nested markup, entities, tables, link preservation — regex mangles all four; 10M+/wk libraries get it right |
| Date math/parse/validity | `Date.parse` + hand comparisons | `date-fns` `parse/parseISO/isValid/isPast` + `date-fns-tz` | `Date.parse` is implementation-vague on non-ISO; strict-past needs NaN-guarded validity first |
| Tab concurrency + FIFO + backpressure | Counter + array queue | `p-limit(2)` | D-08/D-09/D-11 in one call: concurrency cap, FIFO order, await-based backpressure |
| 30s fetch caps | `setTimeout` race wrappers | `AbortSignal.timeout(30_000)` | Native, no timer leaks, propagates through Undici fetch AND Playwright `timeout` option natively |
| Record upsert on PB | Read-modify-write without 404 branch | `getFirstListItem` → 404-create / else-update | Documented SDK pattern; handles the unique-index race explicitly |
| URL canonicalization for resume/tombstone keys | Lowercase-and-trim | Phase 1 `normalizeUrl` + `hashUrl` | Tracking-param strip, default-port clear, param sort already implemented + tested — reuse verbatim |

**Key insight:** Phase 2's reliability comes from composing verified primitives (Jina envelope, p-limit semaphore, PB 404-upsert, date-fns guards), not from novel code. The only bespoke logic is the fail-signal thresholds, the strip selector list, the spam keyword set, and the retry counter — all planner-tunable consts covered by vitest fixture tables.

## Common Pitfalls

### Pitfall 1: Jina cache serves a stale page and the pipeline treats it as fresh
**What goes wrong:** Jina caches URL content server-side (5-min–1h window; example.com probe returned a "cached snapshot" warning [VERIFIED: live probe 2026-10-15]). Deadline/prize fields drift while the pipeline snapshots stale markdown.
**Why it happens:** Default requests accept cached content; nothing in the envelope forces freshness.
**How to avoid:** Send `X-No-Cache: true` on re-audits/TBA re-pings; accept cached responses on first discovery (cheaper/faster). Log the cache warning when present.
**Warning signs:** `Markdown Content` identical across polls while the portal shows updates; "cached snapshot" text in stored markdown.

### Pitfall 2: "Short output" threshold misfires in both directions
**What goes wrong:** Threshold too high → every aggregator card falls back to the browser (D-01 violated in practice, tabs saturate); too low → JS-shell pages ("Enable JavaScript") pass as content and poison Phase 3 audits.
**Why it happens:** No JS-sniffing heuristic allowed in v1 (D-02), so length is the only content proxy.
**How to avoid:** Start at 500 chars (recommendation, planner-tunable) + a deny-phrase check for known shell strings (`just a moment`, `enable javascript`, `cf-challenge`) as a SECONDARY signal inside the "short" branch — not a standalone JS-sniffer, so D-02 holds. Emit telemetry on fallback cause (`jina_http`/`jina_short`/`jina_throttle`) so the threshold can be tuned with data.
**Warning signs:** Fallback rate >30% on plain article portals, or shell-text reaching STEP_2 rows.

### Pitfall 3: PB filter injection via `candidate_url` containing a single quote
**What goes wrong:** `getFirstListItem("candidate_url = 'https://x/y'z'")` breaks or mis-matches; resume-by-URL silently creates duplicates.
**Why it happens:** PB filter language interpolates single-quoted strings; URLs can legally contain `'`.
**How to avoid:** Escape single quotes in the filter value (double them per PB filter syntax) [ASSUMED — verify escaping rule against live PB in Phase 2 build] AND rely on the unique index to surface collisions loudly; add a vitest case with a quote-bearing URL. Never string-interpolate unescaped.
**Warning signs:** Duplicate `candidate_url` rows (unique-index violation errors in logs) or resume misses after crash.

### Pitfall 4: Orphaned contexts/tabs on error paths OOM the ARM box
**What goes wrong:** A `goto` timeout or `route` throw skips `ctx.close()`; Chromium RSS climbs until OOM-killer or idle-reclaim misreads the box.
**Why it happens:** Close placed after the fetch instead of in `finally`; long-lived contexts accumulate Playwright-internal objects even when pages close.
**How to avoid:** D-15 `finally`-close (see Pattern 2); review must grep-verify `newContext`/`newPage` pair with `close` in `finally`; add a browser-RSS telemetry gauge with recycle-at-threshold (recycle = `browser.close()` + null the singleton; lazily relaunch). 24h soak is the Phase 2 gate per PITFALLS.md Pitfall 5.
**Warning signs:** RSS trending up across hours; zombie `chrome` processes; scrapes slowing day-over-day.

### Pitfall 5: SSRF via malicious/poisoned candidate URLs
**What goes wrong:** A candidate URL pointing at `169.254.169.254` (Oracle instance metadata), `localhost:8090` (PB), or RFC-1918 ranges exfiltrates cloud credentials or hot DB content into markdown stores/logs.
**Why it happens:** The fetcher happily GETs whatever URL the poller enqueues; Jina-first partially shields (server-side fetch by Jina, not the VM) but the BROWSER fallback fetches from the VM directly.
**How to avoid:** SSRF guard in the facade BEFORE any fetch: allow only `http:`/`https:`, resolve hostname and refuse private/loopback/link-local ranges + `localhost`, refuse non-default ports except 80/443 [ASSUMED hardening list — standard practice]. Jina path additionally benefits from Jina's own egress, but guard both paths identically.
**Warning signs:** Scratchpad rows with `candidate_url` outside public space; metadata-shaped JSON in stored markdown.

### Pitfall 6: Cap slicing mid-link corrupts the 2-hop audit input
**What goes wrong:** Naive 8k `slice()` cuts inside `[text](https://...)` — Phase 4 Link-Hopper gets a broken official URL.
**Why it happens:** Head-cut keeps the head but links cluster anywhere in the body.
**How to avoid:** After slicing, truncate to the last `\n` before the cap AND regex-strip a trailing unterminated `[...](...` fragment; alternatively collect all link targets first and append a compact link footer within budget [ASSUMED technique — planner picks]. Jina's `X-With-Links-Summary` footer is a server-side alternative for the Jina path [CITED: https://jina.ai/reader].
**Warning signs:** Phase 4 reports of unreachable/partial official links traceable to STEP_2 rows.

### Pitfall 7: `step_position` free-string drift across phases
**What goes wrong:** Phase 2 writes `'step_2'`, Phase 3 expects `'STEP_2'` — resume/baton-pass silently restarts work.
**Why it happens:** Schema declares `z.string().min(1)` with no enum (see Pattern 5).
**How to avoid:** Single `StepPosition` zod enum in app code + `z.infer` type used by ALL writers/readers from Phase 2 on; add a vitest round-trip test (write row → read → position matches). Never scatter string literals.
**Warning signs:** Rows stuck at STEP_1 after successful fetch; Phase 3 re-scraping STEP_2-complete URLs.

### Pitfall 8: Jina 402/429 throttle misread as content failure
**What goes wrong:** Throttle responses trigger per-URL browser fallback — a Jina-side rate limit fans out into 2-tab browser pileup and the whole poll slows 10x.
**Why it happens:** Fail signals lumped together; throttle needs path-level cooling, not per-URL fallback alone.
**How to avoid:** Distinguish 402/429 (or `Retry-After`) → park the Jina path in-memory ~60s and route to browser DURING the park; count consecutive parks — sustained throttling pages the owner (possible key exhaustion; free tokens are finite per key). Never hammer a throttled path.
**Warning signs:** `jina_throttle` telemetry spikes correlated with poll boundaries; browser queue depth growing while Jina recovers.

## Code Examples

Verified patterns from official sources (links in Sources):

### Jina fetch with 30s cap + fail signals
```typescript
// Source: live probe 2026-10-15 + https://jina.ai/reader + https://github.com/jina-ai/reader README
const res = await fetch(`https://r.jina.ai/${targetUrl}`, {
  headers: {
    Authorization: `Bearer ${env.JINA_API_KEY}`,
    'X-Timeout': '25',
    'X-Retain-Links': 'all',
    'X-Retain-Images': 'none',
    'X-Remove-Selector': 'nav, footer, .sidebar, #ads',
  },
  signal: AbortSignal.timeout(30_000),
});
if (!res.ok) throw new JinaFetchError(res.status);
```

### PB scratchpad get-or-create (upsert emulation)
```typescript
// Source: Context7 /pocketbase/js-sdk getFirstListItem + create/update
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

### Scout expiry check skeleton
```typescript
// Source: Context7 /date-fns/date-fns parse/parseISO/isValid/isPast
import { parseISO, parse, isValid, isPast } from 'date-fns';

const FORMATS = ['dd MMM yyyy', 'MMM dd, yyyy', 'dd/MM/yyyy', 'yyyy-MM-dd'];
export function extractPastDate(text: string): Date | null {
  for (const candidate of extractDateCandidates(text)) { // regex pre-extraction (ASSUMED list — tune w/ fixtures)
    const d = candidate.includes('T') ? parseISO(candidate) : tryFormats(candidate);
    if (isValid(d) && isPast(d)) return d; // strict, no grace (D-16)
  }
  return null;
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `node-cron` (merencia) unmaintained, no `noOverlap` | `node-cron@4.6.0` ships `noOverlap` + `maxRandomDelay` in `TaskOptions` | v4 line (installed dep verified 2026-10-15) | STACK.md "use kelektiv fork, NOT node-cron" is STALE — mainline already has both locked options; no dependency change |
| Jina Reader default readability filtering only | `x-respond-with: markdown+frontmatter`, `x-retain-links: text/all`, `x-preset: agent/research` bundles | 2025–2026 reader SaaS evolution [CITED: https://github.com/jina-ai/reader README] | Prefer explicit `X-Retain-Links: all` + `X-Remove-Selector` headers over bare GET for D-04 guarantees |
| Full `playwright` + headed chromium on servers | `playwright-core` + `--only-shell` headless shell (auto-selected for `headless: true`) | Playwright ≥1.49 shell split [CITED: /microsoft/playwright via Context7] | D-14 is current best practice, not a compromise |
| Cheerio `.text()` for extraction | `.prop('innerText')` to skip script/style source | Cheerio docs (troubleshooting) [CITED: /cheeriojs/cheerio via Context7] | Use `innerText`-aware reads anywhere raw text is extracted |

**Deprecated/outdated:**
- kelektiv `cron` npm package AS a `node-cron` replacement: wrong API for this codebase (`CronJob` class, `waitForCompletion`, no jitter) — do not adopt.
- `vitest@5` upgrade mid-phase: repo standardized on `^3.2.7` in Phase 1; no Phase 2 feature needs v5.
- Unkeyed Jina as primary: 20 RPM keyless vs 500 RPM keyed — D-06 keyed path is mandatory, not optional, at poll cadences.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | PB filter single-quote escaping is quote-doubling (`''`) | Patterns 5, Pitfall 3 | Resume misses/duplicates; MUST verify against live PB in build + vitest with quote-bearing URL |
| A2 | `p-limit` dispatches queued jobs in FIFO call order | Standard Stack, Pattern 2 | D-09 ordering violated under contention; verify with a 10-job ordering unit test |
| A3 | 500-char "short body" threshold + shell-phrase secondary signal correctly splits real content from JS-shells | Pattern 1, Pitfall 2 | Fallback storms or shell-text in STEP_2 rows; tune from `jina_short` telemetry in build |
| A4 | Regex-extract-then-parse covers real portal deadline phrasings; no-date-at-all means PASS | Pattern 4 | Expired items slip through (recall loss) or valid items rejected; needs fixture table from real titles/snippets |
| A5 | SSRF guard list (scheme allow + private-range deny + port restrict) is sufficient for the browser path | Pitfall 5 | Metadata/PB exposure; review must confirm DNS-rebinding handling (resolve-then-validate TOCTOU) |
| A6 | Storing STEP_2 markdown head in `partial_buffer` (8k) keeps rows small enough for PB + Phase 3 reads | Pattern 5 | Row bloat / slow resume reads; planner may split to a linked field — flag for plan-check |
| A7 | `X-Remove-Selector` + `X-Retain-*` headers behave on keyed free tier exactly as documented | Pattern 1 | Sanitizer guarantees weaken on Jina path; fallback is the cheerio post-pass — verify on 2–3 real portals in build |

## Open Questions

1. **Exact `candidate_url` unique-index behavior on PB v0.40.5 (Phase 1 selected Option B server)**
   - What we know: SDK pattern + index intent verified; server version moved from v0.35.x to v0.40.5 in Phase 1.
   - What's unclear: Whether unique-index violation surfaces as 400 with a stable error shape the store module can branch on.
   - Recommendation: Probe during build; treat unique-violation as "row exists → re-read" fallback.

2. **Jina free-key token budget vs poll volume**
   - What we know: 500 RPM keyed; new keys carry 10M free tokens; Reader counts output tokens [CITED: https://jina.ai/reader].
   - What's unclear: Monthly token burn at events-20m + jobs-45m poll cadences with real page sizes.
   - Recommendation: Planner adds a burn-gauge telemetry task; sustained 402s trigger the Crawl4AI-swap decision (already scoped as fetcher flip).

3. **Representative URL set for the D-05 byte-proof**
   - What we know: Method defined (browser-path raw bytes vs capped markdown bytes).
   - What's unclear: Which 3–5 portals best represent JS-gated + static + aggregator shapes.
   - Recommendation: Planner fixes the list (e.g., Unstop event page, Devfolio, Luma, one ATS board, one bio-link page); proof is a vitest/integration drill, not manual.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node | All packages | ✓ (dev) | v26.11.1 (dev machine; VM target is 22.x) | Pin `engines >=22` already set; verify on VM image |
| pnpm | Workspace installs | ✓ | 10.34.7 | — |
| `r.jina.ai` reachability | Jina-first fetch | ✓ | Live 200-probe 2026-10-15 (0.44s keyless) | Browser path per D-02; keyed probe returned 401-on-bad-key confirming auth scheme |
| Chromium headless-shell | Browser fallback | ✓ (dev) / ✗ (VM assumed) | `chromium_headless_shell-1243` present in dev `~/.cache/ms-playwright` | Planner MUST include `playwright-core install --only-shell chromium` for the ARM VM |
| PocketBase `:8090` | Scratchpad writes | ✗ (dev, not running) | — | Phase 2 build must start local PB (Phase 1 runbook) before integration tests; unit tests use fakes |
| Python | Nothing in Phase 2 | n/a | 3.14.7 present | Crawl4AI fallback is out of scope unless Jina throttles |

**Missing dependencies with no fallback:**
- None blocking: all Phase 2 logic is unit-testable with fakes (PB client, fetch, browser page).

**Missing dependencies with fallback:**
- Local PB down → use in-memory fakes for unit tests; integration drill needs PB up (Phase 1 rebuild command covers it).
- VM chromium absent → `--only-shell` install step in plan.

## Validation Architecture

| Property | Value |
|----------|-------|
| Framework | `vitest ^3.2.7` (repo pin — keep, do not bump to 5.x) |
| Config file | repo `vitest` config (Phase 1) — extend `include` for new packages |
| Quick run command | `pnpm vitest run packages/scout packages/sanitize` |
| Full suite command | `pnpm build && pnpm test` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| ING-06 | cheerio strip + turndown + 8k cap on fixture HTML incl. JS-shell page | unit | `pnpm vitest run packages/sanitize/src/strip.test.ts` | ❌ Wave 0 |
| ING-06 | Byte-proof: capped bytes ≤15% of raw bytes on representative URL set | integration drill | `pnpm vitest run packages/sanitize/src/byteproof.test.ts` (browser-path denominator) | ❌ Wave 0 |
| ING-06 | Jina fail signals (HTTP err / short / throttle) route to browser exactly once | unit (mocked fetch) | `pnpm vitest run packages/sanitize/src/fetch.test.ts` | ❌ Wave 0 |
| SWM-01 | Expiry: past-date title/snippet rejects; future/TBA/no-date passes | unit fixture table | `pnpm vitest run packages/scout/src/expiry.test.ts` | ❌ Wave 0 |
| SWM-01 | Spam: fixture must-reject/must-pass pairs incl. edge cases | unit fixture table | `pnpm vitest run packages/scout/src/spam.test.ts` | ❌ Wave 0 |
| SWM-03 | get-or-create + STEP_1→STEP_2 + resume-after-crash (fake PB) | unit (fake HotStore) | `pnpm vitest run packages/db-hot/src/scratchpad.test.ts` | ❌ Wave 0 |
| SWM-03 | 5 failures → tombstone `failed` with attempts/last_error trail | unit | same file — retry-matrix cases | ❌ Wave 0 |
| (D-08..D-15) | Browser queue: ≤2 concurrent, FIFO order, close-on-error | unit (fake browser) + soak | `pnpm vitest run packages/browser/src/queue.test.ts` | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `pnpm vitest run <touched-package>`
- **Per wave merge:** `pnpm build && pnpm test`
- **Phase gate:** Full suite green + byte-proof drill PASS + 24h browser soak (RSS flat, zero zombies) before `/gsd-verify-work`

### Wave 0 Gaps
- [ ] `packages/browser/` scaffold + `src/queue.test.ts` (fake Browser/Context) — covers D-08..D-15
- [ ] `packages/sanitize/` scaffold + `src/strip.test.ts`, `src/fetch.test.ts`, `src/byteproof.test.ts` — covers ING-06
- [ ] Scout module scaffold + `src/expiry.test.ts`, `src/spam.test.ts` — covers SWM-01
- [ ] `packages/db-hot/src/scratchpad.ts` + `src/scratchpad.test.ts` (fake PB collection) — covers SWM-03
- [ ] `packages/config` env extension: `JINA_API_KEY` required + redaction test — covers D-06
- [ ] Framework install for new packages: `playwright-core@^1.64`, `p-limit@^7`, `cheerio@^1.1`, `turndown@^7.2`, `date-fns@^4`, `date-fns-tz@^3` (first two behind `checkpoint:human-verify`)

## Security Domain

`security_enforcement: true`, ASVS Level 1 [VERIFIED: .planning/config.json:46-50].

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | partial | JINA_API_KEY via env gate (`env.parse()` fail-fast); PB service account reuse from Phase 1 — never in repo/logs |
| V3 Session Management | no | No user sessions in Phase 2 (fresh browser context per job is isolation, not session mgmt) |
| V4 Access Control | no | No multi-actor resources yet; single-writer scratchpad rows |
| V5 Input Validation | yes | `zod` v4: target URL allow-shape (`http/https` + SSRF deny), Jina envelope shape, Scout input, scratchpad rows via `Schema.parse()` — LOUD failures |
| V6 Cryptography | no | No crypto implemented; SHA-256 reuse via Phase 1 fingerprint module only |

### Known Threat Patterns for fetch-before-LLM stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| SSRF to cloud metadata / localhost PB via poisoned candidate URL (browser path fetches from VM) | Tampering / Info disclosure | Facade SSRF guard: scheme allowlist + private/loopback/link-local deny + port restrict, applied to BOTH paths (Pitfall 5) |
| Secret leakage (JINA_API_KEY in logs/telemetry/scratchpad rows) | Info disclosure | pino redact list extended with `authorization`/`JINA_API_KEY`; never persist key or full headers; pre-commit scan already in Phase 1 |
| Stored-XSS payload in scraped markdown reaching Discord embeds (Phase 4) | Tampering | Sanitize keeps structure, not scripts — but Phase 2 MUST NOT decode entities into executable handlers; Discord-side escaping is Phase 4's gate — note the handoff |
| Throttle-induced fallback stampede (Jina 402/429 → all-URLs-to-browser) | Denial of service | Park-the-path cooling (Pitfall 8) + `p-limit(2)` bound + scheduler `noOverlap` already prevents poll pileup |
| Cache-poisoned stale content treated as fresh audit input | Tampering | `X-No-Cache` on re-fetches + log cache warnings (Pitfall 1) |

## Sources

### Primary (tool-verified this session)
- Live curl probe 2026-10-15: `GET https://r.jina.ai/https://example.com` → 200, `Title:/URL Source:/Markdown Content:` envelope, cached-snapshot warning; bogus `Authorization: Bearer` → 401 (auth scheme confirmed)
- `node_modules/.pnpm/node-cron@4.6.0/node_modules/node-cron/dist/node-cron.d.ts:26-41` — `TaskOptions` with `noOverlap?`, `maxRandomDelay?` (verbatim quote in Pattern discussion)
- `packages/db-hot/src/schema.ts:135-144` — `TaskScratchpad` shape: `candidate_url: z.url()`, `step_position: z.string().min(1)`, `partial_buffer`, `attempts`, `last_error` (verbatim)
- `packages/db-hot/src/schema.ts:206-217` — `INDEX_NOTES`: `task_scratchpad: ['candidate_url (unique)']`, `tombstone_ledger: ['url_hash (unique)', 'fingerprint']` (verbatim)
- `packages/dedup/src/fingerprint.ts:52-79` — `normalizeUrl` + `hashUrl` reuse surface (verbatim)
- `packages/scheduler/src/jobs.ts` + `packages/scheduler/package.json` — `node-cron@^4.6.0` pin, `maxRandomDelayMs` per-job fields
- `npm view` registry versions 2026-10-15: cheerio 1.2.0, turndown 7.2.4, date-fns 4.4.0, date-fns-tz 3.2.0, playwright-core 1.64.1, p-limit 7.3.3, zod 4.6.7, vitest 5.0.4-latest/repo-3.2.7, pocketbase 0.28.1, eventsource 5.1.3
- Legitimacy seam 2026-10-15: cheerio/turndown/date-fns/date-fns-tz OK; playwright-core/p-limit SUS (`too-new` only); no postinstall scripts anywhere

### Secondary (official docs via Context7/WebFetch — MEDIUM/LOW per seam)
- [CITED: https://jina.ai/reader] — 20 RPM keyless / 500 RPM keyed, header table (`X-Timeout`, `X-Retain-Links/Images`, `X-Remove-Selector`, `X-No-Cache`), 10M free tokens per new key
- [CITED: https://github.com/jina-ai/reader README] — header list, `x-respond-with` shapes, `x-preset` bundles, cache behavior
- [CITED: https://raw.githubusercontent.com/jina-ai/reader/main/cookbooks.md] — `x-preset: index/research/agent/spider` recipes, link-summary footer pattern
- [CITED: https://raw.githubusercontent.com/kelektiv/node-cron/main/README.md] — `cron` package `CronJob` API + `waitForCompletion` (basis for rejecting the switch)
- Context7 `/cheeriojs/cheerio` — `remove()`, `.text()` vs `.prop('innerText')`, `cheerio.load`
- Context7 `/mixmark-io/turndown` — `TurndownService` options, `turndown()`, `keep()`
- Context7 `/microsoft/playwright` — `context.route` abort globs, isolated contexts + `close()`, headless-shell executable selection
- Context7 `/date-fns/date-fns` — `parse`/`parseISO`/`isValid`/`isPast` semantics
- Context7 `/pocketbase/js-sdk` — `getFirstListItem` + 404, `create`, `update(id)` PATCH

### Tertiary (project-authoritative context)
- `02-CONTEXT.md` D-01..D-23 (locked), REQUIREMENTS.md ING-06/SWM-01/SWM-03, ROADMAP.md Phase 2 criteria, STACK/ARCHITECTURE/PITFALLS/SUMMARY.md research, `01-CONTEXT.md` D-09/D-12, AGENTS.md constraints

## Metadata

**Confidence breakdown:**
- Standard Stack: HIGH — registry versions + legitimacy + live Jina probe verified this session; only SUS flags are recency-heuristic noise on official packages
- Architecture: MEDIUM-HIGH — patterns assembled from verified upstream snippets + locked decisions; STEP literal-enforcement and markdown-storage location need planner confirmation (A6/A7)
- Pitfalls: MEDIUM — grounded in PITFALLS.md + live observations; PB escaping (A1) and SSRF edge cases (A5) need build-time probes

**Research date:** 2026-10-15
**Valid until:** 2026-11-14 (stable domain; re-verify Jina rate limits + playwright-core line if planning slips past 30 days)
