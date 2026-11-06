# Zod v1 — Deferred Debt Backlog

**Created:** 2026-11-06
**Status:** Open, non-blocking for v1.0.0
**Source:** Phase review dispositions, verification advisories, and closeout audit.

These items were knowingly deferred at v1 close. None block the release; each has a concrete next action.

## P1 — Correctness risks (fix first)

| ID | Item | Evidence | Impact | Next action |
|----|------|----------|--------|-------------|
| D-01 | `applyTastePreScoring` reuses one URL hash for all blocked candidates | `packages/orchestrator/src/taste-apply.ts:142-152`; `06-VERIFICATION.md` WR-01 | One tombstone can suppress unrelated listings | Compute a per-candidate `urlHash`; add a multi-candidate BLOCK test |
| D-02 | TBA re-audit overwrites existing deadlines with `{ tba: true }` | `packages/orchestrator/src/tba-loop.ts` keep-TBA path; `06-VERIFICATION.md` WR-02 | Loses `apply_by` / `event_start` / `event_end` on still-TBA rows | Merge instead of replace; preserve known fields |

## P2 — Behavior gaps

| ID | Item | Evidence | Impact | Next action |
|----|------|----------|--------|-------------|
| D-03 | Bookmark re-reaction resets reminder `sent` flags | `packages/discord-router/src/bookmark.ts:106-111`; WR-03 | Duplicate 48h/24h reminders | Preserve sent flags when recomputing reminders |
| D-04 | `formatReminder` hardcodes hours by anchor type | `packages/discord-router/src/reminder.ts:42`; WR-04 | Reminder text can say "48h" for a 24h reminder | Use the reminder's `hoursBefore` value |
| D-05 | Relay forwards raw content without sanitization or size cap | `packages/discord-router/src/relay.ts:154`; WR-05 | `@everyone`/oversize content can leak into private feed | Strip mentions, cap length, escape content |
| D-06 | Unvalidated `JSON.parse` at social-cookie boundary | `06-REVIEW-DISPOSITION.md` WR-04 | Malformed cookie file can throw at fetch time | Parse with zod; fail closed with a named error |
| D-07 | Local pipeline does not inject BOOST/WEIGHT taste rules into prompts | `packages/orchestrator/src/orchestrator.ts` `drainLocalRow`; `06-VERIFICATION.md` partial gap | Local events ignore non-BLOCK taste rules | Wire `buildTastePromptInjection` into local messages |

## P3 — Hardening, hygiene, and documentation

| ID | Item | Evidence | Impact | Next action |
|----|------|----------|--------|-------------|
| D-08 | Secrets-scan fallback is blind to subdirectory `.env` and default token files | `01-MILESTONE-AUDIT.md` H-03; `infra/oracle/drills/secrets-scan.sh` | Local fallback can miss a committed secret | Extend fallback globs; install gitleaks in CI |
| D-09 | `seed.sql` has no consumer in rebuild | `infra/turso/seed.sql`; milestone audit W-1 | Empty seed is harmless today, but drift risk | Apply seed during rebuild or delete the file |
| D-10 | Watchdog URLs validated only at fire time | `infra/oracle/watchdog.sh`; milestone audit W-3 | A malformed URL fails at the worst moment | Assert URLs during provision/rebuild |
| D-11 | Hand-rolled PocketBase filter escaping | `packages/orchestrator/src/orchestrator.ts:429` | Current `urlHash` is hex and safe; fragile pattern | Use a validated parameter builder or assert hex input |
| D-12 | DM casing fragility in Discord handlers | `06-REVIEW-DISPOSITION.md` WR-01 | Masked by `guild === null` fallback | Normalize command casing explicitly |
| D-13 | Duplicate listener registration guard absent | `06-REVIEW-DISPOSITION.md` WR-02 | Pre-existing pattern; reload could double-handle | Add an idempotent registration guard |
| D-14 | Symlink TOCTOU in social cookie read | `06-REVIEW-DISPOSITION.md` WR-03 | Mitigated by `realpathSync` + confinement; residual race | Re-check fd after open if hardening further |
| D-15 | Phase 7 info items IN-01..IN-05 | `07-REVIEW-DISPOSITION.md` | Test fakes undocumented; boot uses console.error; unused import; stale file list | Document fakes; switch to pino; remove placeholder; fix plan file list |
| D-16 | Phases 2, 5, 6 lack a standalone `SECURITY.md` | Closeout audit | Completed before security enforcement; review dispositions cover findings | Run `/gsd-secure-phase` for each or keep milestone-level acceptance |
| D-17 | 21 advisory findings from Phase 1 review | `01-REVIEW-DISPOSITION.md` | Mostly medium/low; no critical | Triage per disposition; fold into next milestone |

## Suggested order

1. D-01, D-02 (correctness)
2. D-03 through D-07 (user-visible behavior)
3. D-08 through D-11 (security/ops hardening)
4. D-12 through D-17 (hygiene and documentation)
