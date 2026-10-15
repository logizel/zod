---
phase: 01-foundation
review: 01-REVIEW.md
recorded: 2026-10-15
open: 24 of 24
fixed: 0
deferred: 0
---

# Phase 01 Review Disposition

Advisory ledger for `01-REVIEW.md` (0 critical · 3 high · 7 medium · 14 low).
Every finding defaults to `open`; none triaged yet. High-severity items are
recommended for Phase 2 planning input (env-gate hardening H-01/H-02 and
secrets-scan coverage H-03 directly guard must_have truths). No code changed
by this ledger.

| ID | Title | Severity | Disposition | Source |
|----|-------|----------|-------------|--------|
| H-01 | TURSO_DATABASE_URL accepts empty string — gate passes, cold fails late | high | open | 01-REVIEW.md |
| H-02 | PB_URL accepts empty/garbage — hot client constructed against nonsense | high | open | 01-REVIEW.md |
| H-03 | Secrets-scan backstop is blind to subdir .env files and the default token file | high | open | 01-REVIEW.md |
| M-01 | Redact paths cover one nesting level; deeper nesting and credential shapes leak | medium | open | 01-REVIEW.md |
| M-02 | Precheck returns tombstoned on URL match alone — fingerprint never compared | medium | open | 01-REVIEW.md |
| M-03 | Token-file 0600 not enforced on pre-existing files | medium | open | 01-REVIEW.md |
| M-04 | Tunnel liveness trusts systemctl is-active; no heartbeat writer exists | medium | open | 01-REVIEW.md |
| M-05 | Rebuild restores data.db without integrity_check | medium | open | 01-REVIEW.md |
| M-06 | asTombstone coerces with String() — NULL/missing fields become "undefined" rows | medium | open | 01-REVIEW.md |
| M-07 | Unguarded top-level main() — importing an app module boots the process | medium | open | 01-REVIEW.md |
| L-01 | Cold-client tests assert shape, not the remote-only contract or real SQL | low | open | 01-REVIEW.md |
| L-02 | Wipe-restore --local proves plumbing with toy tables, not the real stores | low | open | 01-REVIEW.md |
| L-03 | Edge-reject lint check 4 asserts runbook prose, not Access state | low | open | 01-REVIEW.md |
| L-04 | Port-scan --local cannot fail on the bind assertion | low | open | 01-REVIEW.md |
| L-05 | jobs-stub cron */45 fires at :00 and :45 — alternating gaps, not q45m | low | open | 01-REVIEW.md |
| L-06 | Fingerprint normalization misses real-world URL variants | low | open | 01-REVIEW.md |
| L-07 | Schema under-constrains three fields the contract names precisely | low | open | 01-REVIEW.md |
| L-08 | Backup verifies neither source health nor snapshot readability | low | open | 01-REVIEW.md |
| L-09 | Reclaim sizing lives in two places with subtly different math | low | open | 01-REVIEW.md |
| L-10 | ensureEventSource prefers any native implementation over the pinned polyfill | low | open | 01-REVIEW.md |
| L-11 | Rebuild never places the tunnel config — one command needs manual steps | low | open | 01-REVIEW.md |
| L-12 | Import-time env singletons couple every consumer to process env at import | low | open | 01-REVIEW.md |
| L-13 | Registry stop() never destroy()s tasks | low | open | 01-REVIEW.md |
| L-14 | Fallback corpus excludes the lockfile; hook firing unverified | low | open | 01-REVIEW.md |
