---
phase: 05-jobs-loot-pipelines
reviewed: 2026-10-16T00:00:00Z
source: [05-REVIEW.md]
status: open
---

# Code Review Disposition — Phase 05

One row per finding from `05-REVIEW.md`, defaulting to `open`. Reconcile `fixed`/`skipped` from REVIEW-FIX.md when fixes land. Advisory only — never blocks.

| ID | Severity | Disposition | Source |
|----|----------|-------------|--------|
| CR-01 | critical | open | SQL injection via string interpolation in `createOpportunityIfAbsent` filter (`orchestrator.ts:363`) |
| CR-02 | critical | open | `require()` in ESM module causes runtime crash (`boards.ts:46-47`) |
| WR-01 | warning | open | Dedup merger reads nonexistent `opportunities` fields (`merger.ts:197-200`) |
| WR-02 | warning | open | discord.js v14 API mismatch in `resolveChannel` name-based fallback (`router-service.ts:175`) |
| WR-03 | warning | open | HN watermark off-by-one causes duplicate processing (`hn-whoshiring.ts:88`) |
| WR-04 | warning | open | `createMergeStore` called with `pb as any`, no `cold` store (`orchestrator.ts:204`) |
| WR-05 | warning | open | Jobs merge requires `location`, making merger nearly useless (`merger.ts:141-144`) |
| WR-06 | warning | open | Fellowship gate admits unpaid non-fellowship roles when `fellowship_program` is null (`gates/jobs.ts:215-219`) |
| WR-07 | warning | open | Turso cold client created but never used (`registry-start.ts:45,84-85`) |
| IN-01 | info | open | Missing newline in jobs rule pack prompt (`rule-packs/jobs.ts:95-96`) |
| IN-02 | info | open | Duplicate `stripHtml` function across adapters (4 files) |
| IN-03 | info | open | `startRegistry` does not register Phase 5 poll/audit-drain jobs (`registry.ts:299`) |

## Summary

| Severity | Count | Disposition |
|----------|-------|-------------|
| Critical | 2 | open |
| Warning | 7 | open |
| Info | 3 | open |
| **Total** | **12** | **open** |

## Notes

- CR-01 and CR-02 are shipping-blockers per reviewer recommendation (injection vulnerability + ESM runtime crash).
- All other findings are advisory; no finding blocks phase completion per the code-review-gate contract (`advisory only — never blocks execution flow`).
- Disposition source: `05-REVIEW.md` frontmatter `findings: {critical: 2, warning: 7, info: 3, total: 12}`.

---
*Phase: 05-jobs-loot-pipelines*
*Generated during execute-phase code_review_gate*
