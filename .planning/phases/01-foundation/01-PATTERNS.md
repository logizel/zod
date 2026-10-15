# Phase 01: Foundation - Pattern Map

**Mapped:** 2026-10-15
**Files analyzed:** 21 (new files/groups implied by CONTEXT.md decisions + RESEARCH.md structure)
**Analogs found:** 0 / 21 — greenfield repo, no analogs exist (verified, see Metadata)

> **Greenfield notice:** `git ls-files` shows only docs/planning (`AGENTS.md`, `README.md`, `LICENSE`, `.planning/**`, `.gitignore`). No `src/`, `apps/`, `packages/`, or `package.json` exists yet (CONTEXT.md §Existing Code Insights, lines 69–75 confirms). Every file below therefore has **no codebase analog**. Instead of analog excerpts, each assignment gives the **de-facto pattern to copy** — concrete, verified code/config from `01-RESEARCH.md` (itself sourced from Context7 + npm-registry verification this session), with exact RESEARCH.md line references so the planner can lift them verbatim into plan actions.

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `pnpm-workspace.yaml` | config | build | — (greenfield) | none |
| `package.json` (root) | config | build | — (greenfield) | none |
| `tsconfig.base.json` | config | build | — (greenfield) | none |
| `vitest.config.ts` (root) | config | batch (test) | — (greenfield) | none |
| `.env.example` (+ `.gitignore` entries) | config | build/boot | — (greenfield) | none |
| `.pre-commit-config.yaml` (+ `.gitleaks.toml`) | config | event-driven (git hook) | — (greenfield) | none |
| `apps/scheduler/src/index.ts` | service (entrypoint) | batch (scheduled ticks) | — (greenfield) | none |
| `apps/bot/package.json` + stub entry | service (skeleton) | event-driven (future gateway) | — (greenfield) | none |
| `apps/dashboard/index.html` | component (static) | request-response (static serve) | — (greenfield) | none |
| `packages/config/src/env.ts` | config | transform (env → typed config) | — (greenfield) | none |
| `packages/config/src/env.test.ts` | test | batch | — (greenfield) | none |
| `packages/logger/src/index.ts` | utility | streaming (log stream) | — (greenfield) | none |
| `packages/logger/src/redact.test.ts` | test | batch | — (greenfield) | none |
| `packages/db-hot/src/client.ts` | service (DB client) | CRUD + streaming (SSE-ready) | — (greenfield) | none |
| `packages/db-hot` schema notes + tests/drill | model + test | CRUD | — (greenfield) | none |
| `packages/db-cold/src/client.ts` + `infra/turso/schema.sql` + seed | service + migration | CRUD | — (greenfield) | none |
| `packages/dedup/src/fingerprint.ts` + `fingerprint.test.ts` + two-tier check | utility + test | transform (normalize → hash) | — (greenfield) | none |
| `packages/scheduler/src/registry.ts` + stub jobs + `overlap.test.ts` | service + test | batch (cron ticks) | — (greenfield) | none |
| `infra/cloudflared/config.yml` + systemd units (cloudflared, scheduler, PB) | config | N/A (infra) | — (greenfield) | none |
| `infra/oracle/rebuild.sh` + `runbook.md` + `infra/pocketbase/backup.sh` | config | batch + file-I/O | — (greenfield) | none |
| `infra/oracle/drills/*.sh` (port-scan, edge-reject, wipe-restore) | test | batch | — (greenfield) | none |

## Pattern Assignments

> Convention for this file: **Analog: none — greenfield.** Each section names the **de-facto source** (RESEARCH.md section + line numbers) and gives the exact excerpt the planner must paste into plan actions. Do NOT invent alternative APIs; the RESEARCH.md excerpts below are the verified contracts (Context7 + `npm view` 2026-10-15).

### Root workspace files (`pnpm-workspace.yaml`, `package.json`, `tsconfig.base.json`, `vitest.config.ts`) — config, build

**Analog:** none — greenfield. **De-facto source:** `01-RESEARCH.md` "pnpm workspace root + vitest v3 workspace" (lines 440–457) + "Installation" (lines 133–142) + Pitfall 3 (lines 393–397).

**Workspace + root package pattern** (RESEARCH.md lines 441–451):
```yaml
# pnpm-workspace.yaml — Source: https://pnpm.io/workspaces
packages:
  - 'apps/*'
  - 'packages/*'
```
```jsonc
// package.json (root) — private monorepo root
{ "private": true, "packageManager": "pnpm@10.34.7",
  "engines": { "node": ">=22" } }
```

