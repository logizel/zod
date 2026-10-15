# Phase 4 Plan 01 Summary — Discord Router Tracer

**Phase:** 04 (Events Vertical Slice)  
**Plan:** 01  
**Wave:** 1  
**Status:** Complete  
**Commit:** b83237d

## What Was Built

Scaffolded the `@zod/discord-router` workspace package — the first end-to-end verified event alert pipeline for Phase 4. A CTFtime national-portal event flows through Scout pre-filter, Link-Hopper 2-hop resolution, 80/20 domain filter, prize gate, and lands as a Discord audit card with status transitioning `audited` → `routed`.

### Source Modules (14 files)

| File | Purpose |
|------|---------|
| `packages/discord-router/package.json` | Workspace package, `discord.js` + `@zod/*` workspace deps |
| `packages/discord-router/tsconfig.json` | Project references: config, db-hot, logger, sanitize, scheduler |
| `packages/discord-router/vitest.config.ts` | Test config with `DISCORD_TOKEN` env + `@zod/*` aliases |
| `packages/discord-router/src/globals.d.ts` | Node globals + `fetch`/`AbortController` shims |
| `packages/discord-router/src/index.ts` | Entry: `parseEnv` → `createLogger` → `startGateway` → `startRouterService` |
| `packages/discord-router/src/gateway.ts` | discord.js Client (GuildMessages + MessageContent intents), `startGateway`/`getClient` |
| `packages/discord-router/src/router-service.ts` | Poll loop: `getList(status='audited' && bucket_channel)` → `buildAuditCard` → `channel.send` → `pb.update(status='routed')`; `recordFailure` retry (5 → tombstone) |
| `packages/discord-router/src/embed.ts` | `buildAuditCard(opp)`: UI-01 EmbedBuilder (title, organizer, dates, prize, [official]+[aggregator] links, audit_summary) |
| `packages/discord-router/src/link-hop.ts` | `resolveOfficialDomain(url, maxHops=2)`: native fetch `redirect:'manual'`, SSRF guard per hop, tombstone `link_hop_failed` on exhaustion |
| `packages/discord-router/src/domain-filter.ts` | `prefilter(input)`: 80/20 — SWE domains pass outright, deep-tech at organizer>=9 AND agenda>=9, reject non-technical |
| `packages/discord-router/src/prize-gate.ts` | `passesPrizeGate(prizeText, prizeCashInr)`: explicit INR ≥₹1,00,000, credits/vouchers stripped, `null` rejects |
| `packages/discord-router/src/portals/ctftime.ts` | `list(opts)`: CTFtime JSON API adapter, emits `PollCandidate[]` with title+snippet only (zero full fetch) |

### Modified Files (6 files)

| File | Change |
|------|--------|
| `packages/config/src/env.ts` | `DISCORD_TOKEN: z.string().min(1)` added to `EnvSchema` (fail-fast gate) |
| `packages/logger/src/index.ts` | `'DISCORD_TOKEN'` added to `REDACT_PATHS` |
| `packages/sanitize/package.json` | Added `./fetch` subpath export |
| `packages/sanitize/src/fetch.ts` | `validateUrl` exported (was module-private) |
| `packages/scheduler/package.json` | Added `./jobs` subpath export |
| `pnpm-lock.yaml` | Updated for `discord.js` + new workspace package |

### Test Files (5 files, 23 tests — all passing)

| File | Coverage |
|------|----------|
| `src/link-hop.test.ts` | 2-hop resolution, hop exhaustion (`link_hop_failed`), SSRF guard on private/loopback |
| `src/domain-filter.test.ts` | SWE domain pass, deep-tech threshold boundary (organizer/agenda >=9), non-technical reject |
| `src/prize-gate.test.ts` | INR ≥₹1L pass, `null` rejects, credit/voucher/certificate reject, TBA reject |
| `src/embed.test.ts` | All 6 UI-01 fields (title, organizer, dates, prize, merged links, audit_summary) |
| `src/portals/ctftime.test.ts` | Mock JSON listing → `PollCandidate[]` title+snippet, no full-fetch fields, `since` filtering |

## Verification

- `tsc -b packages/discord-router` — zero errors
- `pnpm vitest run packages/discord-router` — 23/23 tests green
- Full workspace `pnpm build` — clean
- `DISCORD_TOKEN` fail-fast: `parseEnv()` throws before any discord.js Client constructs
- `DISCORD_TOKEN` in `REDACT_PATHS`: pino redacts token as `[Redacted]` in log output

## Locked Decisions Honored

- **D-01:** All 7 national portals planned (CTFtime in this plan; 6 more in Plan 02)
- **D-03:** Adapter emits title+snippet from listing; Scout pre-filter on listing; zero fetch before Scout pass
- **D-04:** Link-Hopper resolves aggregator→official domain BEFORE auditor verdict
- **D-09:** Dedicated router service polls `status='audited'` + `bucket_channel`, posts embed, marks `status='routed'`

## Threat Mitigations Implemented

- T-04-01: `DISCORD_TOKEN` env-only, fail-fast parse, `REDACT_PATHS`, `.env` gitignored
- T-04-02: `validateUrl` SSRF guard on every Link-Hopper hop target; max 2 hops; `link_hop_failed` tombstone
- T-04-03: `status='routed'` only after successful `channel.send`; `recordFailure` retry prevents duplicates
- T-04-04: `DISCORD_TOKEN` in `REDACT_PATHS`; pino redacts all token-like fields
- T-04-05: Single scheduler registry with `noOverlap: true` (enforced in Plan 02)
- T-04-06: 80/20 pre-filter before auditor; non-technical business rejected at entry
- T-04-SC: `discord.js` package-legitimacy [OK] per 04-RESEARCH.md Package Legitimacy Audit

## Next (Wave 2 — Plan 02)

6 remaining portal adapters (unstop, devfolio, devpost, luma, meetup, clist) + staggered 7-portal cron registration via single scheduler registry.
