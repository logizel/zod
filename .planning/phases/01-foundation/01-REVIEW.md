---
phase: 01-foundation
reviewed: 2026-10-15T17:15:00Z
depth: deep
files_reviewed: 30
scope_base: 9ff2731
scope_head: d940baf
findings:
  critical: 0
  high: 3
  medium: 7
  low: 14
  total: 24
status: issues_found
---

# Phase 01 (Foundation): Advisory Code Review

**Reviewed:** 2026-10-15T17:15:00Z · **Depth:** deep (intent → implementation → live probing)
**Scope:** production source + infra scripts added since `9ff2731`
(`packages/*/src`, `apps/*/src`, `infra/**/*.sh`, `infra/**/*.sql`, `infra/**/*.yml`, `*.service`);
`.planning/**` excluded as process docs.
**Grounding:** all four `01-0X-PLAN.md` (threats T-1-01…T-1-12, must_haves, prohibitions)
and all four `01-0X-SUMMARY.md` (claimed verification, deviations).
**Method:** every HIGH finding below was reproduced by executing the built
output or the script in this environment; MEDIUM/LOW findings cite exact
source lines. Non-blocking advisory — no code edited.

## Summary

The phase is well-structured and honest about its residuals (mocked-transport
proofs, local-mode drills, human-judgment coverage items are all declared).
The hygiene posture is genuinely good: no secrets in history, exec bits set,
`set -euo pipefail` everywhere, loopback bind declared, tunnel route clean.
The findings below are the cracks in the controls the threat model relies on:
the env gate accepts empty/garbage URLs for two of six keys, the redact list
is one level deep while pino silently passes through deeper nesting, the
secret-scan backstop cannot see the default token file it exists to catch,
and the tombstone verdict contradicts the plan's own T-1-06 "agreement"
mitigation. None of these is a production breach today; several become live
failures the moment Phase 2+ pipelines log nested objects, reuse URLs, or an
operator copy-pastes `.env.example`.

## HIGH severity

### H-01: `TURSO_DATABASE_URL` accepts empty string — gate passes, cold fails late

**File:** `packages/config/src/env.ts:11`
**Evidence:** `TURSO_DATABASE_URL: z.string(),` — no `.min(1)`, no scheme check.
Reproduced against built output:
`parseEnv({...valid, TURSO_DATABASE_URL:''})` → **PASSED GATE** (`value=""`);
`'notaurl'` → **PASSED GATE**. Sibling `TURSO_AUTH_TOKEN` has `.min(1)`; this
key was simply missed. Copy-pasting `.env.example` (which ships
`TURSO_DATABASE_URL=` empty) and filling only the visibly-required keys
produces a boot that clears the "fail-fast" gate and then fails obscurely
inside `createTursoClient`/first cold call — exactly the late failure D-06/D-07
and must_have truth 2 ("refuses to boot when any required secret is missing")
exist to prevent. An empty string is semantically missing.
**Fix:**
```ts
TURSO_DATABASE_URL: z.string().min(1).refine(
  (v) => v.startsWith('libsql://') || v.startsWith('file:'),
  'TURSO_DATABASE_URL must be a libsql:// URL',
),
```

### H-02: `PB_URL` accepts empty/garbage — hot client constructed against nonsense

**File:** `packages/config/src/env.ts:8`
**Evidence:** `PB_URL: z.string().default('http://127.0.0.1:8090')`.
Reproduced: `PB_URL:'notaurl'` → PASSED; `PB_URL:''` → PASSED (`""`).
`createPbClient` then builds `new PocketBase('')` and the failure surfaces as
an opaque fetch error instead of a named gate abort. Same fail-fast-contract
violation as H-01 on the hot path.
**Fix:** `.min(1).url()` (or `.startsWith('http')` refine to keep loopback
flexibility), so a typo'd `PB_URL` fails at entry like every other key.