**Vitest v3 workspace pattern** (RESEARCH.md lines 452–457 — note: v3 key is `workspace`, NOT `projects` which is v5-only):
```typescript
// vitest.config.ts — v3 key is `workspace`, NOT `projects` (v5-only)
// Source: Context7 /vitest-dev/vitest (projects/workspaces guide)
import { defineConfig } from 'vitest/config';
export default defineConfig({ test: { workspace: ['./packages/*/vitest.config.ts'] } });
```

**tsconfig contract** (RESEARCH.md Pitfall 3, lines 393–397 + Arch mapping line 209/216): `tsconfig.base.json` must be ESM-aware — `module: nodenext` (or `bundler`) + `moduleResolution: nodenext` — because `eventsource@5` is `"type": "module"` ESM-only. Strict mode on, `declaration` emit (D-03: production entry via compiled `tsc` emit, never `tsx` in prod).

**Install contract** (RESEARCH.md lines 134–142 — planner must use these exact specifiers):
```bash
corepack enable && corepack prepare pnpm@10 --activate
pnpm init
pnpm add -D typescript@~5.9 tsx@^4 vitest@^3.2.7
pnpm --filter @zod/scheduler add node-cron@^4.6.0
pnpm --filter @zod/db-hot add pocketbase@^0.28.0 eventsource@^5.1.3
pnpm --filter @zod/db-cold add @libsql/client@^0.18.0
pnpm --filter @zod/shared add zod@^4 pino@^10 dotenv@^16.6.1
pnpm --filter @zod/shared add -D pino-pretty
```

---

### `packages/config/src/env.ts` (+ `env.test.ts`) — config, transform

**Analog:** none — greenfield. **De-facto source:** `01-RESEARCH.md` Pattern 2 (lines 268–287).

**Fail-fast env gate pattern** (RESEARCH.md lines 273–287 — every app entrypoint calls this first):
```typescript
// Source: Context7 /colinhacks/zod (z.object/.parse/z.infer) + dotenv convention
import * as z from 'zod';
import 'dotenv/config';

const Env = z.object({
  PB_URL: z.string().default('http://127.0.0.1:8090'),
  PB_SERVICE_EMAIL: z.email(),
  PB_SERVICE_PASSWORD: z.string().min(1),
  TURSO_DATABASE_URL: z.string(),
  TURSO_AUTH_TOKEN: z.string().min(1),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
});
export type Env = z.infer<typeof Env>;
export const env: Env = Env.parse(process.env); // throws on missing secrets — boot fails loudly
```
**Test contract** (RESEARCH.md Validation, lines 565, 577): `packages/config/src/env.test.ts` — missing-secret throws; defaults apply. Run via `pnpm vitest run packages/config`.

**Planner note:** zod v4 top-level APIs (`z.email()`, `z.iso.date()`) — v4 line pinned `^4.6.7`. `z.infer` types everywhere; v3 fallback only on proven dep conflict (D-07).

---

### `packages/logger/src/index.ts` (+ `redact.test.ts`) — utility, streaming

**Analog:** none — greenfield. **De-facto source:** `01-RESEARCH.md` Pattern 3 (lines 289–307).

**Redacting base + child pattern** (RESEARCH.md lines 294–307):
```typescript
// Source: Context7 /pinojs/pino (redact option, logger.child)
import pino from 'pino';
import { env } from '@zod/config';

export const logger = pino({
  level: env.LOG_LEVEL,
  redact: {
    paths: ['*.password', '*.token', '*.secret', '*.cookie', '*.authToken',
            'TURSO_AUTH_TOKEN', 'PB_SERVICE_PASSWORD', 'headers.authorization', 'headers.cookie'],
    censor: '[Redacted]',
  },
});
export const child = (bindings: Record<string, unknown>) => logger.child(bindings);
```
**Conventions (D-08):** raw JSON to stdout on VM (journald-friendly); `pino-pretty` transport dev-only, never on VM; per-pipeline `child({pipeline})` bindings (e.g. `scout/events`, `auditor/jobs`); no worker-thread transports on ARM. **Test contract** (RESEARCH.md line 578): `redact.test.ts` — secret paths censored, non-secrets pass through.

---

### `apps/scheduler/src/index.ts` + `packages/scheduler/src/registry.ts` (+ stub jobs, `overlap.test.ts`) — service, batch

