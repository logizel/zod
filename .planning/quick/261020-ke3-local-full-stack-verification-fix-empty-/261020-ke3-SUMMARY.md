---
phase: 261020-ke3-local-full-stack-verification
plan: 01
subsystem: infra
tags: [pocketbase, env-gate, zod, vitest, bootstrap, seed, dashboard]

requires: []
provides:
  - Shared env gate accepts a present-but-empty ACCESS_OWNER_EMAIL while still rejecting malformed addresses
  - Dedup merger ±3-day window tests anchored to wall-clock time (no calendar rot)
  - Idempotent PocketBase schema + dev-seed bootstrap derived from the schema contract, with a typecheck gate
affects: [local-full-stack-verification, dashboard-server, scheduler, db-hot]

actuals:
  tokens: 6723
  tasks: 3
  commits: 9

tech-stack:
  added: []
  patterns:
    - "INDEX_NOTES -> PocketBase DDL via a single mapping keyed by the note string (no duplicated prose index list)"
    - "Non-destructive collection apply: merge managed fields by name over existing field objects, preserve unmanaged/system fields, replace only owned indexes"
    - "Seed upsert by stable key via getFullList({ filter }) (never throwing getFirstListItem)"

key-files:
  created:
    - packages/db-hot/scripts/bootstrap-pb.ts
    - packages/db-hot/tsconfig.scripts.json
  modified:
    - packages/config/src/env.ts
    - packages/config/src/env.test.ts
    - packages/dedup/src/merger.test.ts
    - packages/db-hot/src/globals.d.ts
    - packages/db-hot/package.json
    - apps/dashboard-server/src/gc.test.ts
    - apps/dashboard-server/src/index.ts
    - apps/dashboard/index.html
    - infra/oracle/drills/browser-soak.sh
    - infra/oracle/drills/edge-reject.sh

key-decisions:
  - "ACCESS_OWNER_EMAIL uses z.email().or(z.literal('')).default(''): empty stays fail-closed at authorizeStream (falsy header rejected before comparison)"
  - "Merger tests use NOW = Date.now() with relative offsets; production merger untouched"
  - "Bootstrap imports HOT_COLLECTIONS/INDEX_NOTES/createPbClient from src instead of duplicating the contract or auth path"
  - "Seed TBA row uses pipeline 'local' so the events tabs do not double-count it"

requirements-completed: []

duration: 12min
completed: 2026-10-20
status: complete
---

# Quick Task 261020-ke3 Summary

**Local-stack blockers repaired: empty `ACCESS_OWNER_EMAIL` now parses (still fail-closed), merger window tests no longer rot with the calendar, and a typechecked idempotent PocketBase bootstrap applies all five hot collections with 7 board-representative opportunity seeds and 3 telemetry slots**

## Performance

- **Duration:** ~12 min
- **Started:** 2026-10-20T09:17Z (first task commit)
- **Completed:** 2026-10-20T09:29Z
- **Tasks:** 3/3
- **Files modified:** 8 (6 modified, 2 created)

## Accomplishments

