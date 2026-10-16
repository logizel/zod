---
status: complete
phase: 05-jobs-loot-pipelines
source: derived from built code (packages/orchestrator, packages/dedup, packages/discord-router)
started: 2026-10-16T17:00:00Z
updated: 2026-10-16T17:30:00Z
---

## Current Test

[testing complete]

## Tests

### 1. Cold Start Smoke Test
expected: Kill any running bot/scheduler process. Clear ephemeral state. Start from scratch (`pnpm build` then `pnpm test`). tsc -b exits 0; vitest green. No startup race, no silent seed failure, no missing env.
result: pass

### 2. Jobs: 0–1yr/intern India role appears in correct jobs channel
expected: A true fresher/intern India role (minimum ≤1 year, India on-site/hybrid/remote) is admitted and routed to #💼-jobs-general-swe with eligibility summary and direct apply link visible on the audit card.
result: pass

### 3. Jobs: 2+yr role rejected and never alerted
expected: A role with stated minimum 2+ years experience is rejected by the fresher gate (D-05) and produces no opportunities row or Discord alert.
result: pass

### 4. Jobs: unpaid non-fellowship rejected
expected: An unpaid role that is not a GSoC/LFX/MLH fellowship is rejected (unpaid_non_fellowship) and never alerted (JOB-02).
result: pass

### 5. Jobs: pay-for-training/scam listing rejected
expected: A pay-to-join, training-fee, or Telegram/WhatsApp-only apply listing is rejected by scam detectors (D-07) and never alerted.
result: pass

### 6. Jobs: stack-based channel routing
expected: A Sys/Cloud/DevOps/K8s/Rust/Go role lands in #⚙️-jobs-sys-cloud-devops; every other admitted SWE role lands in #💼-jobs-general-swe. Never an empty bucket (JOB-04/JOB-05).
result: pass

### 7. Loot: sub-₹1L event with free perk diverts to swag channel
expected: An online event failing the ₹1L prize gate but carrying a real free perk with India/worldwide shipping and readable claim steps diverts to #🎁-free-swag-and-credits with shipping_verified and claim_steps on the audit card (LOT-01).
result: pass

### 8. Loot: US-only perk drop rejected
expected: A free perk shipping to US/EU only is rejected by loot gates (loot_us_eu_only) and never alerted (LOT-04).
result: pass

### 9. Dedup: same event on two portals = one merged alert
expected: The same event seen on two portals (e.g. Devpost + Luma) arrives as a single merged alert with unified registration links, not two separate alerts (≥0.9 Dice title match, ±3-day window, organizer match) (EVT-07).
result: pass

### 10. Idempotent drain: no duplicate opportunities on re-run
expected: Re-running the audit drain on already-processed rows skips opportunities create via url_hash pre-check (T-05-05); no duplicate rows or double alerts.
result: pass

## Summary

total: 10
passed: 10
issues: 0
pending: 0
skipped: 0
blocked: 0

## Gaps

[none yet]