**Analog:** none — greenfield. **De-facto source:** `01-RESEARCH.md` Pattern 1 (lines 239–266) + overlap drill (lines 425–438).

**Single-registry + named instrumented stub jobs pattern** (RESEARCH.md lines 243–266 — one module owns ALL `cron.schedule()` calls):
```typescript
// Source: Context7 /node-cron/node-cron README + /websites/nodecron api-reference
import cron from 'node-cron';
import type { Logger } from '../logger';

export function registerStubJobs(log: Logger) {
  const jobs = [
    { name: 'events-stub',   expr: '*/20 * * * *', maxRandomDelay: 5 * 60_000 },
    { name: 'jobs-stub',     expr: '*/45 * * * *', maxRandomDelay: 10 * 60_000 },
    { name: 'local-stub',    expr: '0 */3 * * *',  maxRandomDelay: 20 * 60_000 },
    { name: 'social-stub',   expr: '*/60 * * * *', maxRandomDelay: 25 * 60_000 },
  ];
  for (const j of jobs) {
    const task = cron.schedule(j.expr, async () => {
      const t0 = Date.now();
      log.child({ job: j.name }).info('tick start');
      // Phase 1: stub only — real poll logic arrives Phase 2+
      log.child({ job: j.name }).info({ durationMs: Date.now() - t0 }, 'tick done');
    }, { name: j.name, timezone: 'Asia/Kolkata', noOverlap: true, maxRandomDelay: j.maxRandomDelay });
    task.on('execution:overlap', () => log.child({ job: j.name }).warn('tick skipped: previous run pending'));
    task.start();
  }
}
```
**Entrypoint order** (RESEARCH.md Arch mapping line 209/223): `env.parse()` → logger → `registry.start()`. Production entry compiled `tsc` emit; `tsx` dev-only (D-03).

**Forced-overlap drill pattern** (RESEARCH.md lines 427–438 — proves D-27, runs as unit harness in `overlap.test.ts`):
```typescript
// Source: Context7 /node-cron/node-cron (noOverlap, TaskEvent execution:overlap)
import cron from 'node-cron';

// Drill: schedule a 1s job whose handler sleeps 3s with noOverlap:true,
// assert an 'execution:overlap' event fires and only one run completes.
const overlaps: string[] = [];
const task = cron.schedule('* * * * * *', async () => {
  await new Promise((r) => setTimeout(r, 3000));
}, { name: 'overlap-drill', timezone: 'Asia/Kolkata', noOverlap: true });
task.on('execution:overlap', () => overlaps.push(new Date().toISOString()));
task.start();
```

**Critical specifier warning** (RESEARCH.md correction §1, Open Q2 lines 517–520): install registry `node-cron@^4.6.0` ONLY. Never `pnpm add kelektiv/node-cron` (GitHub shorthand = wrong package family `CronJob` API + `EALLOWGIT` refusal under hardened npm). Planner treats the *API + behavior* (`schedule` + `noOverlap` + `maxRandomDelay`) as the locked intent; the CONTEXT.md D-24 specifier text naming `kelektiv/node-cron` is superseded — flag in plan review, no user re-discuss.

---

### `packages/db-hot/src/client.ts` (+ schema notes, tests, wipe-drill) — service, CRUD + streaming

**Analog:** none — greenfield. **De-facto source:** `01-RESEARCH.md` Pattern 4 (lines 309–327) + backup drill (lines 476–485).

