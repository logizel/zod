# Phase 5: Jobs + Loot Pipelines - Pattern Map

**Mapped:** 2026-10-16
**Files analyzed:** 39 new/modified (grouped; test files folded into per-area rows)
**Analogs found:** every row carries a cited analog; 5 rows have no *exact* analog (greenfield halves listed under "No Analog Found" — planner uses RESEARCH.md patterns for those halves only)

> Phase 4 built every primitive this phase composes (adapters, gates, dedup, router, fetch, scratchpad, registry). The dominant pattern is **mirror the existing contract, do not invent a new one**. The one genuinely new structural shape is the audit orchestrator, and even that has a verified precedent (`GatewayScheduler`, `packages/llm/src/registry-integration.ts`).

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `packages/orchestrator/package.json` | config | config | `packages/llm/package.json` | exact |
| `packages/orchestrator/tsconfig.json` | config | config | `packages/llm/tsconfig.json` | exact |
| `packages/orchestrator/vitest.config.ts` | config | config | `packages/scheduler/vitest.config.ts` | exact |
| `packages/orchestrator/src/globals.d.ts` | config | config | `packages/scheduler/src/globals.d.ts` | exact |
| `packages/orchestrator/src/index.ts` | entry | transform (barrel) | `packages/llm/src/index.ts` | exact |
| `packages/orchestrator/src/orchestrator.ts` | service | batch (drain → audit → write) | `packages/scheduler/src/jobs.ts` (`runStubTick`) | role-match |
| `packages/orchestrator/src/rule-packs/events.ts` | utility | transform (prompt+verdict schema) | `packages/discord-router/src/domain-filter.ts` (verdict union) | partial |
| `packages/orchestrator/src/rule-packs/jobs.ts` | utility | transform | `packages/discord-router/src/domain-filter.ts` | partial |
| `packages/orchestrator/src/rule-packs/loot.ts` | utility | transform | `packages/discord-router/src/domain-filter.ts` | partial |
| `packages/orchestrator/src/gates/jobs.ts` | utility | request-response (pure predicate) | `packages/discord-router/src/prize-gate.ts` | exact |
| `packages/orchestrator/src/gates/loot.ts` | utility | request-response (pure predicate) | `packages/discord-router/src/prize-gate.ts` | exact |
| `packages/orchestrator/src/integration.ts` | service | event-driven (tickHandler) | `packages/llm/src/registry-integration.ts` | exact |
| `packages/orchestrator/src/*.test.ts` (orchestrator, gates, rule-packs) | test | — | `packages/scheduler/src/poll-wiring.test.ts` + `packages/llm/src/router.test.ts` | role-match |
| `packages/dedup/src/merger.ts` | utility | transform (bounded fuzzy merge) | `packages/dedup/src/precheck.ts` | exact |
| `packages/dedup/src/merger.test.ts` | test | transform | `packages/dedup/src/fingerprint.test.ts` | exact |
| `packages/discord-router/src/portals/jobs/greenhouse.ts` | controller | CRUD (JSON API listing) | `packages/discord-router/src/portals/ctftime.ts` | exact |
| `packages/discord-router/src/portals/jobs/lever.ts` | controller | CRUD (JSON API listing) | `packages/discord-router/src/portals/ctftime.ts` | exact |
| `packages/discord-router/src/portals/jobs/ashby.ts` | controller | CRUD (JSON API listing) | `packages/discord-router/src/portals/ctftime.ts` | exact |
| `packages/discord-router/src/portals/jobs/hn-whoshiring.ts` | controller | CRUD (Algolia API + watermark) | `packages/discord-router/src/portals/ctftime.ts` | exact |
| `packages/discord-router/src/portals/jobs/cutshort.ts` | controller | scrape (cheerio) | `packages/discord-router/src/portals/unstop.ts` | exact |
| `packages/discord-router/src/portals/jobs/cuvette.ts` | controller | scrape (cheerio) | `packages/discord-router/src/portals/unstop.ts` | exact |
| `packages/discord-router/src/portals/jobs/workday.ts` | controller | request-response (JSON POST → browser fallback) | `packages/discord-router/src/portals/clist.ts` + `portals/unstop.ts` | role-match |
| `packages/discord-router/src/portals/jobs/boards.ts` | utility | file-I/O (seed + auto-learn rotation state) | `packages/scheduler/src/jobs.ts` (`writeHeartbeat`) | role-match |
| `packages/discord-router/src/portals/jobs/index.ts` | entry | — (list-fn table) | `packages/scheduler/src/jobs.ts` (`PORTAL_LIST_FNS`) | role-match |
| `packages/discord-router/src/portals/jobs/*.test.ts` | test | CRUD | `packages/discord-router/src/portals/ctftime.test.ts` | exact |
| `packages/discord-router/src/portals/loot/vendors.ts` | controller | CRUD (config-driven watchlist) | `packages/discord-router/src/portals/ctftime.ts` (+ `unstop.ts` scrape path) | role-match |
| `packages/discord-router/src/portals/loot/*.test.ts` | test | CRUD | `packages/discord-router/src/portals/ctftime.test.ts` | exact |
| `packages/scheduler/src/jobs.ts` (modify) | config | config | itself (existing `STUB_JOBS`/`GATEWAY_JOBS` tables) | exact |
| `packages/scheduler/src/registry.ts` (modify) | config | config | itself (`registerStubJobs`/`registerGatewayJobs`) | exact |
| `packages/scheduler/src/registry.test.ts` + `poll-wiring.test.ts` (modify) | test | — | itself | exact |
| `apps/scheduler/src/registry-start.ts` (modify) | entry | request-response | `packages/llm/src/registry-integration.ts` | role-match |
| `apps/scheduler/src/index.ts` (modify, if needed) | entry | request-response | itself | exact |
| `apps/scheduler/package.json` + `tsconfig.json` (modify) | config | config | itself | exact |
| `tsconfig.json` (root, modify) | config | config | itself | exact |
| `packages/db-hot/src/schema.ts` (modify) | model | CRUD | itself (D-14 one-way migration) | exact |
| `packages/config/src/env.ts` (modify) | config | config | itself | exact |
| `.env.example` (modify) | config | config | itself | exact |
| `packages/dedup/package.json` (modify) | config | config | itself (add `./merger` export + `string-similarity-js`) | exact |
| `packages/discord-router/package.json` (modify) | config | config | itself (add `./portals/jobs/*`, `./portals/loot/*` exports) | exact |
| `packages/discord-router/src/embed.ts` (modify) | component | transform | itself (`buildAuditCard`) | exact |
| `packages/discord-router/src/router-service.ts` (modify) | service | CRUD | itself (`resolveChannel`, Pitfall 8 fix) | exact |
| `packages/discord-router/vitest.config.ts` + `packages/dedup/vitest.config.ts` + `packages/scheduler/vitest.config.ts` (modify) | config | config | `packages/scheduler/vitest.config.ts` (alias block) | exact |

