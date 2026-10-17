---
phase: 05-jobs-loot-pipelines
plan: all-9-plans (Waves 1-5)
reviewed: 2026-10-16T00:00:00Z
depth: standard
files_reviewed: 24
files_reviewed_list:
  - packages/orchestrator/src/orchestrator.ts
  - packages/orchestrator/src/integration.ts
  - packages/orchestrator/src/index.ts
  - packages/orchestrator/src/gates/jobs.ts
  - packages/orchestrator/src/gates/loot.ts
  - packages/orchestrator/src/rule-packs/jobs.ts
  - packages/orchestrator/src/rule-packs/loot.ts
  - packages/orchestrator/src/rule-packs/events.ts
  - packages/orchestrator/src/loot-faq.ts
  - packages/discord-router/src/portals/jobs/greenhouse.ts
  - packages/discord-router/src/portals/jobs/lever.ts
  - packages/discord-router/src/portals/jobs/ashby.ts
  - packages/discord-router/src/portals/jobs/hn-whoshiring.ts
  - packages/discord-router/src/portals/jobs/cutshort.ts
  - packages/discord-router/src/portals/jobs/cuvette.ts
  - packages/discord-router/src/portals/jobs/workday.ts
  - packages/discord-router/src/portals/jobs/yc.ts
  - packages/discord-router/src/portals/jobs/wellfound.ts
  - packages/discord-router/src/portals/jobs/startup-jobs.ts
  - packages/discord-router/src/portals/jobs/boards.ts
  - packages/discord-router/src/portals/jobs/index.ts
  - packages/discord-router/src/portals/loot/vendors.ts
  - packages/dedup/src/merger.ts
  - packages/scheduler/src/jobs.ts
  - packages/scheduler/src/registry.ts
  - packages/db-hot/src/schema.ts
  - packages/config/src/env.ts
  - packages/discord-router/src/embed.ts
  - packages/discord-router/src/router-service.ts
  - apps/scheduler/src/registry-start.ts
findings:
  critical: 2
  warning: 7
  info: 3
  total: 12
status: issues_found
---

# Phase 5: Code Review Report

**Reviewed:** 2026-10-16T00:00:00Z
**Depth:** standard
**Files Reviewed:** 24
**Status:** issues_found

## Summary

Phase 5 delivers the jobs vertical, loot vertical, cross-pipeline dedup merger, audit orchestrator, and live scheduler wiring across 9 plans. The codebase follows established Phase 4 patterns well: listing-first adapters, zod validation at boundaries, single scheduler registry (node-cron with `noOverlap` + `maxRandomDelay`), per-row error isolation, fail-fast env gate, and SSRF guards via `validateUrl`. The architecture is cycle-free (`@zod/orchestrator` is never imported inside `packages/scheduler`).

However, the review surface uncovered **2 Critical (BLOCKER)** defects that will cause runtime failures or security issues, plus **7 Warnings** and **3 Info** items. The most serious are a SQL-injection pattern in the idempotency precheck filter and a `require()` call in an ESM module that will crash at runtime.

---

## Critical Issues (BLOCKER)

### CR-01: SQL injection via string interpolation in `createOpportunityIfAbsent` filter

**File:** `packages/orchestrator/src/orchestrator.ts:363`
**Issue:** The idempotency precheck builds a PocketBase filter by interpolating `urlHash` into a template literal:

