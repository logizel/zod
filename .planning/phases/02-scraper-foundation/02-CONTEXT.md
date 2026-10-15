# Phase 2: Scraper Foundation - Context

**Gathered:** 2026-10-15
**Status:** Ready for planning

## Phase Boundary

Any candidate URL becomes cheap, clean markdown with spam filtered and work-state tracked before any LLM is spent. Covers ING-06 (sanitizer ≥85% cut), SWM-01 (Scout pre-filter), SWM-03 (Task_Scratchpad STEP_1..STEP_4 + resume). Does NOT build LLM gateway (Phase 3), Link-Hopper 2-hop resolution, auditor/curator verdicts, or Discord routing — only the fetch-and-filter contract those layers depend on.

## Implementation Decisions

### Fetch + sanitizer pipeline
- **D-01:** Jina-first strict — every URL goes to Jina Reader first; headless browser is fallback only, never default — **Reversibility:** costly — swapping default fetch path touches every pipeline caller
- **D-02:** Browser fallback triggers on fail signals only — Jina empty/short output, HTTP error, or explicit throttle; no JS-sniffing heuristic in v1
- **D-03:** Capped markdown at 8k chars — balanced for free-tier LLMs, avoids 413s by construction
- **D-04:** Keep links in sanitized markdown — official/aggregator links must survive for 2-hop audit; strip scripts/styles/SVG/nav/footer aggressively, abort images/fonts/video
- **D-05:** Prove ≥85% cut by byte comparison — raw HTML bytes vs capped markdown bytes on representative sources (not token estimate)
- **D-06:** Keyed Jina (JINA_API_KEY in env, never in repo) — higher rate limits vs keyless
- **D-07:** 30s per-fetch cap before fallback — fast fail to avoid head-of-line block

### Browser queue behavior
- **D-08:** Max 2 concurrent tabs — lower RAM, safer on ARM with 2.5GB reclaim buffer (criterion allows ≤3, we hold 2) — **Reversibility:** costly — concurrency change alters RAM + throughput profile under scheduler load
- **D-09:** Strict FIFO, no priority lanes in v1 — simplest fair ordering; revisit lanes only on evidence of head-of-line block
- **D-10:** Fresh browser context per job — isolates cookies/sessions (X/LI posture), prevents leak
- **D-11:** Backpressure on overflow — scheduler waits, never drops URLs
- **D-12:** Block media at route level (`**/*.{png,jpg,jpeg,woff2,mp4}` abort) + media-off launch args
- **D-13:** 30s per-navigation timeout — fast fail, frees tab quickly
- **D-14:** `playwright-core` + `--only-shell` chromium (small ARM footprint), never full `playwright` on VM
- **D-15:** Strict close discipline — close context after every fetch; leak = OOM on ARM

### Scout pre-filter rules
- **D-16:** Strict expiry — reject past-date items from title/snippet date parse, no grace window
- **D-17:** Aggressive spam filter from title/snippet alone — beyond obvious crypto/casino/adult; false-positive bias toward precision (drop noise over saving edge cases)
- **D-18:** Date parsing via `date-fns` (+ `date-fns-tz` for IST display) — reject on unparseable-past per Scout contract
- **D-19:** Scout runs before any scrape and before LLM spend — title/snippet gate only; full fetch only for survivors

### Scratchpad lifecycle
- **D-20:** Phase 2 scope is STEP_1 (discovered) → STEP_2 (sanitized) only — full STEP_1..4 rows exist in schema but STEP_3/4 writers land in Phase 3/4 — **Reversibility:** one-way — STEP semantics are depended on by Phase 3 baton-pass + Phase 4 auditor
- **D-21:** PB-backed persistence — `task_scratchpad` row is source of truth (candidate_url unique point lookup); no memory-first caching in v1
- **D-22:** Crash resume by URL — resume STEP_1..2 position via candidate_url lookup after crash, never restart fresh
- **D-23:** 5 retries per URL (user freeform override of 3) then tombstone as failed — attempts + last_error tracked on row

### Agent's Discretion
No "you decide" selections — user chose concrete options for all 24 decisions. Researcher/planner have flexibility on: exact cheerio strip selector list, turndown vs readability fallback choice, fingerprint-vs-Scout ordering micro-detail, heartbeat/metric naming, and exact index sets — as long as success criteria and locked decisions above hold.

## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Roadmap + requirements
- `.planning/ROADMAP.md` Phase 2 section — goal, 4 success criteria, ING-06/SWM-01/SWM-03 scope
- `.planning/REQUIREMENTS.md` ING-06, SWM-01, SWM-03 rows + Traceability — exact sanitizer + Scout + scratchpad contracts
- `.planning/PROJECT.md` Context + Constraints — Jina-first + shared browser 2–3 tabs media-off, RSS-before-headless cost rule, 2.5GB buffer, poll cadences

### Stack + architecture (research)
- `.planning/research/STACK.md` — install matrix: playwright-core + --only-shell, cheerio + turndown, Jina Reader API, kelektiv/node-cron, zod v4, pino v10, vitest 3
- `.planning/research/ARCHITECTURE.md` — layered pipeline, scratchpad-as-state-token, shared-browser semaphore queue, sanitizer-before-LLM rule, build-order (browser+sanitizer = step 2)
- `.planning/research/PITFALLS.md` — raw-HTML-to-LLM burn, browser-per-scrape RAM death, orphaned Chromium processes
- `.planning/research/SUMMARY.md` Phase 2 implications — fetch contract (url → markdown) all agents depend on

### Prior phase + codebase contracts
- `.planning/phases/01-foundation/01-CONTEXT.md` D-09/D-12 — five-collection schema lock + fingerprint two-tier precheck already shipped
- `packages/db-hot/src/schema.ts` — TaskScratchpad shape (candidate_url url, step_position, partial_buffer, attempts, last_error) + INDEX_NOTES candidate_url unique
- `packages/dedup/src/fingerprint.ts` + `packages/dedup/src/precheck.ts` — existing fingerprint + hot-then-cold <5ms gate Scout builds on
- `packages/scheduler/src/jobs.ts` — STUB_JOBS cadence table + runStubTick plug point where real poll logic lands

## Existing Code Insights

### Reusable Assets
- `TaskScratchpad` schema + `candidate_url (unique)` index: resume-by-URL point lookup already contracted — Phase 2 writes STEP_1/STEP_2 rows through it
- `fingerprint` + `precheck` (hot PB then Turso point-lookup <5ms): Scout filter chains after this dedup gate, never before
- `runStubTick` + scheduler registry (`kelektiv/node-cron` noOverlap + maxRandomDelay, Asia/Kolkata): real poll logic replaces stub body without structural change
- `env.parse()` (dotenv + zod) + pino redacting child loggers: JINA_API_KEY + browser telemetry reuse same contracts

### Established Patterns
- TS strict + `zod` v4 `z.infer` at every external boundary; boundary failures stay LOUD via Schema.parse()
- Single scheduler module owns all jobs; one shared browser singleton + tab queue (never `browser.launch()` in adapters)
- `cheerio` strip + `turndown` + length-cap before every LLM call (413s rare by construction)
- `pino` JSON to stdout + per-pipeline child loggers; vitest 3 for pure functions (parsers, routing helpers, dedup)

### Integration Points
- `apps/scheduler` stub jobs → Phase 2 poll wiring (events 20m, jobs 45m, local 3h, social hourly + jitter)
- `packages/db-hot` PB client → scratchpad STEP_1/STEP_2 writes + opportunities precheck reads
- New `packages/browser` singleton + `packages/sanitize` fetcher → all Phase 3+ agents consume `fetch(url) → capped markdown` facade, never Playwright APIs directly

## Specific Ideas

- Jina-first strict with fail-trigger fallback (empty/short/error/throttle → browser), 30s per-fetch cap
- 8k capped markdown, keep links + tables, aggressive strip (scripts/styles/SVG/nav/footer), media abort
- Byte-comparison proof on representative portals for ≥85% criterion; keyed Jina via env
- Max 2 tabs FIFO, fresh context per job, backpressure overflow, 30s nav timeout, strict close, playwright-core shell
- Scout: strict expiry + aggressive spam from title/snippet, date-fns parse, favor precision
- Scratchpad: STEP_1-2 only in Phase 2, PB-backed, URL resume, 5 retries then tombstone

## Deferred Ideas

None — discussion stayed within phase scope. No scope creep raised; no todos folded (todo match count 0).

---

*Phase: 2-Scraper Foundation*
*Context gathered: 2026-10-15*