**PB client with shared service-account auth pattern** (RESEARCH.md lines 314–327):
```typescript
// Source: Context7 /pocketbase/js-sdk (AsyncAuthStore ctor, EventSource polyfill, custom auth store)
import PocketBase, { AsyncAuthStore } from 'pocketbase';
import { EventSource } from 'eventsource';
import { env } from '@zod/config';

global.EventSource = EventSource as unknown as typeof globalThis.EventSource;

const store = new AsyncAuthStore({
  save: async (serialized) => { /* write 0600 token file */ },
  initial: undefined, // load from token file at boot
});
export const pb = new PocketBase(env.PB_URL, store);
await pb.collection('_superusers').authWithPassword(env.PB_SERVICE_EMAIL, env.PB_SERVICE_PASSWORD);
```
**Hard constraints (D-10, Pitfall 4 lines 399–404):** PB ARM64 binary (`pocketbase_<ver>_linux_arm64.zip`, checksums verified), unit file hardcodes `--http=127.0.0.1:8090` — never `0.0.0.0`; `pb_data` on block volume; nightly `sqlite3 .backup` (never raw `cp` of a live WAL DB):
```bash
# nightly backup (VM cron/systemd timer) — consistent WAL snapshot
sqlite3 /vol/pb_data/data.db ".backup main /vol/backups/pb-$(date +%F).db"
```
**Schema contract (D-09/D-15):** ship all five collections now — `opportunities` (fingerprint_hash, pipeline, bucket_channel, status, prize, links, deadlines, reminders, bookmark, audit_summary), `agent_telemetry`, `task_scratchpad`, `tombstone_ledger`, `taste_rules` — with indexes + GC-ready fields (`end_date`, `status`, heavy-text columns) even though writers land later. **Version pins:** server `v0.35.x` per lock (default; `v0.40.5` upgrade is open Q1 with `checkpoint:human-verify` — RESEARCH.md lines 513–516), SDK `pocketbase@^0.28.0` (`^0.30` does not exist — max `0.28.1`). **Test contract** (RESEARCH.md lines 561–562, 581): `pnpm --filter @zod/db-hot test` — collections accept/return all fields; telemetry 24h-trim as unit purge-predicate.

---

### `packages/db-cold/src/client.ts` + `infra/turso/schema.sql` + seed (+ tests) — service + migration, CRUD

**Analog:** none — greenfield. **De-facto source:** `01-RESEARCH.md` Pattern 5 (lines 329–350).

**Turso remote-only + ledger DDL pattern** (RESEARCH.md lines 334–350):
```typescript
// Source: Context7 /tursodatabase/turso-docs (createClient, execute DDL + parameterized queries)
import { createClient } from '@libsql/client';
import { env } from '@zod/config';

export const turso = createClient({ url: env.TURSO_DATABASE_URL, authToken: env.TURSO_AUTH_TOKEN });

// infra/turso/schema.sql (applied with IF NOT EXISTS — rerunnable)
await turso.execute(`CREATE TABLE IF NOT EXISTS tombstone_ledger (
  url_hash TEXT PRIMARY KEY, fingerprint TEXT NOT NULL,
  terminal_status TEXT NOT NULL, source TEXT, decided_at TEXT NOT NULL)`);
await turso.execute(`CREATE TABLE IF NOT EXISTS taste_rules (
  id INTEGER PRIMARY KEY AUTOINCREMENT, kind TEXT NOT NULL,
  rule TEXT NOT NULL, weight REAL NOT NULL DEFAULT 1.0, created_at TEXT NOT NULL)`);
await turso.batch([
  { sql: 'INSERT OR IGNORE INTO tombstone_ledger VALUES (?,?,?,?,?)', args: [h, fp, 'routed', src, now] },
]);
```
**Hard constraints (D-11):** remote-only `createClient({url, authToken})` — no `file:`/`syncUrl`, no embedded replica/sync in v1; `tombstone_ledger.url_hash` PK never deleted; `taste_rules` seeded empty. Pre-scrape check is a single-row `SELECT` on the hash PK, never a scan (Pitfall 11). **Pin:** `@libsql/client@^0.18.0` (`^0.15` caret on 0.x excludes `0.18.0` — RESEARCH.md correction §3). **Test contract** (RESEARCH.md line 563): tombstone PK point-lookup + two-tier check via `packages/db-cold` integration (needs Turso test DB).

---

### `packages/dedup/src/fingerprint.ts` (+ `fingerprint.test.ts`, two-tier check) — utility, transform

**Analog:** none — greenfield. **De-facto source:** `01-RESEARCH.md` Pattern 6 (lines 352–354) + validation map (line 563) + Wave 0 gaps (line 576).

