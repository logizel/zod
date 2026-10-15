# Walking Skeleton — Zod

**Phase:** 1
**Generated:** 2026-10-15

## Capability Proven End-to-End

The thinnest working slice of the surviving home: a booting scheduler process validates env, emits a redacted log, registers guarded stub jobs, round-trips one fingerprinted record through hot plus cold memory, and the operator reaches a locked static shell through the tunnel with zero open ports — all reproducible via one rebuild command.

## Architectural Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Runtime | Node 22 LTS with pnpm 10 workspaces | Current LTS on ARM64 with native fetch; strict workspace isolation catches phantom imports |
| Language | TypeScript strict with zod v4 at every external boundary | Inference kills scraper-shape bugs; loud failures at the edge |
| Prod entry | Compiled tsc emit; tsx dev-only | No JIT-transpile tax for the 24/7 process |
| Hot memory | PocketBase ARM64 binary, loopback-only, block-volume data dir | Localhost-latency ops plus native realtime; never publicly bound |
| Cold memory | Turso remote-only via libsql client | Tombstones survive VM reclaim; hash-key point lookups stay fast |
| Ingress | cloudflared tunnel only, zero open ports | Oracle firewall stays closed; outbound-only QUIC |
| Edge gate | Cloudflare Zero Trust owner-only Access | Reject-before-render with zero app-auth code; covers future streams |
| Shell hosting | Cloudflare Pages static placeholder | VM serves zero dashboard bytes; stream boards arrive in Phase 7 |
| Scheduler | Single registry on node-cron 4.6 line with noOverlap plus jitter | Overlap guard plus per-job jitter is a framework property, not boilerplate |
| Logging | pino JSON to stdout with redact paths plus child loggers | Journald-friendly; secrets never reach logs |
| Secrets | Env-only with fail-fast parse plus gitleaks hook from commit one | History rewrites are the cost of lateness |
| Reclaim defense | 2.5GB wired-cache buffer plus external watchdog | Holds the 22 to 30 percent baseline; silence pages |
| Directory layout | apps bot, scheduler, dashboard plus packages config, logger, db-hot, db-cold, dedup, scheduler plus infra | Full layout now per D-01 avoids re-scaffolding; non-core packages arrive with their phases |

## Stack Touched in Phase 1

- [ ] Project scaffold (pnpm workspaces, tsc emit, vitest 3 with v3 workspace key)
- [ ] Routing — scheduler registry owning all four cadence stubs (events, jobs, local, social)
- [ ] Database — one real write plus read round-trip: fingerprinted record into hot collections and cold ledger, precheck hit verified
- [ ] UI — static locked shell placeholder behind the owner-only wall (interactive boards deferred to Phase 7)
- [ ] Deployment — one documented rebuild command plus runbook; dev boots via install, build, unit commands

## Out of Scope (Deferred to Later Slices)

- Browser queue, sanitizer, and Scout filter (Phase 2)
- LLM gateway, 2D buckets, baton-pass, length-stitch (Phase 3)
- Real poll logic in stub jobs, Discord gateway, audit cards, channel routing (Phase 4 plus)
- Fuzzy duplicate merger beyond exact fingerprint equality (Phase 5)
- Local and social source coverage, relay, taste learning (Phase 6)
- Live SSE boards, slots ticker, health grid, midnight GC execution (Phase 7)
- Embedded Turso replicas, tunnel-served VM origin, non-owner access paths (never in v1)

## Subsequent Slice Plan

Each later phase adds one vertical slice on top of this skeleton without altering its architectural decisions:

- Phase 2: Any candidate URL becomes capped clean markdown with spam filtered and scratchpad-tracked before any LLM is spent
- Phase 3: Auditors get reliable model answers despite quota walls via bucket handoff without re-scraping
- Phase 4: First verified deduplicated high-signal event alert lands in Discord with an official source link
- Phase 5: Fresher-true job alerts plus verified free-perk diversions with duplicates merged and scams rejected
- Phase 6: All 10 channels route correctly with reminders and bookmarks, fed by local, relay, and social sources
- Phase 7: Owner watches the swarm live on the locked read-only dashboard that survives tunnel and VM failures