### H-03: Secrets-scan backstop is blind to subdir `.env` files and the default token file

**File:** `infra/oracle/drills/secrets-scan.sh:20-22`
**Evidence:** Two independent regex holes, both reproduced:
1. `echo "$TRACKED" | grep -qx '\.env'` — `-x` anchors the *whole line*, so
   only a root `.env` matches. `apps/bot/.env` → **NO MATCH** (verified).
   A committed `packages/<x>/.env` keeps the drill at `SECRETS-SCAN PASS`.
2. The token-JSON alternative `(^|/)[^.]*token.*\.json$` requires `token` to
   appear before any `.` after the last `/` (`[^.]*` cannot cross dots).
   The plan-02 default token file `.pb-service-token.json` has dots before
   `token` → **NO MATCH** (verified; control `sess-token.json` matches).
   The one credential file this repo actually creates by default is the one
   the scan cannot see. (The gitleaks-primary path is unaffected when gitleaks
   is installed; the fallback is what proved `PASS` locally per 01-04-SUMMARY.)
**Fix:**
```bash
echo "$TRACKED" | grep -qx '(^|/).*\.env(\..*)?$'   # any-dir .env, incl. .env.local
# and: (^|/)\.[^.]*token... → allow leading dotfiles, or simply:
echo "$TRACKED" | grep -Ei '(^|/)(\.cloudflared/.*\.json$|(^|/)credentials.*\.json$|token.*\.json$)'
```
plus a positive-control test (commit-shaped fixture asserting detection),
mirroring the dash-pattern positive control already added for content scan.

## MEDIUM severity

### M-01: Redact paths cover one nesting level; two-deep, arrays, and three credential shapes leak

