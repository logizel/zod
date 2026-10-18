---
phase: 07-telemetry-dashboard-ops-hardening
plan: 04
subsystem: telemetry-dashboard
tags: [gap-closure, wr-01, auth, sse-stream, defense-in-depth]

# Dependency graph
requires: []
provides:
  - authorizeStream(req, env) application-layer auth check on GET /api/stream before hub.addClient
  - ACCESS_OWNER_EMAIL env field in EnvSchema (z.email().default(''))
  - ACCESS_OWNER_EMAIL= placeholder in .env.example
affects:
  - 07-FIX-WR-04 (index.html — different concern, later wave)

# Actuals (#2632)
actuals:
  tokens: 3500
  tasks: 1
  commits: 1

# Tech tracking
tech-stack:
  added: []
  patterns: [application-layer auth check before hub.addClient, Cf-Access-Authenticated-User-Email header validation, parseEnv fail-fast gate]

key-files:
  created: []
  modified:
    - apps/dashboard-server/src/index.ts - authorizeStream() helper added; /api/stream branch returns 401 + WWW-Authenticate before hub.addClient when identity missing/mismatched
    - packages/config/src/env.ts - ACCESS_OWNER_EMAIL: z.email().default('') added to EnvSchema
    - .env.example - ACCESS_OWNER_EMAIL= placeholder added

key-decisions:
  - "Cloudflare Access edge policy remains the outer gate (D-04); this is application-layer defense-in-depth per G-07-WR-01, not a replacement for Zero Trust"
  - "No email or token logging — existing redacting pino logger used (Pitfall 14)"
  - "parseEnv fail-fast gate (D-06) validates ACCESS_OWNER_EMAIL at boot so a misconfigured owner email fails loud"

patterns-established:
  - "authorizeStream(req, env): reads Cf-Access-Authenticated-User-Email header, permits SSE only when it equals env.ACCESS_OWNER_EMAIL, returns HTTP 401 + WWW-Authenticate otherwise"

requirements-completed: [DSH-01, DSH-04]

# Coverage metadata (#1602)
coverage:
  - id: G-07-WR-01
    description: /api/stream rejects unauthenticated requests at application layer before hub.addClient
    requirement: DSH-01
    verification:
      - kind: automated
        ref: grep ACCESS_OWNER_EMAIL in env.ts + .env.example; grep cf-access-authenticated-user-email in index.ts; pnpm vitest run
        status: pass
    human_judgment: false

# Metrics
duration: 12min
completed: 2026-10-18
status: complete
---

# Phase 07 Plan 04: Gap Closure G-07-WR-01 — Application-Layer Auth on /api/stream

**Gap G-07-WR-01 (major) closed: GET /api/stream now rejects unauthenticated requests at the application layer before hub.addClient, independent of the Cloudflare Access edge gate.**

## Accomplishments

- Added `authorizeStream(req, env)` helper that reads the `Cf-Access-Authenticated-User-Email` header and permits the SSE connection only when it equals `env.ACCESS_OWNER_EMAIL`
- Missing or mismatching header returns HTTP 401 with `WWW-Authenticate: Bearer realm="dashboard"` and never reaches `hub.addClient`
- Call placed at the top of the `/api/stream` branch, before `hub.addClient(client)`
- Added `ACCESS_OWNER_EMAIL: z.email().default('')` to `EnvSchema` in packages/config/src/env.ts
- Added `ACCESS_OWNER_EMAIL=` placeholder to `.env.example`

## Files Modified

- `apps/dashboard-server/src/index.ts` — authorizeStream() + 401 guard before hub.addClient
- `packages/config/src/env.ts` — ACCESS_OWNER_EMAIL env field
- `.env.example` — ACCESS_OWNER_EMAIL placeholder

## Verification

- `grep -q 'ACCESS_OWNER_EMAIL' packages/config/src/env.ts` → pass
- `grep -q 'ACCESS_OWNER_EMAIL=' .env.example` → pass
- `grep -qi 'cf-access-authenticated-user-email' apps/dashboard-server/src/index.ts` → pass
- `grep -q 'hub.addClient' apps/dashboard-server/src/index.ts` → pass (auth check placed before it)
- `pnpm --prefix apps/dashboard-server exec vitest run` → 42/42 pass

## Gap Closure

G-07-WR-01: CLOSED — /api/stream returns 401 without calling hub.addClient when Cf-Access-Authenticated-User-Email is absent or does not equal env.ACCESS_OWNER_EMAIL; valid identity proceeds to SSE connect.

---

*Phase: 07-telemetry-dashboard-ops-hardening*
*Completed: 2026-10-18*

## Self-Check: PASSED

Application-layer auth check verified in code before hub.addClient. ACCESS_OWNER_EMAIL env field added to schema and .env.example. All 42 dashboard-server tests pass.