---

## Pattern Assignments

### Job/loot source adapters — `packages/discord-router/src/portals/jobs/{greenhouse,lever,ashby,hn-whoshiring}.ts` (controller, CRUD)

**Analog:** `packages/discord-router/src/portals/ctftime.ts` (git-tracked, 49 lines)

**Whole-file pattern — `PollCandidate` import + `list()` contract + 200-char snippet cap** (lines 1-49):
```typescript
/** PollCandidate shape shared with the scheduler tick pipeline. */
export interface PollCandidate {
  url: string;
  title: string;
  snippet: string;
}

export async function list(opts?: { since?: Date }): Promise<PollCandidate[]> {
  const url = new URL('https://ctftime.org/api/v1/events/');
  if (since) {
    url.searchParams.set('start', Math.floor(since.getTime() / 1000).toString());
  }

  const res = await fetch(url.toString());
  if (!res.ok) {
    return [];                      // non-ok → empty array, never throw (test asserts this)
  }

  const data = (await res.json()) as Array<{ /* ... */ }>;

  return data
    .map((ev) => ({
      url: ev.url,
      title: ev.title,
      snippet: ev.description.slice(0, 200),   // D-03/Pitfall 6: listing carries title+snippet only
    }));
}
```

**Key variants per adapter (same skeleton, different endpoint/parse):**
- Greenhouse: `https://boards-api.greenhouse.io/v1/boards/${boardToken}/jobs?content=true` → `data.jobs[]`; `url = absolute_url`, snippet = stripped `content`.slice(0,200) — **do NOT** carry `content` into the candidate (RESEARCH Pitfall 6).
- Lever: `https://api.lever.co/v0/postings/${site}?mode=json` → posts[]; `url = hostedUrl`, snippet = `descriptionPlain`.slice(0,200).
- Ashby: `https://api.ashbyhq.com/posting-api/job-board/${boardName}?includeCompensation=true` → `jobs[]`; `url`/`descriptionHtml` stripped.
- HN: two-call Algolia recipe (search_by_date → `items/${threadId}`), one top-level comment = one candidate; track `created_at_i` watermark (RESEARCH Pitfall 7).

**Import convention for sibling adapters** (line 1 of `clist.ts`):
```typescript
import { PollCandidate } from './ctftime.js';   // relative, .js extension, type-only in practice
```

**API-mode fetch with query params** (analog `packages/discord-router/src/portals/clist.ts` lines 10-18):
```typescript
export async function list(opts?: { since?: Date }): Promise<PollCandidate[]> {
  const url = new URL('https://clist.by/api/v1/json/event/');
  if (opts?.since) {
    url.searchParams.set('start__gte', opts.since.toISOString());
  }
  const res = await globalThis.fetch(url.toString());
  if (!res.ok) return [];
```

---

### Scrape-mode adapters — `portals/jobs/cutshort.ts`, `portals/jobs/cuvette.ts` (controller, scrape)

**Analog:** `packages/discord-router/src/portals/unstop.ts` (git-tracked, 26 lines)

