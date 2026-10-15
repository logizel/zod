---
phase: 03-llm-swarm
reviewed: 2026-10-15T18:15:00Z
depth: standard
files_reviewed: 25
files_reviewed_list:
  - packages/llm/src/router.ts
  - packages/llm/src/bucket.ts
  - packages/llm/src/stitch.ts
  - packages/llm/src/telemetry.ts
  - packages/llm/src/ladder.ts
  - packages/llm/src/priority.ts
  - packages/llm/src/circuit-breaker.ts
  - packages/llm/src/gateway-entry.ts
  - packages/llm/src/registry-integration.ts
  - packages/llm/src/index.ts
  - packages/llm/src/adapters/groq.ts
  - packages/llm/src/adapters/github.ts
  - packages/llm/src/adapters/sambanova.ts
  - packages/llm/src/adapters/mistral.ts
  - packages/llm/src/adapters/openrouter.ts
  - packages/llm/src/adapters/zimai.ts
  - packages/llm/src/adapters/nvidia.ts
  - packages/llm/src/router.test.ts
  - packages/llm/src/bucket.test.ts
  - packages/llm/src/chaos.test.ts
  - packages/llm/src/telemetry.test.ts
  - packages/llm/package.json
  - packages/llm/tsconfig.json
  - packages/llm/vitest.config.ts
  - packages/config/src/env.ts
  - packages/logger/src/index.ts
  - packages/scheduler/src/registry.ts
  - packages/scheduler/src/jobs.ts
  - packages/scheduler/src/registry.test.ts
  - tsconfig.base.json
  - pnpm-lock.yaml
findings:
  critical: 2
  warning: 5
  info: 2
  total: 9
status: issues_found
---

# Phase 03: LLM Swarm Code Review Report

**Reviewed:** 2026-10-15T18:15:00Z
**Depth:** standard
**Files Reviewed:** 25
**Status:** issues_found

## Summary

Phase 3 delivers the LLM swarm gateway: a 2D provider×model bucket ladder (Tier 1 zero-cost + Tier 2 overflow), per-bucket cooldown/daily-cap bulkheads, a spend circuit-breaker with default-deny for paid-opt-in providers, centralized length-stitch with JSON.parse validation, per-bucket telemetry to `agent_telemetry`, and a single scheduler registry (kelektiv/node-cron) owning all timers with `noOverlap` + jitter.

Build passes (`pnpm --filter @zod/llm --filter @zod/scheduler-registry run build`) and all tests pass (59 llm tests, 21 scheduler tests).

The zero-cost constraint is honored: Cerebras is absent from all bucket tables, SambaNova is paid-opt-in and excluded unless `SAMBANOVA_API_KEY` is set, and the circuit-breaker defaults to `zeroCostBudget: 0` / `paidOptIn: false`.

**However, two BLOCKER-level bugs were found:** the Groq adapter's 413 detection has a false-positive condition that misclassifies non-413 errors as length violations, and the standalone `complete()` convenience function constructs a fresh router on every call, discarding all bucket cooldown/daily-cap/circuit-breaker state. Several warning-level quality defects were also found.

---

## Critical Issues

### CR-01: Groq adapter 413 detection false-positive condition

**File:** `packages/llm/src/adapters/groq.ts:77`

**Issue:** The 413 length-violation detection includes `(apiErr.headers?.get && apiErr.headers.get('content-length') === null)`. This classifies **any** error response lacking a `content-length` header as a `length_violation`, not just HTTP 413s. A 401 Unauthorized, 403 Forbidden, or 500 error with no content-length header is misclassified as `length_violation`, causing the router to attempt a meaningless stitch and masking the real error type. The bucket is not placed into cooldown for the actual error.

**Fix:** Remove the `content-length === null` fallback. Classify `length_violation` only on `status === 413` (consistent with all other adapters):

```typescript
// 413 length violation — shrink-or-stitch, never blind-retry.
if (apiErr.status === 413) {
  return { error: 'length_violation' };
}
```

### CR-02: Standalone `complete()` creates a new router per call, losing all bucket state

**File:** `packages/llm/src/router.ts:415-417`

