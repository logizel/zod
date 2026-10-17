# Deferred Items — Plan 06-05 (Gap G-06-1 / CR-02)

Out-of-scope pre-existing discoveries (not caused by this plan's changes; not fixed per scope boundary):

| # | Item | Evidence | Disposition |
|---|------|----------|-------------|
| 1 | `router-service.test.ts` > `processOpportunity` > "falls back to exact-name match when env ID is empty for a new bucket" fails | Pre-existing at HEAD `8eaa055`; `router-service.ts` and `router-service.test.ts` are unmodified by this plan. Related to CR-03 `resolveChannel` name-fallback (`caches` vs `cache`), a separate gap (not G-06-1). | Logged only — out of scope for 06-05; covered by a different plan/gap |