**Whole-file pattern — browser fetch → cheerio → selector loop → absolutized URLs**:
```typescript
import { PollCandidate } from './ctftime.js';
import { fetchViaBrowser } from '@zod/browser';
import { load } from 'cheerio';

export async function list(opts?: { since?: Date }): Promise<PollCandidate[]> {
  const html = await fetchViaBrowser('https://unstop.com/competitions');
  const $ = load(html);
  const candidates: PollCandidate[] = [];

  $('.competition-card, .comp-card, article.competition').each((_, el) => {
    const $el = $(el);
    const title = $el.find('h3, h2, .title, .competition-title').first().text().trim();
    const snippet = $el.find('.description, .snippet, p').first().text().trim();
    const url = $el.find('a').first().attr('href') || '';
    if (!title || !url) return;                                  // skip malformed cards silently
    candidates.push({ url: new URL(url, 'https://unstop.com').href, title, snippet });
  });

  return candidates;
}
```
`fetchViaBrowser` queues through the shared 2-concurrency browser budget (`packages/browser/src/queue.ts` lines 5-6, 47) — Workday/Cutshort/Cuvette share this with the 5 scrape-mode event portals (D-03 tab-budget note). **Never call `chromium.launch()` directly.**

---

### `portals/jobs/workday.ts` (controller, request-response)

**Analog:** `packages/discord-router/src/portals/clist.ts` (JSON path) + `packages/discord-router/src/portals/unstop.ts` (fallback path)

Pattern: POST the observed `cxs` JSON listing first (`{ limit, offset, searchText, appliedFacets }` → `jobPostings[]`), map `externalPath` to absolute URL; the browser (`fetchViaBrowser`) is only the fallback for detail pages that render client-side. If any listing call throws, degrade to browser mode — the same try/catch→fallback shape as `packages/sanitize/src/fetch.ts` lines 73-85 (Jina → browser). Mark assumed shape A1 in code comment.

---

### `portals/jobs/boards.ts` (utility, file-I/O — D-02 seed + auto-learn rotation state)

**Analog:** `packages/scheduler/src/jobs.ts` `writeHeartbeat` (lines 253-273) — the repo's only atomic-append state-file precedent:

```typescript
function writeHeartbeat(dir: string, job: string, outcome: TickOutcome, log: TickLogger): void {
  try {
    mkdirSync(dir, { recursive: true });
    const finalPath = join(dir, `${job}.heartbeat`);
    const tmpPath = `${finalPath}.${Date.now()}.tmp`;
    writeFileSync(tmpPath, JSON.stringify({ job, at: new Date().toISOString(), durationMs: outcome.durationMs }));
    renameSync(tmpPath, finalPath);          // atomic tmp+rename — never a torn read
  } catch {
    log.warn({ job }, 'heartbeat write failed (watchdog will observe staleness)');
  }
}
```
Apply the same `mkdirSync → writeFileSync(tmp) → renameSync` discipline for the learned-board rotation JSON on the block volume (RESEARCH Open Question 2 recommendation). Seed list is a plain `const` array in this module; learned entries are pruned-able state. Read must tolerate a missing file (return seed only), never throw.

**Auto-learn trigger:** parse `boards.greenhouse.io/<slug>` / `jobs.lever.co/<slug>` / `jobs.ashbyhq.com/<slug>` out of aggregator/HN listing URLs during their adapters' `list()`; expose `learnBoard(url): Promise<boolean>` here and call it from the jobs tick.

---

### `portals/jobs/index.ts` (entry — list-fn table)

**Analog:** `packages/scheduler/src/jobs.ts` lines 174-206:

```typescript
/** Portal adapter list functions (D-01: all 7 national portals wired). */
export const PORTAL_LIST_FNS: readonly (() => Promise<PollCandidate[]>)[] = [
  listCtftime, listClist, listUnstop, listDevfolio, listDevpost, listLuma, listMeetup,
];

/** Fetch candidates from all portal adapters, merged and deduplicated by URL. */
export async function getPortalCandidates(): Promise<PollCandidate[]> {
  const results = await Promise.all(PORTAL_LIST_FNS.map((fn) => fn()));
  const merged = results.flat();
  const seen = new Set<string>();
  return merged.filter((c) => { if (seen.has(c.url)) return false; seen.add(c.url); return true; });
}
```
Build `JOB_LIST_FNS` / `getJobCandidates()` (same shape, includes the `boards.ts` learned boards fanning out to GH/Lever/Ashby), and `LOOT_LIST_FNS` / `getLootCandidates()` for the vendor watchlist. `Promise.all` fan-out is fine here (unlike browser mode).

---

### `packages/dedup/src/merger.ts` (utility, transform — D-09..D-11, the fuzzy layer)

**Analog:** `packages/dedup/src/precheck.ts` (git-tracked, 48 lines) — same package, same bounded-lookup contract