- `parseEnv` accepts `ACCESS_OWNER_EMAIL=` (the repo's own `.env.example` convention) while a malformed non-empty value still throws; four regression cases cover explicit-empty, absent-default, valid-address preservation, and malformed rejection.
- `packages/dedup/src/merger.test.ts` anchors `NOW` to `Date.now()`; the ±3-day boundary and recent-created fallback assertions now hold on any run date, with zero production-code change.
- New `packages/db-hot/scripts/bootstrap-pb.ts` creates/updates the five hot collections from `src/schema.ts`, derives every index from `INDEX_NOTES`, and optionally upserts seed rows for all seven dashboard board tabs plus three telemetry slots — non-destructively and idempotently.
- New `typecheck:scripts` gate (`tsc -p tsconfig.scripts.json`, `noEmit`) proves the script compiles against the shared env/schema/client contract with no `@types/node` in the program.

## Task Commits

1. **Task 1: Accept empty ACCESS_OWNER_EMAIL without weakening email validation** - `660a5d7` (fix)
2. **Task 2: Make dedup merger relative-window tests calendar-stable** - `0b6c4d2` (test)
3. **Task 3: Add typechecked idempotent PocketBase schema + dev seed bootstrap** - `4fa5aab` (feat)
4. **Verification fix: gc env fixture** - `04ba26e` (fix, deviation — see below)
5. **Live-run fix: PB 0.40 autodate fields** - `b23b46b` (fix — see live verification)
6. **Live-run fix: board filter routing + tab labels** - `f42af3e` (fix — see live verification)
7. **Live-run fix: soak log path + Phase 7 edge-reject lint** - `c869134` (fix — see live verification)
8. **Live-run fix: visible board section follows selected tab** - `23399a3` (fix — see live verification)
9. **Live-run fix: soak excludes the MCP harness browser** - `51ff9e3` (fix — see live verification)

## Files Created/Modified

- `packages/config/src/env.ts` — `ACCESS_OWNER_EMAIL: z.email().or(z.literal('')).default('')` plus fail-closed rationale comment.
- `packages/config/src/env.test.ts` — 4 new cases (explicit empty, absent default, valid address, malformed rejection).
- `packages/dedup/src/merger.test.ts` — `NOW` is `Date.now()`; all offsets remain relative.
- `packages/db-hot/scripts/bootstrap-pb.ts` — idempotent schema + `--seed` bootstrap (616 lines).
- `packages/db-hot/tsconfig.scripts.json` — typecheck-only project (`composite: false`, `noEmit`, no Node types).
- `packages/db-hot/src/globals.d.ts` — additively declares `process.argv`, `console`, and the `EventSource` global slot.
- `packages/db-hot/package.json` — adds `"typecheck:scripts": "tsc -p tsconfig.scripts.json"`.
- `apps/dashboard-server/src/gc.test.ts` — adds `ACCESS_OWNER_EMAIL: ''` to the env fixture (deviation fix).

## Bootstrap Contract (orchestrator live run)

**Exact command (repo root):**

```bash
pnpm exec tsx packages/db-hot/scripts/bootstrap-pb.ts --seed
```

Run without `--seed` for schema/index apply only. The script uses `parseEnv()` and `createPbClient(env)` (shared `_superusers` auth + owner-only token file); it never logs the service email, password, token, or auth payload.

**Collections applied (all `type: 'base'`, superuser-only default rules):**

| Collection | Required fields | Optional / defaulted fields |
|---|---|---|
| `opportunities` | fingerprint_hash, url_hash, pipeline (select), bucket_channel, status (select), title, organizer, links (json), deadlines (json) | prize_cash_inr, prize_text, end_date, reminders, bookmark, audit_summary, description_raw, experience_span, stack_tags, eligibility_summary, shipping_verified, card_required, claim_steps, registration_links, possible_dupe_of, discord_message_id |
| `agent_telemetry` | slot, provider, model, step, status (select) | url, duration_ms, detail |
| `task_scratchpad` | candidate_url (url), step_position | pipeline (select), candidate_title, partial_buffer, attempts (int), last_error |
| `tombstone_ledger` | url_hash, fingerprint, terminal_status, decided_at (date) | source |
| `taste_rules` | kind, rule | weight, source, created_at (date) |

**Indexes applied (explicit names, derived from `INDEX_NOTES`):**

- `opportunities`: `idx_opportunities_fingerprint_hash` (unique), `idx_opportunities_url_hash`, `idx_opportunities_status`, `idx_opportunities_end_date`, `idx_opportunities_pipeline_status` (`pipeline`, `status`)
- `agent_telemetry`: `idx_agent_telemetry_created` (`created`), `idx_agent_telemetry_slot_created` (`slot`, `created`)
- `task_scratchpad`: `idx_task_scratchpad_candidate_url` (unique), `idx_task_scratchpad_step_position`
- `tombstone_ledger`: `idx_tombstone_ledger_url_hash` (unique), `idx_tombstone_ledger_fingerprint`
- `taste_rules`: `idx_taste_rules_kind`

**Seed row keys (`--seed`; upserted by `url_hash`, telemetry by `slot`):**

| Board tab | `url_hash` | `fingerprint_hash` | pipeline / channel / status |
|---|---|---|---|
| events-local | `seed-url-01` | `seed-opportunity-01` | events / `#local-dk-udupi` / audited |
| events-travel | `seed-url-02` | `seed-opportunity-02` | events / `#travel-bengaluru` / routed |
| events-online | `seed-url-03` | `seed-opportunity-03` | events / `#-online-1lakh-plus` / audited (₹1,50,000) |
| tba-queue | `seed-url-04` | `seed-opportunity-04` | local / `#-tba-queue` / candidate (`deadlines.tba = true`) |
| jobs-sys | `seed-url-05` | `seed-opportunity-05` | jobs / `#🔥-priority-sys-cp-sec` / audited |
| jobs-general | `seed-url-06` | `seed-opportunity-06` | jobs / `#-jobs-general` / routed |
| loot | `seed-url-07` | `seed-opportunity-07` | loot / `#loot-perks` / audited (shipping verified, no card) |

Telemetry slots: `seed-scout-events-1` (active), `seed-auditor-jobs-1` (done), `seed-gc-1` (cooldown).

A local smoke check (not committed) confirmed all 7 opportunities and 3 telemetry payloads parse through `Opportunity.parse` / `AgentTelemetry.parse`, and that feeding the 7 rows through `handleBoards` yields exactly 1 row in each of the seven target tabs (audit-log additionally shows the 4 audited rows).

## Verification Results

Run from the repo root, in order:

| # | Command | Exit | Result |
|---|---------|------|--------|
| 1 | `pnpm build` | 2 | **FAIL — pre-existing, out of scope** (see deviation 2) |
| 2 | `pnpm --filter @zod/dashboard-server build` | 0 | PASS (after deviation-1 fixture fix) |
| 3 | `pnpm test` | 0 | PASS — 72 files / 709 tests |
| 4 | `pnpm --filter @zod/dashboard-server test` | 0 | PASS — 4 files / 42 tests |
| 5 | `pnpm --filter @zod/db-hot typecheck:scripts` | 0 | PASS |

Task-level checks also passed: `pnpm --filter @zod/config exec vitest run src/env.test.ts` (12/12) and `pnpm --filter @zod/dedup exec vitest run src/merger.test.ts` (37/37).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Added `ACCESS_OWNER_EMAIL` to the dashboard GC env fixture**
- **Found during:** Verification command 2 (`pnpm --filter @zod/dashboard-server build`)
- **Issue:** `apps/dashboard-server/src/gc.test.ts`'s `requiredEnv` fixture predates the gap-closure commit `8e37289`, which made `ACCESS_OWNER_EMAIL` a required key. `tsc -b` failed with TS2741 (`ACCESS_OWNER_EMAIL` missing) — directly caused by the same env key Task 1 owns.
- **Fix:** Added `ACCESS_OWNER_EMAIL: ''` to the fixture.
- **Files modified:** `apps/dashboard-server/src/gc.test.ts`
- **Verification:** `pnpm --filter @zod/dashboard-server build` → exit 0; dashboard tests 42/42.
- **Committed in:** `04ba26e` (separate from the task commits to keep Task 3 atomic)

**2. [Rule 4 - Architectural, NOT fixed] `pnpm build` is red at HEAD on pre-existing errors**
- **Found during:** Verification command 1
- **Issue:** `tsc -b` reports 45 errors that predate this task and touch no file changed here:
  - 8 × TS5055 in `packages/discord-router` — `dist/portals/*.d.ts` are pulled into the program as inputs because `tsconfig.base.json` maps `@zod/scheduler/jobs` to scheduler source, which imports back into `@zod/discord-router/portals/*` (a scheduler ↔ discord-router package cycle). Fixing this requires moving the shared `PollCandidate`/`CandidateSource` type ownership or reworking the build graph.
  - 37 × TS2xxx in `packages/orchestrator` (3 in `taste-apply.ts`/`tba-loop.ts`, 34 in test fixtures) — test mocks/fixtures drifted from `LlmRouter`, `TasteRule.created_at`, and text-fixture shapes since phase 06.
- **Evidence:** the same 45 errors reproduce with only Task 1/2/3 changes present; none reference `packages/config`, `packages/dedup`, or `packages/db-hot`.
- **Decision:** not fixed — architectural/out-of-scope per the plan's executor scope guard and the deviation-rule scope boundary. An experiment adding a `@zod/discord-router/portals/*` path mapping was reverted (it traded TS5055 for TS6059/TS6307 and emitted stray files into `packages/scheduler/src`, which were removed).
- **Impact:** commands 2–5 are green; the orchestrator must repair the build graph (or accept a red `pnpm build`) before relying on freshly emitted `apps/scheduler/dist`. Existing dist artifacts are present but stale.

### Live-run follow-up fixes (after executor)

**3. [Rule 3 - Blocking] PocketBase 0.40 base collections need explicit `created`/`updated` autodate fields**
- **Found during:** first live bootstrap; `agent_telemetry` creation failed with `validation_invalid_index_expression` (`no such column: created`).
- **Fix:** added `autodateField('created' | 'updated')` and appended both fields to all five collection definitions.
- **Verification:** bootstrap created all five collections, applied 12 indexes, and the second run updated 5 collections + 7 seed rows idempotently.
- **Committed in:** `b23b46b`.

**4. [Rule 3 - Blocking] Board filter queries 404ed; tabs did not switch sections**
- **Found during:** browser UI filter round-trip and full-page screenshot; `/api/boards?q=Cloud` returned 404, and the highlighted tab did not change the visible board.
- **Issue:** `apps/dashboard-server/src/index.ts` routed on the raw `req.url`, so any query string missed the exact match. `renderTabs()` updated `activeTab` and fetched the correct board but never toggled `.board-section.active`. Tab labels inserted via `textContent` also displayed literal HTML entities.
- **Fix:** compare `pathname` for `/api/stream`, `/api/boards`, and `/api/audit/older`; pass the full URL to `handleBoards`; toggle the active section in `renderTabs()`; use literal `·`/`&` in labels.
- **Verification:** `q=Cloud` returns the single Cloud DevOps Intern row; restoring returns 4 audit rows; clicking Jobs · Sys/CP/Sec shows its heading and one row; clicking Audit shows its heading and 4 rows; dashboard tests 42/42 and build pass.
- **Committed in:** `f42af3e`, `23399a3`.

**5. [Rule 3 - Blocking] Local drill harness drift**
- **Found during:** `browser-soak.sh --local` (ENOENT on its temp log) and `edge-reject.sh --local` (Phase 1 “no realtime primitive” check contradicted the Phase 7 SSE shell).
- **Fix:** soak now recreates the log directory before appending and excludes the Playwright MCP harness’s `ms-playwright-mcp` browser from its process accounting; edge-reject now checks fixed `data-*` endpoints plus the dashboard server’s `authorizeStream`/401 app-layer gate, while preserving the tunnel catch-all, no-hot-DB route, and owner-only Access checks.
- **Verification:** edge-reject 6/6 PASS; browser-soak PASS (10/10 fetches, successRate 1.0, max RSS 349.2 MB, 0 browser processes, not rising).
- **Committed in:** `c869134`, `51ff9e3`.

---

**Total deviations:** 5 (1 auto-fixed blocking, 1 architectural reported-not-fixed, 3 live-run blocking fixes)
**Impact on plan:** Task deliverables are complete and verified. `pnpm build` remains red solely on pre-existing, unrelated errors.

## Issues Encountered

- `tsc -p tsconfig.scripts.json` initially surfaced `globalThis.EventSource` as untyped (the composite build gets that global from `@types/node` pulled in by vitest test files, which the scripts program excludes). Resolved by declaring the global additively in `packages/db-hot/src/globals.d.ts`.
- No auth gates; no services were started; `.env` was neither read for values nor modified.

## Live Verification (completed 2026-10-20)

The orchestrator ran the full local stack after the executor returned. All services bound to loopback only; the owner identity was supplied via the process environment (`ACCESS_OWNER_EMAIL=owner@example.com`) and the temp proxy injected `cf-access-authenticated-user-email`. `.env` was not edited or committed.

### Stack

| Step | Result |
|---|---|
| PocketBase 0.40.5 on `127.0.0.1:8090 --dir ./pb_data` | `/api/health` → 200 `{"message":"API is healthy."}` |
| First `bootstrap-pb.ts --seed` | 4 collections created, `opportunities` updated, 12 indexes applied, 7 opportunities + 3 telemetry rows seeded |
| Second `bootstrap-pb.ts --seed` | 0 collections created, all 5 updated, 12 indexes re-applied, 7 + 3 rows updated — idempotent |
| Collection counts | opportunities 7, agent_telemetry 3, task_scratchpad 0, tombstone_ledger 0, taste_rules 0 |
| Dashboard server on `127.0.0.1:3000` | `/api/boards` → 200, count 11, all 8 tabs present |
| `/api/stream` without owner header | 401 |
| `/api/stream` with owner header | `connected`, `delta`, `heartbeat` frames; `EventSource.readyState = 1` in the browser |
| Browser UI via temp proxy on `127.0.0.1:8080` | 8/8 tabs render the expected seed row; audit-log 4 rows; `q=Cloud` filter returns only “Cloud DevOps Intern”; labels render `·`/`&`; zero console errors |

**PB 0.40 schema fix:** base collections do not auto-add `created`/`updated`. The bootstrap now declares both as `autodate` fields on all five collections; this fixed the `agent_telemetry` index creation (`no such column: created`) and keeps the `*Row` contract valid. Commit `b23b46b`.

**Dashboard live-run fixes:** the board route compared the raw URL, so any filter query (`/api/boards?q=...`) returned 404. Routing now compares `pathname` while passing the full URL to `handleBoards`. The tab labels were assigned via `textContent`, so HTML entities displayed literally; labels now use `·`/`&`. Commit `f42af3e`. A follow-up screenshot check caught that the tab strip changed the fetch target but never toggled the visible `.board-section`; the section now follows `activeTab` in `renderTabs()`. Commit `23399a3`.

**Scheduler:** `node apps/scheduler/dist/index.js` still fails with `ERR_MODULE_NOT_FOUND: @zod/scheduler` because the dist predates the package rename and `pnpm build` is red (below). The documented source path boots cleanly:
`ACCESS_OWNER_EMAIL=owner@example.com pnpm exec tsx apps/scheduler/src/index.ts` →
`scheduler boot ok` → `audit-drain job registered via registerAuditDrain` → `scheduler registry started with live deps`.
A manual `runStubTick(events-stub, …)` reproduced the known gap: `warn {"job":"events-stub"} poll deps not provided; skipping candidate processing`.

### Local drills

| Drill | Result |
|---|---|
| `edge-reject.sh --local` | PASS (6/6 preconditions; updated from the Phase 1 “no realtime primitive” assumption to fixed data-* endpoints + app-layer SSE gate) |
| `gc-verify.sh --local` | PASS (5/5) |
| `kill-cloudflared.sh --local` | PASS (5/5) |
| `port-scan.sh --local` | PASS (loopback-only PB/tunnel) |
| `secrets-scan.sh --local` | PASS (233 commits; fallback patterns; gitleaks absent) |
| `tunnel-restart-recovery.sh --local` | PASS (5/5) |
| `wipe-restore.sh --local` | PASS (opportunities/telemetry/ledger restore counts + empty-source guard) |
| `browser-soak.sh --local` | PASS — 10/10 fetches, successRate 1.0, max RSS 349.2 MB, 0 browser processes after shutdown, not rising (5-minute run) |
| `rebuild.sh --dry-run` | PASS (all 8 gates reachable, zero side effects) |

### Known gaps (documented, not fixed in this quick task)

- `SseHub` never calls `setSlots()` / `setBucketStates()`, so the live slots/health grid stays at 0 even with seeded telemetry.
- `apps/scheduler/src/registry-start.ts` does not inject `pb`/`hot`/`cold` into tick options; the audit-drain path is registered twice and the PB client is passed as a Promise.
- The Discord bot entrypoint remains a skeleton and exits without a gateway connection.
- `/api/audit/older` still returns the stub DB rows.
- `pnpm build` remains red on pre-existing, unrelated errors (discord-router ↔ scheduler TS5055 cycle; 37 orchestrator fixture/type drifts). Commands 2–5 pass, and the scheduler was exercised via the documented `tsx` dev path.

## Next Phase Readiness

- Env gate now boots cleanly from the repo's own `.env.example` convention; empty owner email is fail-closed at the stream gate.
- Bootstrap is live-verified and idempotent; seven tabs have one seed row each plus four audit-log rows.
- Dashboard API, SSE auth, filter routing, and the static UI are live-verified.
- Blocker carried forward: `pnpm build` (discord-router/scheduler type cycle + orchestrator fixtures) must be repaired for a clean workspace build and a fresh `apps/scheduler/dist`.

## Self-Check

- `packages/config/src/env.ts` — FOUND
- `packages/config/src/env.test.ts` — FOUND
- `packages/dedup/src/merger.test.ts` — FOUND
- `packages/db-hot/scripts/bootstrap-pb.ts` — FOUND
- `packages/db-hot/tsconfig.scripts.json` — FOUND
- `packages/db-hot/src/globals.d.ts` — FOUND
- `packages/db-hot/package.json` — FOUND
- `apps/dashboard-server/src/gc.test.ts` — FOUND
- `apps/dashboard-server/src/index.ts` — FOUND
- `apps/dashboard/index.html` — FOUND
- `infra/oracle/drills/browser-soak.sh` — FOUND
- `infra/oracle/drills/edge-reject.sh` — FOUND
- Commits `660a5d7`, `0b6c4d2`, `4fa5aab`, `04ba26e`, `b23b46b`, `f42af3e`, `c869134`, `23399a3`, `51ff9e3` — FOUND

## Self-Check: PASSED (file/commit presence); verification command 1 carries the documented pre-existing failure