**Issue:** The exported `complete()` convenience function constructs a new `LlmRouter()` on every invocation. Each new router constructs a fresh `BucketRegistry` with all buckets in `READY` state. This means cooldowns, daily-cap exhaustion, and circuit-breaker parks do **not** persist across calls — every call to `complete()` starts with a clean slate, defeating the entire bulkhead and zero-cost enforcement system. Rate-limited buckets immediately become available again on the next call.

**Fix:** Make `complete()` accept an optional router instance, or use a shared singleton router so bucket state persists across calls:

```typescript
// Option A: accept an optional router
export async function complete(
  opts: CompleteOptions,
  router?: LlmRouter,
): Promise<CompleteResult> {
  const r = router ?? new LlmRouter();
  return r.complete(opts);
}
```

Or, if a shared singleton is intended:

```typescript
const DEFAULT_ROUTER = new LlmRouter();
export async function complete(opts: CompleteOptions): Promise<CompleteResult> {
  return DEFAULT_ROUTER.complete(opts);
}
```

---

## Warnings

### WR-01: `resetAllDailyCaps` writes telemetry but never resets bucket state

**File:** `packages/llm/src/registry-integration.ts:90-103`

**Issue:** The `gateway-daily-cap-reset` cron job iterates DAILY-CAP buckets and writes telemetry (`"daily-cap reset at UTC midnight"`) but never calls `router.recoverBucket()` or `registry.recordSuccess()` to actually transition buckets from `DAILY_CAP` back to `READY`. The state only self-recovers lazily in `BucketRegistry.canFire()` at midnight. The cron job's telemetry claim is premature/misleading — the bucket remains `DAILY_CAP` until `canFire()` is next invoked.

**Fix:** Call `router.recoverBucket()` (or `registry.recordSuccess()`) for each DAILY-CAP bucket whose midnight has passed, before writing telemetry:

```typescript
private resetAllDailyCaps(writeTelemetry): void {
  for (const b of this.opts.router.getBucketStates()) {
    if (b.state === BucketState.DAILY_CAP && Date.now() >= b.dailyCapResetAt) {
      const recovered = this.opts.router.recoverBucket(b.provider, b.model);
      if (recovered) {
        void writeTelemetry({...});
      }
    }
  }
}
```

### WR-02: Tier 2 adapters created with empty API keys (always 401)

**File:** `packages/llm/src/router.ts:109-122`

**Issue:** Mistral, OpenRouter, Z.ai, and NVIDIA adapters are all constructed with `''` (empty string) as the API key. Every call to these buckets results in a 401 authentication error from the provider, which is caught by `attemptBucket`'s outer try/catch and returns `{ verdict: null }`. This wastes a network round-trip per bucket per call before falling through.

**Fix:** Skip tier-2 adapters that have no configured API key (consistent with the SambaNova handling), or gate tier-2 engagement on key availability:

```typescript
case 'mistral':
  if (!env.MISTRAL_API_KEY) { log.debug(...); continue; }
  adapter = new MistralAdapter(env.MISTRAL_API_KEY, def.model);
  break;
// similarly for openrouter, zai, nvidia
```

### WR-03: Non-429/413 adapter errors silently skip buckets without state change

**File:** `packages/llm/src/router.ts:256-259`

**Issue:** When `adapter.chat()` throws (e.g., 401 auth error, network failure, 500), `attemptBucket` catches it, logs an error, and returns `{ verdict: null, bucket: null }`. The bucket remains `READY` with no cooldown or daily-cap mark, so it is retried on every subsequent `complete()` call. Persistently-failing providers (e.g., expired keys) waste a network call on every audit.

**Fix:** Mark the bucket as unavailable (cooldown or daily-cap) on unexpected adapter errors, or at least record a telemetry `error` status so the operator can observe the failure:

```typescript
} catch (err) {
  log.error({ provider: def.provider, model: def.model, err }, 'adapter call threw');
  this.registry.markCooldown(def.provider, def.model, 60);
  await this.writeTelemetry(slot, def.provider, def.model, pipeline, url, 'error', `adapter error: ${String(err)}`);
  return { verdict: null, bucket: null };
}
```