```typescript
const page = await getList.call(coll, 1, 1, {
  filter: `url_hash = '${urlHash.replace(/'/g, "''")}'`,
});
```

`urlHash` is derived from `hashUrl(normalizeUrl(candidateUrl))`, where `candidateUrl` comes from untrusted scraper/ATS data. While a naive single-quote escape is applied, PocketBase's filter language supports more than simple string equality (logical operators, property access). Hand-rolled escaping is fragile and is a classic injection vector. A malicious URL could craft a filter that reads or deletes arbitrary rows.
**Fix:** Use parameterized filtering if PocketBase supports it, or strictly validate that `urlHash` matches a known safe hash format (hex only) before interpolating:

```typescript
// Validate urlHash is hex-only before using in filter
if (!/^[0-9a-f]+$/.test(urlHash)) {
  // proceed to create without precheck (best-effort) or skip
} else {
  const page = await getList.call(coll, 1, 1, {
    filter: `url_hash = '${urlHash}'`,
  });
}
```

### CR-02: `require()` call in ESM module causes runtime crash

**File:** `packages/discord-router/src/portals/jobs/boards.ts:46-47`
**Issue:** `boards.ts` uses ES module `import` syntax (making it ESM), but falls back to Node's `require()` when `process.env.HOME` is unset:

```typescript
export const DEFAULT_STATE_PATH = join(
  typeof process !== 'undefined' && process.env.HOME
    ? process.env.HOME
    : require('node:os').homedir(),   // <-- ReferenceError: require is not defined in ESM
  '.zod',
  'boards-learned.json',
);
```

In an ESM module (`"type": "module"` in package.json), `require` is not defined. When `HOME` is unset (common in container/systemd environments), module evaluation throws `ReferenceError: require is not defined`, crashing the scheduler before any job runs. This affects the HN whoshiring watermark and auto-learn board state — core D-02 functionality.
**Fix:** Use `import { homedir } from 'node:os'` at the top of the file:

```typescript
import { homedir } from 'node:os';
// ...
export const DEFAULT_STATE_PATH = join(
  process.env.HOME ?? homedir(),
  '.zod',
  'boards-learned.json',
);
```

---

## Warnings

### WR-01: Dedup merger store reads nonexistent `opportunities` fields

**File:** `packages/dedup/src/merger.ts:197-200`
**Issue:** The `createMergeStore` fallback queries the `opportunities` collection and maps rows to `MergeCandidate`:

```typescript
url: row.candidate_url ?? row.url,    // neither field exists on Opportunity
dateMs: row.dateMs,                   // no dateMs field on Opportunity
```

The `Opportunity` schema (`packages/db-hot/src/schema.ts`) has `url_hash`, not `url` or `candidate_url`, and has no `dateMs` field. Both evaluate to `undefined` for every stored row. This means:
- Merge candidates carry `url: undefined` (links unions include `undefined`)
- `dateMs` is always `undefined`, so `inWindow()` falls back to `Date.now() - createdAtMs <= WINDOW_MS` — only masters created within the last 3 days can ever match. Older legitimate duplicates are never merged.
**Fix:** Read from fields that exist on the `Opportunity` schema (`url_hash`, `created_at`), and add `dateMs`-equivalent metadata to the schema if merger date-window matching is required:

```typescript
url: row.url_hash ?? '',                       // use url_hash as the URL key
dateMs: row.created_at ? new Date(row.created_at).getTime() : undefined,
```

### WR-02: discord.js v14 API mismatch in `resolveChannel` name-based fallback

**File:** `packages/discord-router/src/router-service.ts:175`
**Issue:** The name-based channel resolution fallback uses discord.js v13-era API:

```typescript
const guilds = client.guilds?.caches?.values?.() ?? [];
```

discord.js v14 `GuildManager` exposes `.cache` (a `Collection`), not `.caches`. `client.guilds.caches` is `undefined`, so the optional-chaining short-circuits and the name-based fallback never executes. Env-ID resolution still works, but if the env channel ID is unset or invalid, the system cannot fall back to exact-name matching for `#⚙️-jobs-sys-cloud-devops`, `#💼-jobs-general-swe`, `#🎁-free-swag-and-credits`.
**Fix:** Use v14 API:

```typescript
const guilds = client.guilds?.cache?.values() ?? [];
```

### WR-03: HN "Who is hiring" watermark off-by-one causes duplicate processing

**File:** `packages/discord-router/src/portals/jobs/hn-whoshiring.ts:88`
**Issue:** The watermark filter uses `>=`:

```typescript
const filtered = children.filter((c) => c.created_at_i >= floor);
```

If a comment's `created_at_i` exactly equals the persisted watermark, it is re-included on the next poll. HN comments are immutable, so this causes duplicate candidates for the boundary comment every poll cycle, generating redundant scratchpad rows and audit attempts.
**Fix:** Use strict `>` so the boundary comment is excluded:

```typescript
const filtered = children.filter((c) => c.created_at_i > floor);
```

### WR-04: `createMergeStore` called with `pb as any` and no `cold` store

**File:** `packages/orchestrator/src/orchestrator.ts:204`
**Issue:** The drain backstop creates the merge store with only `pb`:

```typescript
const store = createMergeStore({ pb: pb as any });
```

`pb` is a required `DrainOpts` field, so the surrounding `if (pb !== undefined)` guard is dead code. The `pb as any` cast bypasses type safety. More importantly, `cold` is not passed, so the `tombstoneMerged` fallback (`cold?.create`) is a no-op — merged duplicate tombstones are not written to the cold Turso ledger, breaking the tombstone durability guarantee.
**Fix:** Pass both `pb` and `cold`, remove the dead-code guard and the `as any` cast:

```typescript
const store = createMergeStore({ pb, cold });
```

### WR-05: Jobs merge requires `location`, making merger nearly useless for jobs

**File:** `packages/dedup/src/merger.ts:141-144`
**Issue:** For the `jobs` pipeline, the merge gate requires both input and candidate to have a non-empty `location`:

```typescript
if (input.pipeline === 'jobs') {
  if (!input.location || !cand.location) continue;
  if (!evidenceMatches(input.location, cand.location)) continue;
}
```