**Port/verdict structure to mirror** (lines 15-48):
```typescript
export type PrecheckVerdict = 'fresh' | 'hot-hit' | 'tombstoned';

export interface HotStore { hasFingerprint(fingerprint: string): Promise<boolean>; }
export interface ColdStore { findTombstone(urlHash: string): Promise<ColdTombstone | null>; }

export async function precheck(input: FingerprintInput, hot: HotStore, cold: ColdStore): Promise<PrecheckVerdict> {
  const digest = fingerprint(input);
  if (await hot.hasFingerprint(digest)) return 'hot-hit';
  const urlHash = hashUrl(normalizeUrl(input.url));
  const tombstone = await cold.findTombstone(urlHash);
  return tombstone === null ? 'fresh' : 'tombstoned';
}
```
Merger exposes the same shape: a `MergeStore` port (bounded candidate query — same pipeline, ±3d window; **never a full-store scan**), a discriminated result type (`{ merged: true, masterId, links } | { merged: false, possibleDupe: true }|{ merged: false }`), and it consumes `fingerprint.ts`' normalization:

**Title/company normalization + threshold** (extend `packages/dedup/src/fingerprint.ts` lines 48-79 conventions — same lowercase/strip approach):
```typescript
const MERGE_THRESHOLD = 0.9;  // D-09 locked initial — below threshold = flag only, NEVER merge
function normalizeTitle(t: string): string {
  return t.toLowerCase().replace(/\b(20\d{2})\b/g, ' ').replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
}
// score >= 0.9 AND ±3d window AND organizer/company key match  → merge (union links into master)
// score <  0.9                                                  → write 'possible dupe' flag, never merge
```
Use `string-similarity-js` (`similarity()` → [0,1]) — the audited library; do NOT hand-roll Dice/Levenshtein (RESEARCH Don't Hand-Roll, Pitfall 4: original `string-similarity` is deprecated and must not be installed).

**Late-dupe append (D-10):** if master `status ∈ {'audited','routed'}`, only union the link into `links.*` (never create an opportunity row, never re-post). Merged-away URL gets `terminal_status: 'merged'` in the tombstone ledger so the next poll short-circuits at precheck — write via `packages/db-cold/src/client.ts` `INSERT OR IGNORE` (lines 31-32) / hot mirror `packages/db-hot/src/scratchpad.ts` tombstone-write (lines 96-104).

**Package wiring:** `packages/dedup/package.json` — add `"./merger"` to `exports` (mirror the `./precheck` block, lines 13-16) and `"string-similarity-js": "2.1.4"` to `dependencies`; add alias to `packages/scheduler/vitest.config.ts` `resolve.alias` (mirror `'@zod/dedup/precheck'` line).

---

### `packages/orchestrator/src/orchestrator.ts` (service, batch)

**Analog:** `packages/scheduler/src/jobs.ts` `runStubTick` (lines 280-407) for the loop/error-isolation shape + `packages/llm/src/telemetry.ts` (lines 41-77) for the PB upsert idiom.

**Per-candidate isolation + injected deps + stage logging** (from `runStubTick`):
```typescript
const startedAt = Date.now();
const jobLog = log.child({ job: def.name });
jobLog.info('tick start');
opts.sink?.record({ job: def.name, phase: 'start', at: new Date(startedAt).toISOString() });

const bag: Record<string, any> = { ...(opts as any), ...(opts.stores ?? {}), ...(opts.deps ?? {}), ...(opts.context ?? {}), ...(opts.clients ?? {}) };
const pb = bag.pb ?? bag.pocketbase ?? bag.hotClient?.pb ?? bag.db;
const hot = bag.hot ?? bag.hotStore ?? bag.hotDb;
const cold = bag.cold ?? bag.coldStore ?? bag.coldDb ?? bag.tombstoneStore;

// per candidate:
for (const cand of candidates) {
  const cLog = jobLog.child({ candidate: cand.url });
  try { /* stage */ } catch (err) { cLog.warn({ stage, error: String(err) }, '... failed'); continue; }
}
```
The orchestrator drain is the **next loop**: read `task_scratchpad` rows at `step_position = 'STEP_2'` (the writers stop at STEP_2 today — `packages/db-hot/src/scratchpad.ts:79`), then audit → gates → write. Per-row failure must `continue`, never abort the drain.

**PB write idiom for the `opportunities` row** (mirror `writeBucketState`, `packages/llm/src/telemetry.ts` lines 22-24 + 53-76):
```typescript
interface PbLike { collection(name: string): { create(data: Record<string, unknown>): Promise<unknown>; update(id: string, data: Record<string, unknown>): Promise<unknown>; getList(...): ...; }; }
```
Use a local structural `PbLike`/`OpportunityCollection` interface (not the `pocketbase` type) — same decoupling convention as `telemetry.ts` and `scratchpad.ts` (lines 15-32). New rows must parse against `Opportunity` before write where practical; rejects write the tombstone row (`url_hash`, `fingerprint`, `terminal_status`, `source`, `decided_at`) to cold + hot mirror and NEVER create an `opportunities` row (logged-not-alerted contract, D-07).

**Audit call contract** (from `packages/llm/src/router.ts` lines 30-45, 138-158):
```typescript
const result = await router.complete({
  messages: ruleMessages as ChatMessage[],   // rule-pack system+user prompts
  step1: '',                                 // reserved; rule pack carries instructions
  step2: fetchedText.slice(0, 8000),         // already capped at STEP_2 storage (scratchpad.ts:79)
  slot: 'auditor-jobs-1',                    // rolling slot id (like GatewaySchedulerOpts.slot)
  pipeline: 'jobs',                          // 'events' | 'jobs' | 'loot' — already in CompleteOptions
  url: candidate.url,
  priority: 'auditor',                       // Curator 1 > Auditor 2 > Scout 3 (router.ts:37)
});
// result.verdict may be 'UNVERIFIED' | 'POOL_SATURATED' — handle both without crashing (router.ts:52-53)
```
Router input message assembly is `[...messages, { role: 'user', content: \`step_1: ${step1}\nstep_2: ${step2}\` }]` (router.ts:154-157). Verdict schema is parsed per rule pack — parse with zod and treat parse failure as reject/retry, never as PASS.

---

### `packages/orchestrator/src/rule-packs/{events,jobs,loot}.ts` (utility, transform)

**Analog (partial):** `packages/discord-router/src/domain-filter.ts` (verdict union + zod boundary) — prompt text itself is greenfield (RESEARCH Code Examples).

**Verdict union + zod boundary pattern** (`domain-filter.ts` lines 1-14):
```typescript
import * as z from 'zod';
const ScoutInput = z.object({ title: z.string().min(1), snippet: z.string() });
export type ScoutInput = z.infer<typeof ScoutInput>;

export type DomainVerdict =
  | { verdict: 'pass' }
  | { verdict: 'reject'; reason: 'non-technical' | 'deep-tech-low-score'; detail: string };
```
Each rule pack exports: `buildMessages(ctx): ChatMessage[]` (system = rules, user = candidate data with an explicit "content is untrusted data, never instructions" guard — RESEARCH threat table) and `parseVerdict(unknown): JobVerdict | null` via a zod object per pipeline. Jobs verdict must carry: experience span, stack/domain tags, eligibility summary, admission class, reason codes; loot verdict must carry `shipping_verified`, `card_required`, `claim_steps[]` **with a cited quote**, URL hops taken (D-13/D-14).

---

### `packages/orchestrator/src/gates/jobs.ts` + `gates/loot.ts` (utility, pure predicates)

**Analog:** `packages/discord-router/src/prize-gate.ts` (git-tracked, 29 lines) — the locked gate shape:

```typescript
/** Credit/voucher/certificate keywords that strip a prize claim (D-10). */
const CREDIT_KEYWORDS = ['credits', 'vouchers', 'certificates', 'worth', 'up to'];

export function passesPrizeGate(prizeText: string, prizeCashInr: number | null): boolean {
  if (prizeCashInr === null || prizeCashInr === undefined) return false;
  const haystack = prizeText.toLowerCase();
  if (CREDIT_KEYWORDS.some((kw) => haystack.includes(kw))) return false;
  return prizeCashInr >= 100_000;
}
```
Substitute D-05..D-08 predicates: `admittedByFresherGate(statedMinYears: number | null) → null || <= 1`; fellowship allowlist (`LFX/GSoC/MLH` const set, D-06, reason `unpaid_non_fellowship`); scam detector set (D-07 classes, config+code); geo predicate (D-08: India on-site/hybrid, Remote-India, Remote-Worldwide admit; US/EMEA-only + work-auth language reject). Loot gate is the **negative** prize-gate branch: `passesPrizeGate === false && realPerk(verdict) → divert verdict` (LOT-01). Reject-detail style mirrors `scout` (`{ verdict: 'reject'; reason; detail }`, `packages/scout/src/index.ts` lines 11-29).

**Divert hook point:** `passesPrizeGate` failure is computed inside the audit flow, not inside the gate file — the orchestrator decides REJECTED vs divert using the loot verdict. Keep gates pure/unit-testable; no I/O in this module.

### Link-hop reuse for loot FAQ reads (D-13)

**Source:** `packages/discord-router/src/link-hop.ts` lines 19-66 — `resolveOfficialDomain(url, maxHops = 2)` with SSRF guard per hop (`validateUrl` from `@zod/sanitize/fetch`, lines 54-58). The loot FAQ/rules read and ATS resolution must go through this (or `link-hop.ts`'s pattern) and respect the 2-hop cap; failure → tombstone `link_hop_failed` per Phase 4 D-06.

---

### `packages/orchestrator/src/integration.ts` (service, event-driven — the GatewayScheduler precedent)

**Analog:** `packages/llm/src/registry-integration.ts` (git-tracked, 134 lines) — **the exact pattern to copy.** `packages/llm` already depends on `@zod/scheduler-registry` (`packages/llm/package.json:22`), so `scheduler → orchestrator → llm → scheduler` would be a build cycle. The orchestrator must register its drain job the same way the gateway does:

```typescript
// registry-integration.ts lines 36-67
export class GatewayScheduler {
  private handle: ReturnType<typeof registerGatewayJobs> | null = null;
  constructor(private readonly opts: GatewaySchedulerOpts) {}
  start(log: TickLogger): void {
    const tickHandler = async (def: { name: string }, _log: TickLogger): Promise<void> => {
      switch (def.name) {
        case 'gateway-bucket-cooldown': this.recoverAllCooldownBuckets(writeTelemetry); break;
        case 'gateway-daily-cap-reset': this.resetAllDailyCaps(writeTelemetry); break;
        case 'gateway-warmup':          this.validateWarmup(log); break;
      }
    };
    this.handle = registerGatewayJobs(log, mod, { tickHandler });   // scheduler owns cron; llm owns handler
  }
  stop(): void { this.handle?.stop(); }
}
```
Orchestrator exports an `OrchestratorScheduler`-style class with `start(log)` / `stop()` and a `switch (def.name) { case 'audit-drain': … }`. **Do not** put orchestrator imports inside `packages/scheduler/src/*` (`runGatewayTick`'s injected `tickHandler` — `packages/scheduler/src/jobs.ts` lines 439-466 — exists precisely so the scheduler stays agnostic).

---

### `packages/scheduler/src/jobs.ts` (modify) — new job table entries

**Analog:** itself. **Extension points:**

1. New `StubJobDef` entries (expression + `maxRandomDelayMs` + `name` + `description`) — copy the table shape at lines 69-138. Index-calculation plan (do not drift the existing portal offsets):
```typescript
{
  name: 'jobs-poll',                 // job sources grouped tick — 30–60m band (ING-03)
  expression: '*/40 * * * *',        // stagger vs portal-* offsets; exact value = planner's call
  maxRandomDelayMs: 10 * 60_000,     // jobs-stub already uses 10m jitter (line 79) — reuse
  description: 'jobs sources poll — ATS JSON + aggregators + HN, every 40m + 10m jitter',
},
{ name: 'loot-watchlist', expression: '0 */5 * * *', maxRandomDelayMs: 15 * 60_000, description: 'vendor watchlist poll — low cadence (D-12)' },
{ name: 'audit-drain',    expression: '*/5 * * * *', maxRandomDelayMs: 60 * 1000,  description: 'orchestrator STEP_2 drain (registered via tickHandler)' },
```
`jobs-stub` (45m, exists) is the insertion point for the real jobs tick; either repurpose it or leave it and add named entries — the registry test asserts the table matches exactly, so update `packages/scheduler/src/registry.test.ts` in the same task.

2. `POLL_CANDIDATES`/`candidates` selection (line 305): `const candidates = (opts.candidates ?? bag.candidates ?? POLL_CANDIDATES)` — add a per-pipeline candidate source so jobs/loot ticks take `getJobCandidates()`/`getLootCandidates()`; keep the injection override for tests.

3. Merger insertion (D-10) — insert between the precheck block (lines 324-336) and the scout prefilter (lines 338-362): only call the merger when `verdict === 'fresh'`; `merged` → `continue` (link already unioned); `possibleDupe` → carry flag and continue the pipeline.

4. D-04 listing screen — same zero-fetch slot as `prefilter` (line 339): pure predicate on `title+snippet`; reject → tombstone `senior_role` (mirror the scout-tombstone write at lines 340-362) and `continue`.

---

### `packages/scheduler/src/registry.ts` (modify)

**Analog:** itself — `registerStubJobs` (lines 125-158) / `registerGatewayJobs` (lines 164-199). If new tables are added, extract a private `registerJobs(defs, tick, log, mod, opts)` that both existing functions delegate to (or add a third exported register fn with an injected `tickHandler` like lines 164-199). Preserve, verbatim:
```typescript
const task = mod.schedule(def.expression, () => runStubTick(def, log, { sink: opts.sink, heartbeatDir }), {
  name: def.name,
  timezone: SCHEDULER_TIMEZONE,     // 'Asia/Kolkata'
  noOverlap: true,
  maxRandomDelay: def.maxRandomDelayMs,
});
task.on('execution:overlap', () => {
  log.child({ job: def.name }).warn('tick skipped: previous run pending');
  opts.sink?.record({ job: def.name, phase: 'skip', at: new Date().toISOString() });
});
void task.start();
```
`assertSchedulerGuards` (lines 68-119) validates `[...STUB_JOBS, ...GATEWAY_JOBS]` — extend its iteration to include the new tables or expressions fail silently in the probe.

---

### `apps/scheduler/src/registry-start.ts` (modify — the live wiring)

**Analog:** `packages/llm/src/registry-integration.ts` (deps-object + injected handler) and `apps/scheduler/src/index.ts` (boot order: env → logger → start).

Current file (lines 6-10) is a 3-line passthrough with no deps injected. Target shape:
```typescript
import { startRegistry, registerGatewayJobs, type RegistryHandle, type TickLogger } from '@zod/scheduler-registry';

export function startSchedulerRegistry(log: TickLogger): RegistryHandle {
  // 1. build live deps once (pb via createPbClient(env), turso via createTursoClient(env).executor,
  //    hot/cold ports for precheck, router = new LlmRouter(telemetrySink))
  // 2. const handle = startRegistry(log, cron, { pb, hot, cold, candidates });   // injection override bag
  // 3. orchestrator.start(log)  ← registers audit-drain via tickHandler (cycle-free)
  return handle;
}
```
`runStubTick`'s resolver (jobs.ts lines 290-305) already accepts `pb`/`hot`/`cold`/`candidates`/`fetch` — no scheduler signature change is required for wiring, only the entrypoint. `apps/scheduler/package.json` + `tsconfig.json` must gain workspace deps/references for the newly imported packages (`@zod/db-hot`, `@zod/db-cold`, `@zod/dedup`, `@zod/sanitize`, `@zod/discord-router`, `@zod/orchestrator`) — copy the `references` array shape from `packages/scheduler/tsconfig.json` lines 10-17. Root `tsconfig.json` references must also gain `./packages/orchestrator` (note: `./packages/llm` and `./packages/discord-router` are currently absent from root refs — do not blindly copy, add the orchestrator ref alongside the app refs).

**PB/cold construction analogs:** `packages/db-hot/src/client.ts` `createPbClient(env)` (used by `router-service.ts` lines 63-69 with lazy `pbPromise`) and `packages/db-cold/src/client.ts` `createTursoClient(env)` + `clientExecutor` (lines 35-50).

---

### `packages/db-hot/src/schema.ts` (modify — D-14 one-way migration)

**Analog:** itself. Add nullable job fields (experience span, stack/domain tags array, eligibility summary) and loot fields (`shipping_verified: z.boolean().nullable().default(null)`, `card_required: z.boolean().nullable().default(null)`, `claim_steps: z.array(z.object({ step, quote })).default([])`) to the `Opportunity` object only (lines 71-96) — all nullable/defaulted so existing rows parse. Do NOT touch `HOT_COLLECTIONS` (lines 196-203) — no new collection. Update `INDEX_NOTES.opportunities` only if a new field needs an index (line 208) and note the change for the infra plan. `OpportunityRow` (lines 98-103) inherits automatically; the test fixture in `packages/discord-router/src/router-service.test.ts` (lines 10-30) is the canonical row sample to extend.

### `packages/config/src/env.ts` (modify) + `.env.example` (modify)

**Analog:** itself (lines 7-27). Add three channel-ID keys with defaults so boot never breaks:
```typescript
DISCORD_CHANNEL_JOBS_SYS_CLOUD: z.string().default(''),
DISCORD_CHANNEL_JOBS_GENERAL: z.string().default(''),
DISCORD_CHANNEL_LOOT: z.string().default(''),
```
(Pitfall 8: IDs are canonical `bucket_channel` values, names are the fallback.) `.env.example` mirrors every key — the two files already drift (schema requires `JINA_API_KEY`/`GROQ_API_KEY`/`GITHUB_TOKEN` that `.env.example` omits); fix the drift in the same task that adds keys (Pitfall 10). Add keys to `packages/logger/src/index.ts` REDACT_PATHS only if secret-shaped — channel IDs are not secret.

### `packages/discord-router/src/router-service.ts` (modify — Pitfall 8)

**Analog:** itself — `resolveChannel` (lines 130-155) already fetches by ID first (`client.channels.fetch(bucketChannelId)`) then falls back to exact `c.name ===` match. Improvement needed: resolve via env-configured IDs for the three new channels **before** name matching (name still fallback), because `#⚙️-jobs-sys-cloud-devops` emoji equality is brittle. Do not change the poll-loop filter (`status = 'audited' && bucket_channel != ''`, line 77) or `processOpportunity`'s `status: 'routed'` transition (line 41).

### `packages/discord-router/src/embed.ts` (modify — per-pipeline cards)

**Analog:** itself — `buildAuditCard` (lines 5-21) with `addFields(...)`. Keep one builder with a per-pipeline field branch (fields for jobs: stack tags, eligibility, apply link; loot: card required, shipping, claim steps) or add sibling builders — either way reuse the `.addFields`/`.setColor`/`.setTimestamp()` shape and the `—` empty-value convention. The card must render the union of merged links (D-10).

---

## Shared Patterns

### Listing-first adapter contract (applies to ALL new adapters)
**Source:** `packages/discord-router/src/portals/ctftime.ts` lines 1-49 + `packages/scheduler/src/jobs.ts` lines 168-185
**Apply to:** every `portals/jobs/*` and `portals/loot/*` file
```typescript
export interface PollCandidate { url: string; title: string; snippet: string; }
export async function list(opts?: { since?: Date }): Promise<PollCandidate[]>
```
Rule: emit title + ≤200-char snippet only; non-ok responses return `[]`, never throw; detail fetch happens only in the tick for pre-filters survivors.

### Dedup precheck ordering (never bypass)
**Source:** `packages/dedup/src/precheck.ts` lines 36-48 + `packages/scheduler/src/jobs.ts` lines 322-336
**Apply to:** jobs tick, loot tick, merger stage — precheck runs FIRST; `hot-hit`/`tombstoned` skip; merger runs only on `'fresh'` (Pitfall 9: cross-portal dupes look `'fresh'` to the hash layer — the merger is what catches them).

### Tombstone-on-reject (logged-not-alerted)
**Source:** `packages/db-hot/src/scratchpad.ts` lines 83-108 (hot mirror) + `packages/db-cold/src/client.ts` lines 27-32 (cold `INSERT OR IGNORE`)
**Apply to:** D-06 `unpaid_non_fellowship`, D-07 scam classes, D-04 senior screen, loot US/EU-only rejects, merge tombstones (`terminal_status: 'merged'`)
```typescript
await tombstones(pb).create({ url_hash: urlHash, fingerprint: urlHash, terminal_status: 'scam_pay_to_join', source: 'auditor', decided_at: new Date().toISOString() });
```

### Single scheduler registry (no setInterval anywhere)
**Source:** `packages/scheduler/src/registry.ts` lines 1-9 (module owns EVERY cron.schedule) + lines 125-158
**Apply to:** jobs poll, loot watchlist, audit drain. Every entry needs `timezone: SCHEDULER_TIMEZONE` + `noOverlap: true` + `maxRandomDelayMs`.

### Fail-fast env + redacting logger + structured child logs
**Source:** `packages/config/src/env.ts` lines 23-27; `apps/scheduler/src/index.ts` lines 10-16; `packages/llm/src/router.ts` line 28
**Apply to:** orchestrator entry/integration, all adapters
```typescript
const log = createLogger('info').child({ component: 'orchestrator' });
cLog.warn({ stage, error: String(err) }, 'audit failed');   // key names only, never values
```

### Zod at every boundary, loud on mismatch
**Source:** `packages/scout/src/index.ts` lines 5-20; `packages/db-hot/src/schema.ts` lines 7-10 policy comment
**Apply to:** ATS/aggregator JSON shapes, LLM verdict JSON, gate inputs, boards state file.

### SSRF `validateUrl` before every outbound fetch
**Source:** `packages/sanitize/src/fetch.ts` lines 34-52; `link-hop.ts` lines 53-58
**Apply to:** loot FAQ reads, Workday `cxs` POST targets, ATS resolution hops.

---

## No Analog Found

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| `packages/orchestrator/src/rule-packs/{events,jobs,loot}.ts` (prompt text) | utility | transform | No LLM prompt-builder exists in the repo (router only transports messages); use RESEARCH.md Code Examples for the prompt contract; verdict-schema half has the `domain-filter.ts` analog |
| `portals/jobs/workday.ts` (cxs POST shape) | controller | request-response | Undocumented endpoint, [ASSUMED: A1]; only the fetch/fallback *structure* has analogs (`clist.ts` JSON + `unstop.ts` browser + `sanitize/fetch.ts` fallback) |
| `portals/jobs/boards.ts` (auto-learn state semantics) | utility | file-I/O | Only `writeHeartbeat` (`scheduler/jobs.ts`) does file state; rotation/prune semantics are new — file-on-block-volume per RESEARCH Open Question 2 |
| `portals/loot/vendors.ts` (watchlist contents) | controller | CRUD | Vendor program URLs/parse modes are researched-but-drifting config (A5); adapter structure mirrors `ctftime.ts`/`unstop.ts` |
| Loot divert decision placement (`passesPrizeGate === false` branch → bucket) | service | request-response | The negative branch of the prize gate has never been wired to a route; LOT-01 defines it — structure from `prize-gate.ts` + `bucket_channel` write idiom only |

---

## Metadata

**Analog search scope:** `apps/*/src`, `packages/*/src`, package manifests, tsconfigs, vitest configs, root `.env.example`
**Files scanned:** 45 analog files read/verified (74 tracked `.ts` files under `packages/*/src` total)
**Pattern extraction date:** 2026-10-16
**Git-tracked gate:** Every analog path above verified via `git ls-files` (non-empty = tracked); no `.gsd/capabilities` mirror paths cited. All cited paths are tracked source.
**Known codebase notes for the planner:**
- `packages/llm` ↔ `packages/scheduler` dependency direction (`packages/llm/package.json:22`) forbids orchestrator-inside-scheduler — use the `GatewayScheduler` tickHandler pattern.
- Root `tsconfig.json` references currently omit `./packages/llm` and `./packages/discord-router` (existing drift); `@zod/discord-router` package `exports` only maps `./portals/*` → `dist/portals/*.js`, which does **not** cover nested `portals/jobs/*` — add explicit export entries.
- The only `.complete()` calls today are inside `packages/llm/src/router.ts`; `runStubTick` warns `'poll deps not provided; skipping candidate processing'` (jobs.ts:319-321) — the missing middle is real and is this phase's wiring target.