**Fingerprint contract (D-12):** pure function — normalize URL (lowercase host, strip tracking params/fragments/trailing slash) + `title|date|organizer` → SHA-256 hex via `node:crypto` `createHash('sha256')` (never `Math.random` — fingerprints must be stable across rebuilds; RESEARCH.md Don't-Hand-Roll table). Two-tier pre-scrape check: PB `fingerprint_hash = ?` (localhost) then Turso `url_hash = ?` point lookup; both single-row, target <5ms measured in drill. **Test contract:** must-match/must-differ fixtures + URL normalization cases in `packages/dedup/src/fingerprint.test.ts`; run `pnpm vitest run packages/dedup`.

---

### `apps/bot` skeleton + `apps/dashboard/index.html` — service skeleton / static component

**Analog:** none — greenfield. **De-facto source:** `01-RESEARCH.md` Arch mapping (line 209) + D-04/D-17/D-22.

**Bot:** `package.json` + entry stub ONLY — no gateway code (discord.js arrives Phase 4/6). Entry stub follows the same `env.parse()` → logger order so Phase 4 inherits the boot contract. **Dashboard:** static `index.html` placeholder shell, deployed to Cloudflare Pages now (D-17); no PB SSE passthrough, no slots/health-grid/boards (explicitly Phase 7, D-22). Zero Trust owner-only Access policy (`Allow` + `Include Emails: <owner>`, deny-by-default — never `Include Everyone`) gates UI *and* future SSE before render; proven by the automated edge-reject drill (D-20).

---

### `infra/cloudflared/config.yml` + systemd units — config, N/A

**Analog:** none — greenfield. **De-facto source:** `01-RESEARCH.md` cloudflared example (lines 459–474) + Pitfall 5 (lines 405–410).

```yaml
# infra/cloudflared/config.yml
# Source: https://developers.cloudflare.com/.../create-local-tunnel/ (tunnel + credentials-file fields)
tunnel: <Tunnel-UUID>
credentials-file: /home/zod/.cloudflared/<Tunnel-UUID>.json
ingress:
  - hostname: dash.example.com
    service: http://localhost:3000   # Phase 7 SSE origin; Phase 1 serves the static shell via Pages
  - service: http_status:404
```
```bash
# Source: https://developers.cloudflare.com/.../as-a-service/linux/
sudo cloudflared --config /home/zod/.cloudflared/config.yml service install
systemctl start cloudflared && systemctl status cloudflared
```
**Hard constraints (D-18/D-19/D-21):** zero open inbound firewall ports, tunnel is the only ingress; install via apt `cloudflare-main`, auto-update on, version logged in runbook; systemd `Restart=always`; tunnel token in env, never in repo; `--config` passed explicitly (sudo `$HOME`→`/root` mismatch crash-loops otherwise). Dual-heartbeat monitoring (tunnel + scheduler pings) with alerts; watchdog provider is planner's discretion (Open Q3).

---

### `infra/oracle/rebuild.sh` + `runbook.md` + `infra/pocketbase/backup.sh` + `infra/oracle/drills/*.sh` — config + test, batch/file-I/O

**Analog:** none — greenfield. **De-facto source:** `01-RESEARCH.md` wipe-drill block (lines 476–485) + validation map (lines 566–567) + Wave 0 gaps (line 580).

**Wipe-restore drill contract (D-16/D-26):**
```bash
# simulated wipe drill: stop PB, move pb_data aside, restore latest backup,
# re-run infra/turso/schema.sql (IF NOT EXISTS), boot, assert:
#   SELECT COUNT(*) FROM opportunities == pre-wipe AND
#   turso tombstone_ledger row count unchanged AND
#   new writes flow to both hot and cold
```
**Scripts to create:** `infra/oracle/rebuild.sh` (one documented command: restores VM + `pb_data` from block-volume backup + reapplies Turso schemas; asserts `uname -m` == `aarch64` before PB download, verifies `checksums.txt`), `infra/pocketbase/backup.sh` (nightly `.backup` → object storage, target is planner's discretion), `infra/oracle/drills/port-scan.sh` (D-18: prefer `ss -tlnp` bind assertion `127.0.0.1:8090` over `nmap`, which isn't installed), `edge-reject.sh` (D-20: unauth UI + SSE rejected before render), `wipe-restore.sh` (D-16). Secrets hygiene: `.gitignore` (`.env`, credential JSONs, `pb_data/`) + `.env.example` + gitleaks hook land in the **first** commit before any secret exists (Pitfall 7, lines 413–422); D-28 history-scan drill runs `gitleaks git`.

---

### Secrets / pre-commit files (`.env.example`, `.pre-commit-config.yaml`, `.gitleaks.toml`) — config, event-driven

**Analog:** none — greenfield. **De-facto source:** `01-RESEARCH.md` Standard Stack supporting table (line 120) + Pitfall 7.

Gitleaks is a **Go binary, not npm** — v8.x via releases page, pre-commit hook `rev: v8.24.2`; fetch `linux_arm64` binary in rebuild/dev-setup script. Real `.env` gitignored with `0600` perms; `.env.example` committed with placeholders only. Upstream feature-freeze (Betterleaks successor) is no reason to switch in Phase 1.

## Shared Patterns

### Secrets hygiene (applies to: every file that touches credentials — env, PB/Turso clients, infra, drills)
**Source:** RESEARCH.md Security Domain (lines 583–607) + Pitfall 7. No analog — greenfield rule, enforced from commit #1:
- `.env` never in git; `.env.example` placeholders only; credential files `0600`
- pino `redact.paths` (see logger excerpt above) on every logger; grep-verify no raw header dumps
- gitleaks pre-commit hook + `gitleaks git` full-history drill (D-28); `checkpoint:human-verify` before each `pnpm add` for the seven recency-flagged packages (zod, pino, pino-pretty, vitest, dotenv, eventsource, tsx — RESEARCH.md legitimacy table lines 150–166; all `too-new`-only on established packages)

### zod v4 at every external boundary (applies to: config, db-hot/db-cold clients, dedup inputs, all future adapters)
**Source:** RESEARCH.md Pattern 2 + D-07. `z.object().parse()` + `z.infer` types everywhere; v4 APIs (`z.email()`, `z.iso.date()`); pin `zod@^4.6.7`. Every future portal adapter returns `Schema.parse()`'d objects.

### Single scheduler module (applies to: `apps/scheduler`, `packages/scheduler`, all future poll jobs)
**Source:** RESEARCH.md Pattern 1. One registry owns all `cron.schedule()` calls; every job gets `name` + `timezone: 'Asia/Kolkata'` + `noOverlap: true` + per-job `maxRandomDelay` + duration metrics → telemetry. Never `setInterval`, never scattered schedules.

### Localhost-only hot path (applies to: db-hot client, PB systemd unit, port-scan drill)
**Source:** RESEARCH.md Pitfall 4 + D-10/D-18. `PB_URL` default `http://127.0.0.1:8090`; unit `--http=127.0.0.1:8090`; `ss -tlnp` must show `127.0.0.1:8090`, never `*:8090`; Access policy never fronts PB directly in Phase 1.

### Version-pin discipline (applies to: root `package.json`, all per-package manifests, rebuild script)
**Source:** RESEARCH.md Standard Stack table (lines 100–114) + correction summary (line 11). Resolved pins: `node-cron@^4.6.0`, `pocketbase@^0.28.0`, `@libsql/client@^0.18.0`, `zod@^4.6.7`, `pino@^10.4.0`, `vitest@^3.2.7`, `dotenv@^16.6.1`, `eventsource@^5.1.3`, `typescript@~5.9` (never `latest` = 7.x dev), `tsx@^4` dev-only, `pnpm@10.34.7` (never `latest` = 12.x). Never bare `latest`; never caret-ranges on `0.x` expecting cross-minor (`^0.15` caps below `0.16.0`). Re-verify with one `npm view` pass at execution start (valid-until 2026-11-14).

## No Analog Found

All 21 file/groups — greenfield repo, zero existing source files to copy from. Planner must use the RESEARCH.md de-facto excerpts in Pattern Assignments above (all Context7/npm-verified 2026-10-15) instead of codebase analogs.

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| All files in File Classification | (see table) | (see table) | No `apps/`, `packages/`, `src/`, or `package.json` exists; `git ls-files` returns only docs/planning + `AGENTS.md`/`README.md`/`LICENSE` |

## Metadata

**Analog search scope:** full working tree (`**/*.{ts,js,json,yaml,yml,toml,html,sh,md}` glob — returned only `AGENTS.md`, `README.md`) + `git ls-files` (returned only `.gitignore`, `.planning/**`, `AGENTS.md`, `LICENSE`, `README.md`) + CONTEXT.md §Existing Code Insights (explicitly "None — greenfield").
**Files scanned:** ~14 tracked files, 0 source files. No `Read` of analog source was possible — nothing to read.
**Tracked-source gate:** satisfied vacuously — no analog paths emitted, so no mirror/untracked paths can propagate. When Phase 1 code lands, later phases' mappers must verify `git ls-files -- <path>` before naming analogs.
**Open questions inherited by planner (RESEARCH.md lines 511–524):** Q1 PB server `v0.35.x` vs `v0.40.5` (default `v0.35.x` + `checkpoint:human-verify`); Q2 `kelektiv/node-cron` specifier text vs `node-cron` v4 API (honor API, flag in review); Q3 watchdog provider + backup object-storage target (planner's discretion, env-plumbed).
**Pattern extraction date:** 2026-10-15