Job listings from ATS JSON APIs rarely include structured location in the listing payload (it is usually on the detail page). Since `location` is `undefined` for nearly all job candidates, the jobs merger never matches — defeating D-09/D-10 for the jobs vertical.
**Fix:** Make location matching advisory rather than mandatory for jobs — skip the location gate when either side lacks location, or only enforce it when both sides provide it:

```typescript
if (input.pipeline === 'jobs' && input.location && cand.location) {
  if (!evidenceMatches(input.location, cand.location)) continue;
}
```

### WR-06: Fellowship gate admits unpaid non-fellowship roles when `fellowship_program` is null

**File:** `packages/orchestrator/src/gates/jobs.ts:215-219`
**Issue:** D-06 requires unpaid roles to reject unless they match the fellowship allowlist. The gate checks:

```typescript
if (verdict.fellowship_program !== null && verdict.fellowship_program !== undefined) {
  if (!isFellowshipProgram(verdict.fellowship_program)) {
    return { admitted: false, reasonCode: 'unpaid_non_fellowship' };
  }
}
```

This only rejects when `fellowship_program` is set but not allowlisted. If the LLM sets `fellowship_program: null` for an unpaid non-fellowship role (which it will for most unpaid roles), the gate passes and the role is admitted. The gate has no visibility into whether the role is actually unpaid — it only sees the LLM's classification.
**Fix:** The gate needs an `isUnpaid` signal in `JobsVerdictInput`. Add it and reject when unpaid and not an allowlisted fellowship:

```typescript
export interface JobsVerdictInput {
  // ... existing fields ...
  isUnpaid?: boolean;
}

// In evaluateJobsGates:
if (verdict.isUnpaid && verdict.fellowship_program !== null) {
  if (!isFellowshipProgram(verdict.fellowship_program)) {
    return { admitted: false, reasonCode: 'unpaid_non_fellowship' };
  }
}
```

### WR-07: Turso cold client created but never used (dead code / resource waste)

**File:** `packages/scheduler/src/registry-start.ts:45,84-85`
**Issue:** `createTursoClient(env)` and `clientExecutor(turso)` are instantiated at lines 45-46, but `cold` is never passed to any consumer. Line 85 explicitly acknowledges this: `// cold is intentionally unused in this tracer slice — wired for 05-05 merger.` The dedup merger's cold-store tombstone writes and the intake merge stage (`runStubTick` line 430: `createMergeStore({ pb, cold })`) never receive the Turso client. This is wasted connection resources and means cold-ledger writes are silently dropped.
**Fix:** Wire `cold` into `registerPollJobs` and `registerAuditDrain` options so the merger cold store is populated. Or remove the Turso instantiation until 05-05 wiring lands.

---

## Info

### IN-01: Missing newline in jobs rule pack prompt

**File:** `packages/orchestrator/src/rule-packs/jobs.ts:95-96`
**Issue:** String concatenation omits a newline between the `scam_signals` and `geo_verdict` field descriptions:

```
`- scam_signals: string[] (scam reason codes found, else [])` +
`- geo_verdict: string | null (...`
```

Produces `... else [])- geo_verdict: ...` — the LLM may misread the schema boundary. Not a security issue but degrades verdict parse reliability.
**Fix:** Add `\n` at the end of line 95.

### IN-02: Duplicate `stripHtml` function across adapters

**Files:** `packages/discord-router/src/portals/jobs/greenhouse.ts:61`, `lever.ts:26`, `ashby.ts:22`, `hn-whoshiring.ts:25`
**Issue:** The same ~12-line HTML-stripping helper is duplicated verbatim in four adapters. Any bug in the entity-escaping logic (e.g., missing `&apos;`, `&#x27;`, numeric entities) exists in four places and must be fixed four times.
**Fix:** Extract `stripHtml` to a shared utility (e.g., `packages/sanitize/src/strip.ts` already has `sanitizeHtml`) and import it.

### IN-03: `startRegistry` does not register Phase 5 poll/audit-drain jobs

**File:** `packages/scheduler/src/registry.ts:299`
**Issue:** `startRegistry` — documented as the "single registry start the scheduler entry calls" — only calls `registerStubJobs`. The Phase 5 `registerPollJobs` (jobs-poll, loot-watchlist) and `registerAuditDrain` are called separately in `apps/scheduler/src/registry-start.ts:66-78`. This works but is inconsistent: `startRegistry` is incomplete, and any future entrypoint using `startRegistry` directly will miss the new jobs.
**Fix:** Have `startRegistry` delegate to all registration functions, or document that entrypoints must call `registerPollJobs` and `registerAuditDrain` separately.

---

## Code Quality Assessment

**Strengths:**
- **Cycle-free architecture confirmed:** No `@zod/orchestrator` import anywhere in `packages/scheduler`. The orchestrator registers its drain via the injected `tickHandler` through `registerAuditDrain`, mirroring the `GatewayScheduler` precedent. (Requirement: pass)
- **No `setInterval` or ad-hoc cron:** Every schedule goes through `node-cron` in `packages/scheduler/src/registry.ts` with `timezone: 'Asia/Kolkata'`, `noOverlap: true`, and `maxRandomDelay` jitter. The only `setInterval` reference is a `globals.d.ts` type declaration, not runtime usage. (Requirement: pass)
- **SSRF guards on outbound fetch targets:** All adapters call `validateUrl` from `@zod/sanitize/fetch` before fetching (Greenhouse, Lever, Ashby, HN, Workday, Cutshort, Cuvette, Wellfound, startup.jobs, vendors watchlist, loot FAQ reader). The `validateUrl` function rejects private/loopback hosts, non-default ports, and non-http(s) protocols. (Requirement: pass)
- **Pure predicate libraries:** `packages/orchestrator/src/gates/jobs.ts` and `gates/loot.ts` contain zero I/O — pure functions over verdict inputs. The loot FAQ reader (`loot-faq.ts`) performs I/O but is not part of the gate. (Requirement: pass)
- **Per-row error isolation:** `drainStep2Rows` wraps each row in `try/catch`; a single bad row never aborts the batch. Throwing router calls leave the row at STEP_2 with no partial write.
- **Bounded reads:** `getList` uses page size 25 (T-05-04) and `step_position = 'STEP_2'` filter (T-05-06, pipeline from code-owned scratchpad row, not candidate data).
- **Zod at every boundary:** Verdict schemas parsed with `zod.Schema.parse()`; parse failure → tombstone, never admit.
- **Fail-fast env gate:** `packages/config/src/env.ts` parses all required secrets at boot; missing keys throw before any schedule is created.

**Areas of concern:**
- The orchestrator's merge backstop passes `dateMs: undefined, location: undefined` to `attemptMerge`, relying on `createdAtMs` fallback for the ±3-day window — only recent masters match.
- `pb as any` casts appear in both `orchestrator.ts:204` and `scheduler/jobs.ts` merge stage, bypassing type safety at the PbLike boundary.
- The `createOpportunityIfAbsent` idempotency check uses a hand-escaped filter string (CR-01).
- Duplicate `stripHtml` and `INDEX_NOTES` coordination with the infra plan is flagged as pending (schema.ts lines 237-241).

---

## Threat Model Coverage (T-05-*)

The code comments reference the following threat mitigations, all present in the reviewed files:

| Threat | Mitigation Location | Status |
|--------|--------------------|--------|
| T-05-01: LLM prompt injection via untrusted candidate text | Rule packs frame step_2 as untrusted data (`packages/orchestrator/src/rule-packs/{jobs,loot,events}.ts`) | Present |
| T-05-02: Greenhouse raw `content` leakage | `greenhouse.ts` strips HTML, never carries `content` into candidate | Present |
| T-05-04: Bounded getList (page size 25) | `orchestrator.ts:98` `getList(1, pageSize, ...)` | Present |
| T-05-05: url_hash pre-check before opportunities create | `orchestrator.ts:359-372` `createOpportunityIfAbsent` | Present (but injection-vulnerable — CR-01) |
| T-05-06: Pipeline from code-owned scratchpad row | `orchestrator.ts:124` switch on `row.pipeline` | Present |
| T-05-07: Structural PbLike port | `orchestrator.ts:57` `PbLike` interface | Present |
| T-05-SC: No new installs (vendors) | `vendors.ts` comment; uses existing deps only | Present |

**Note:** CR-01 (SQL injection in the T-05-05 precheck filter) directly undermines the T-05-05 mitigation. The precheck exists but is implemented with an injection-vulnerable filter string.

---

## Recommendations

1. **Fix CR-01 and CR-02 immediately** — both are shipping-blockers: CR-01 is an injection vulnerability, CR-02 is a runtime crash in ESM.
2. **Fix WR-01** — the merger reads nonexistent fields, silently degrading dedup for all pipelines.
3. **Wire the Turso cold client** (WR-07) so cold-ledger tombstone writes and merge cold-store queries actually function.
4. **Add `isUnpaid` to the jobs gate** (WR-06) to close the D-06 fellowship loophole.
5. **Extract shared `stripHtml`** (IN-02) and fix the prompt newline (IN-01) as low-effort quality improvements.
6. **Coordinate `INDEX_NOTES` with the infra plan** — `schema.ts:237-241` notes that PB collection updates and index application must land with the phase's infra step; verify this is tracked outside this review.
7. **Verify discord.js v14 `guilds.cache` usage** across `router-service.ts` (WR-02) — the `caches` typo breaks name-based channel fallback.

---

_Reviewed: 2026-10-16T00:00:00Z_
_Reviewer: gsd-code-reviewer_
_Depth: standard_