**File:** `packages/logger/src/index.ts:8-24`
**Evidence:** Paths are top-level names + `*.x` (exactly one level) + two
hardcoded header paths. Live reproduction against built logger:
`{two:{deep:{password:'LEAK-TWO-DEEP'}}}` → **LEAKED**,
`{arr:[{password:'LEAK-ARR'}]}` → **LEAKED** verbatim into the log stream
(which persists in journald — durable disclosure, not transient).
Also unredacted today: `PB_SERVICE_EMAIL` (env-schema key, PII/credential
half — plan 01-01 key_link demands redact "cover every secret key declared in
the env schema"; only 2 of 4 secret keys are listed), any
`CLOUDFLARE_TUNNEL_TOKEN` / `WATCHDOG_*_URL` shape (T-1-11 token "carried in
env only" with no log-side backstop), and `headers.set-cookie`/`set-cookie`.
The code comment ("convention is flat or single-nested") documents a
*convention*, but nothing enforces it on Phase 2+ call sites — the control
T-1-02 depends on is one nested object away from failing.
**Fix:** add `*.*.password`, `*.*.token`, `*.*.secret`, `*.*.cookie`,
`*.*.authToken` (and/or `**.password` if the pino version supports deep
wildcards — verify), `PB_SERVICE_EMAIL`, `*TUNNEL_TOKEN*`-style names,
`headers.set-cookie`; add a two-deep/array test case to `redact.test.ts`.

### M-02: Precheck returns `tombstoned` on URL match alone — fingerprint never compared

**File:** `packages/dedup/src/precheck.ts:45-47`
**Evidence:** `const tombstone = await cold.findTombstone(urlHash); return
tombstone === null ? 'fresh' : 'tombstoned';` — the stored `fingerprint`
field (fetched in the same row) is never compared to the current digest.
Consequence: a URL reused for a *new* event (new title/date/organizer, new
fingerprint) is permanently suppressed by the old tombstone — a silent
high-signal miss against the project's core value. This also contradicts the
plan's own T-1-06 mitigation ("the hot-then-cold two-tier lookup requires
agreement across stores before a skip"): a cold hit alone skips, with no
agreement and no fingerprint match.
**Fix:** return `'tombstoned'` only when `tombstone.fingerprint === digest`;
on URL-match/fingerprint-mismatch return `'fresh'` (re-audit the changed
opportunity) and let the writer upsert the new verdict.

### M-03: Token-file `0600` not enforced on pre-existing files — refresh path keeps lax perms

**File:** `packages/db-hot/src/client.ts:58-66`
**Evidence:** `writeFileSync(tokenFile, serialized, { mode: 0o600 })` — Node
applies `mode` **only to newly created files**. Reproduced:
`writeFileSync(f,'old',{mode:0o644})` then rewrite with `{mode:0o600}` →
perms stay **644**. `AsyncAuthStore.save` fires on every token refresh, so a
token file that pre-exists with lax perms (operator `touch`, older build,
restored backup) stays world-readable indefinitely, defeating the T-1-04
"owner-only" mitigation on exactly the long-lived path. The unit test only
covers fresh files in `tmpdir`, so it cannot see this. `loadTokenInitial`
likewise reads without a perms check/warning.
**Fix:** after write, `chmodSync(tokenFile, 0o600)` unconditionally (or
check-and-tighten on load with a warning log).

### M-04: Tunnel liveness trusts `systemctl is-active` — crash-loop-blind, and no heartbeat writer exists

**File:** `infra/oracle/watchdog.sh:69-81`
**Evidence:** Tunnel mode prefers `$HEARTBEAT_DIR/tunnel.heartbeat` (300s),
but 01-03-SUMMARY admits **no writer exists yet** ("plan-04 cloudflared
supervision owns it" — plan 04 never added one), so the live signal is solely
the `systemctl is-active --quiet cloudflared` fallback. `is-active` reports
`active` while a unit is crash-looping under `Restart=always` (until the start
limit bursts), i.e. precisely when the tunnel is down the watchdog pings
"healthy" and the dead-man silence alert never fires — a dark dashboard with
no page. This inverts T-1-09 ("alerts on silence rather than trusting any
single self-reported healthy line"): the unit state *is* the self-report.
**Fix:** ship the `tunnel.heartbeat` writer (e.g. `ExecStartPost`/cron probe
hitting the tunnel health endpoint through the edge) and treat
unit-active-without-fresh-heartbeat as stale; at minimum also fail on
`systemctl is-failed cloudflared`.

### M-05: Rebuild restores `data.db` without `integrity_check` — corrupt backup boots silently

**File:** `infra/oracle/rebuild.sh:129-141`
**Evidence:** `cp "$LATEST" "$VOL_DIR/data.db"` + `note "restore" ...` — no
`PRAGMA integrity_check` before or after. The wipe-restore *live* path
(line 126) performs `integrity_check` and aborts on failure; the rebuild —
the script whose whole purpose is "gets back a working VM" — skips it, so a
bit-rotted or truncated snapshot becomes a silently broken hot store.
Violates the phase's own "loud abort vs silent empty boot" quality bar
(MEM-01 residual) on the most important path.
**Fix:** after copy, `sqlite3 "$VOL_DIR/data.db" 'PRAGMA integrity_check;'`
must equal `ok` or `hard`-abort (same pattern as the wipe drill).

### M-06: `asTombstone` coerces with `String()` — NULL/missing fields become `"undefined"` rows

**File:** `packages/db-cold/src/client.ts:52-61`
**Evidence:** `url_hash: String(record['url_hash'])` etc. A NULL or absent
column becomes the literal string `"undefined"` — a well-formed-looking
poison row that passes every downstream check. Plan 01-02 prohibition:
"boundary parse failures stay loud" / "must NOT silently coerce".
`source` even has `?? ''` masking. The hot side uses zod schemas for this
exact reason; the cold read path bypasses validation entirely.
**Fix:** parse with a zod schema (`ColdTombstoneSchema.parse(row)`) and throw
on violation, matching the db-hot boundary policy.

### M-07: Unguarded top-level `main()` — importing an app module boots the process

**File:** `apps/scheduler/src/index.ts:18`, `apps/bot/src/index.ts:16`
**Evidence:** bare `main();` at module bottom. Any import — a future unit
test, a `tsx` script, a Phase 2 module reusing `registry-start` neighbours —
parses env, constructs the logger, and (scheduler) **starts all four cron
jobs**, keeping the event loop alive. `main()` also cannot be unit-tested for
its boot order without side effects. Standard entrypoint hygiene
(`if (import.meta.url === pathToFileURL(process.argv[1]).href)`) is missing
in both apps.
**Fix:** guard execution behind an entrypoint check; export `main` for tests.

## LOW severity

### L-01: Cold-client tests assert shape, not the remote-only contract or real SQL

**File:** `packages/db-cold/src/ledger.test.ts:59-71`
**Issue:** `createTursoClient` test asserts `typeof execute/batch === 'function'`
only — adding a `file:`/`syncUrl` embedded-replica option (explicitly
prohibited by D-11) would stay green. `clientExecutor` is never exercised
against a real client, and `LOOKUP/RECORD_TOMBSTONE_SQL` are never executed
against real SQLite, so a column/table drift vs `schema.sql` is invisible
until the live host. Add: assertion on client config (no sync/file keys via a
config-capturing fake), and an in-memory SQLite execution of both statements
against the checked-in `schema.sql` (the wipe drill proves the *schema* is
valid, not that the *client SQL* matches it).

### L-02: Wipe-restore `--local` proves plumbing with toy tables, not the real stores

**File:** `infra/oracle/drills/wipe-restore.sh:49-56`
**Issue:** Fixture hot DB is `opportunities(id, fingerprint_hash)` — two
columns vs the fifteen-field contract — and the "cold ledger" is local
SQLite, never Turso/libsql. Survives schema-shape regressions (a
non-nullable column added to the real schema that breaks backup/restore of
real rows) and dialect issues by construction. Plan-acknowledged (D7
human-judgment, live Turso never executed anywhere including the live drill
path as run here). Residual: MEM-03's live round-trip is entirely outstanding.

### L-03: Edge-reject lint check 4 asserts runbook prose, not Access state

**File:** `infra/oracle/drills/edge-reject.sh:44-46`
**Issue:** `grep -qi 'owner-only' "$RUNBOOK" && grep -q 'Allow'` passes on any
wording containing those tokens — a copy-edit that keeps the words but
changes the meaning (or deletes the rule while mentioning it) stays `PASS`.
Brittle coupling: the drill's PASS line claims "5/5 preconditions hold" for
what is partly a prose grep. Live mode does the real 401/403 assert; the lint
mode should at minimum pin the full rule stanza (deny-by-default + zero
bypass + both endpoints), not two loose tokens.

### L-04: Port-scan `--local` cannot fail on the bind assertion

**File:** `infra/oracle/drills/port-scan.sh:36-50`
**Issue:** Every non-declaration outcome degrades to a `PASS` note
(`ss` absent → "proof only"; PB not running → "acceptable in --local"). Only
the unit-file text grep can fail. By design for workstations, but the printed
`PORT-SCAN PASS` overstates what was proven; rename local output to
`PORT-SCAN LINT-PASS (declaration only)` so gate consumers can't misread it.

### L-05: `jobs-stub` cron `*/45` fires at :00 and :45 — alternating 45/15-min gaps, not q45m

**File:** `packages/scheduler/src/jobs.ts:51-53`
**Issue:** In cron, `*/45 * * * *` = minutes 0 and 45 → intervals alternate
45 min, 15 min. The "jobs 30–60m" cadence intent is approximately met on
average but the contract bakes a 15-min pileup window into every hour, and
Phase 2+ authors copying the table inherit the skew. Either document the
doublet or use two schedules for true q45m.

### L-06: Fingerprint normalization misses real-world URL variants

**File:** `packages/dedup/src/fingerprint.ts:13-74`
**Issue:** (a) Pathname case is significant (`/Hackathon` ≠ `/hackathon`) —
same-page dups on case-insensitive servers. (b) Non-`utm_` marketing params
(`ref`, `source`, LinkedIn `si`, X `s`/`t`, `igsh`) are kept — shared-link
variants of one opportunity hash differently → duplicate alerts.
(c) `http` vs `https` split the same page. (d) `userinfo` (`user:pass@host`)
is retained in the canonical form. (e) `hashUrl('')` hashes happily (no
empty guard; only reachable via direct import today). (f) Unparseable input
throws a raw `TypeError: Invalid URL`, not a named error — operability nit
for the precheck caller. None breaks the tested contract; all erode dedup
precision/recall in production.

### L-07: Schema under-constrains three fields the contract names precisely

**File:** `packages/db-hot/src/schema.ts:138,142,160,180`
**Issue:** `step_position` is free `string` while the lock table specifies
`STEP_1..STEP_4` (typo'd positions validate silently); `TasteRule.weight` has
no range (negative weights validate); `TombstoneMirror.terminal_status` is
free `string` while `OpportunityStatus` is an enum (cold/hot status vocab can
drift apart silently). Tighten to enum/min-range now while the one-way lock
is still cheap to amend by migration-free edit.

### L-08: Backup verifies neither source health nor snapshot readability

**File:** `infra/pocketbase/backup.sh:29-38`
**Issue:** Aborts on missing/empty source (good) but backs up a *corrupt*
source happily — no pre `integrity_check`, no post-backup open/read of
`$DEST`. Daily `STAMP=%F` + `mv -f` means a same-day rerun silently replaces
the day's only snapshot. `'.backup main '$TMP''` interpolates `$TMP`
unquoted into sqlite dot-command (breaks on `'`/`space` in operator-set
`BACKUP_DIR`). Add post-backup `integrity_check` + open test, and
`--no-overwrite`/timestamped names for reruns.

### L-09: Reclaim sizing lives in two places with subtly different math

**File:** `infra/oracle/cache-buffer.sh:32-45`, `packages/scheduler/src/jobs.ts:163-172`
**Issue:** The shell (live path) uses `MemAvailable` while the TS helper
(tested path) takes `freeMiB` — `MemFree` ≠ `MemAvailable` (reclaimable
cache), so a future caller passing `MemFree` silently diverges from the
tested formula. Rounding also differs (shell `+99` ceil vs TS `floor`, ≤1 MiB
— immaterial but proof the two are hand-synced). The TS helper additionally
has **no production caller** — spec-mirror plus tests, inviting drift.
Either generate one from the other or add a parity test running the shell
against fixtures and comparing with `computeBufferHoldMiB`. Separately:
`exec sleep infinity` on hold=0 keeps the unit green while reclaim defense is
absent — invisible degradation (watchdog covers liveness, not buffer size).

### L-10: `ensureEventSource` prefers any native implementation over the pinned polyfill

**File:** `packages/db-hot/src/client.ts:42-46`
**Issue:** Assignment only `if (globalThis.EventSource === undefined)`. Node
22+ ships a native `EventSource` lacking the `eventsource@5` header support
the PocketBase SDK needs for authenticated realtime. On this runtime the
approved, pinned polyfill is silently unused. No realtime calls exist in
Phase 1, so latent — but the "realtime-ready wiring" claim rests on an
untested branch. Prefer unconditional assignment (or capability-check for
header support) before Phase 7.

### L-11: Rebuild never places the tunnel config — "one command" needs manual steps

**File:** `infra/oracle/rebuild.sh:176-223`
**Issue:** The script installs four units, copies `cache-buffer.sh`, creates
`CLOUDFLARED_HOME` (700) and `chmod 600`s `$ENV_FILE` — but never copies or
templates `infra/cloudflared/config.yml` (still containing
`TUNNEL-UUID-PLACEHOLDER` / `dash.example.com`) into `CLOUDFLARED_HOME`, nor
the tunnel credentials JSON. The tunnel unit therefore cannot start after a
pure one-command run; Day-0 manual placement (documented in runbook §0/§3)
remains mandatory. Either template the config from
`CLOUDFLARE_TUNNEL_TOKEN`/`DASHBOARD_HOSTNAME` in-script with loud abort on
absence, or scope the "one command" claim to post-Day-0 runs. Related:
no `systemctl stop zod-pocketbase` around re-provision restore (live PB keeps
writing to the replaced inode); GPG key fetched TOFU without fingerprint
pin (standard-practice, note only).

### L-12: Import-time env singletons couple every consumer to process env at import

**File:** `packages/config/src/env.ts:23`, `packages/logger/src/index.ts:45`
**Issue:** `export const env = parseEnv()` and `export const logger =
createLogger(env.LOG_LEVEL)` execute at import time, so importing
`@zod/logger` anywhere (future scripts, REPL, tests without the vitest `env`
shim — which is what currently saves the suite) throws before any test or
handler runs. Contained today by per-package vitest `env` blocks; fragile as
the importer set grows. Prefer lazy getters (`getEnv()`, `getLogger()`) with
the eager singletons kept only in app entries.

### L-13: Registry `stop()` never `destroy()`s tasks

**File:** `packages/scheduler/src/registry.ts:148-152`
**Issue:** `stop()` calls `task.stop()` only. Stopped-but-undestroyed
node-cron tasks retain timers/handles; repeated start/stop cycles (tests,
future graceful-restart code) leak. The boot probe correctly
stop+destroys; the handle should too.

### L-14: Fallback corpus excludes the lockfile; hook firing unverified

**File:** `infra/oracle/drills/secrets-scan.sh:46`, `.pre-commit-config.yaml`
**Issue:** `':!pnpm-lock.yaml'` blinds the fallback scan to auth-bearing
registry URLs occasionally embedded in lockfiles (all-public deps today —
note only). And per 01-01-SUMMARY D6, the gitleaks pre-commit hook file is
pinned but hook *execution* was never observed here (framework absent);
first secret-blocking proof awaits a maintainer install. Both already tracked
as human-judgment — recorded here so the residual isn't lost.

---

## Explicit non-findings (checked, clean)

- **No secret material in git:** history + staged scan for
  `TURSO_AUTH_TOKEN`/`PB_SERVICE_PASSWORD`/tunnel-token shapes with real-length
  values → zero hits outside placeholders/tests; no `.env`/credential/token
  JSON tracked.
- **PB bind + tunnel route:** unit declares `--http=127.0.0.1:8090`
  (`infra/cloudflared/pocketbase.service:20`); `config.yml` has no
  `8090`/`pocketbase` route and ends in `http_status:404`; all units carry
  `Restart=always`.
- **Script hygiene:** all 8 scripts executable with `set -euo pipefail`;
  `grep -E -- "$pat"` dash-safe (the 01-04 deviation-4 fix verified present).
- **DDL idempotency:** `IF NOT EXISTS` on all tables/indexes; `INSERT OR IGNORE`
  writes; empty taste seed; no `DROP`/`DELETE FROM` in cold/dedup sources.
- **Telemetry predicate:** strictly-older boundary, multi-format fixtures,
  loud throw on unparseable input — solid, no finding.
- **Overlap guard:** `noOverlap: true` + `maxRandomDelay` + `execution:overlap`
  wiring proven by the forced-overlap test; boot assertion fails loudly on
  wrong builds (null/undefined/missing-API cases covered).
- **Scheduler entry order** env→logger→registry correct in both apps.

_Reviewed: 2026-10-15T17:15:00Z_
_Reviewer: the agent (gsd-code-reviewer)_
_Depth: deep_