### WR-04: `allTier1Available()` is unused dead code

**File:** `packages/llm/src/bucket.ts:146-151`

**Issue:** `BucketRegistry.allTier1Available()` is defined but never called by `LlmRouter` or any other module. The router iterates `this.ladder.tier1` directly in `complete()`. This method is dead code.

**Fix:** Either remove `allTier1Available()` or use it in `LlmRouter.complete()` as the Tier-2 engagement gate (replacing the current `verdict === null` check).

### WR-05: `BucketRegistry` midnight reset ignores instance-configured `dailyCap`

**File:** `packages/llm/src/bucket.ts:33-37,70`

**Issue:** The constructor accepts a `dailyCap` parameter (default `DEFAULT_DAILY_CAP = 1000`) and stores it per-bucket. However, `canFire()`'s midnight reset hardcodes `DEFAULT_DAILY_CAP` instead of the instance's configured value:

```typescript
b.dailyCapRemaining = DEFAULT_DAILY_CAP;  // should be this.dailyCap or stored per-bucket
```

A registry constructed with `dailyCap = 500` resets to 1000 after midnight, silently changing the configured cap.

**Fix:** Store the configured daily cap on the registry and use it in the reset:

```typescript
constructor(entries, dailyCap = DEFAULT_DAILY_CAP) {
  this.dailyCap = dailyCap;
  ...
}
// in canFire reset:
b.dailyCapRemaining = this.dailyCap;
```

---

## Info

### IN-01: Duplicate `nextUtcMidnight` function

**File:** `packages/llm/src/bucket.ts:33-37` and `packages/llm/src/circuit-breaker.ts:26-30`

**Issue:** The same `nextUtcMidnight()` helper is defined identically in two files. Minor duplication; extract to a shared util if needed elsewhere.

**Fix:** Deduplicate by exporting from one module and importing in the other, or move to a shared time utility.

### IN-02: `gateway-entry.ts` calls `main()` at module top level

**File:** `packages/llm/src/gateway-entry.ts:33`

**Issue:** `main()` is invoked unconditionally at module load (`main();` on line 33). Importing this module for testing executes the gateway boot sequence, making isolated unit testing of the entrypoint difficult.

**Fix:** Guard the invocation with `if (import.meta.main)` so it only runs when executed directly, not when imported:

```typescript
if (import.meta.main) {
  main();
}
```

---

## Verification Results

| Check | Result |
|-------|--------|
| Build (`pnpm --filter @zod/llm --filter @zod/scheduler-registry run build`) | ✅ Passes |
| Tests (`pnpm --filter @zod/llm --filter @zod/scheduler-registry run test`) | ✅ 59 + 21 tests pass |
| Zero-cost: Cerebras absent from bucket tables | ✅ Verified (assertNoCerebras + tests) |
| Zero-cost: SambaNova paid-opt-in default-deny | ✅ Verified (circuit-breaker + adapter gating) |
| Zero-cost: circuit-breaker default-deny (`zeroCostBudget: 0`) | ✅ Verified |
| 429 detection via vendor SDK error types | ✅ Verified (Groq.RateLimitError, OpenAI status 429) |
| 413 detection via vendor SDK error types | ⚠️ Groq adapter has false-positive (CR-01) |
| Length-stitch: centralized continuation prompt | ✅ Verified (single Stitcher class) |
| Length-stitch: JSON.parse validation on merged output | ✅ Verified (stitchAndParse) |
| Per-bucket telemetry READY → COOLDOWN → READY | ✅ Verified (telemetry tests) |
| Single scheduler registry, no setInterval in packages/llm | ✅ Verified |
| All timers via node-cron with noOverlap + jitter | ✅ Verified (registry tests) |
| pino REDACT_PATHS covers all LLM provider keys | ✅ Verified (GROQ_API_KEY, GITHUB_TOKEN, SAMBANOVA_API_KEY) |

---

_Reviewed: 2026-10-15T18:15:00Z_
_Reviewer: the agent (gsd-code-reviewer)_
_Depth: standard_