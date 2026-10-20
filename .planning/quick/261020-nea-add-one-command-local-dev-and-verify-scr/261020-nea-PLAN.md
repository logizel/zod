---
phase: 261020-nea-add-one-command-local-dev-and-verify-scr
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - scripts/dev-local.mjs
  - scripts/dev-dashboard-proxy.mjs
  - scripts/verify-local.mjs
  - package.json
  - docs/local-dev.md
autonomous: true
requirements: []
user_setup: []

estimate:
  tokens: 60000
  raw_tokens: 40000
  tasks: 3
  confidence: low

must_haves:
  truths:
    - `pnpm dev` boots PocketBase, the idempotent bootstrap, the dashboard server, the local proxy, and the scheduler from the repo root, then prints `READY → http://127.0.0.1:8080`.
    - http://127.0.0.1:8080 serves apps/dashboard/index.html with `https://dash.example.com` rewritten to the local origin, and `/api/boards` returns 8 tabs / 11 rows with the committed seed data.
    - SIGINT to `pnpm dev` cleanly stops every child process group and frees ports 8090, 3000, and 8080; an unexpected child exit shuts the rest down with a nonzero exit.
    - `pnpm verify:local` runs the dashboard-server build, both test suites, the db-hot scripts typecheck, every local drill except browser-soak, and the rebuild dry-run, then prints a PASS/FAIL summary and exits nonzero on failure.
    - `docs/local-dev.md` documents `pnpm dev`, the URL, Ctrl-C, optional flags, and `pnpm verify:local [--soak]`; no new dependencies are added and the pre-existing broken root `pnpm build` is untouched.
  artifacts:
    - scripts/dev-local.mjs
    - scripts/dev-dashboard-proxy.mjs
    - scripts/verify-local.mjs
    - docs/local-dev.md
    - package.json
  key_links:
    - scripts/dev-local.mjs spawns scripts/dev-dashboard-proxy.mjs and injects the same resolved ACCESS_OWNER_EMAIL into the dashboard server and the proxy so authorizeStream accepts proxied SSE requests.
    - scripts/dev-local.mjs waits on /api/health, /api/boards, and / before printing READY, so the URL is usable the moment it appears.
    - scripts/dev-dashboard-proxy.mjs re-reads apps/dashboard/index.html per request and pipes SSE responses instead of buffering them.
    - scripts/verify-local.mjs discovers drills from infra/oracle/drills/*.sh, excluding browser-soak.sh unless --soak is passed.
    - package.json wires `dev`, `dev:local`, and `verify:local` to the three Node ESM scripts.
---

<objective>
Replace the manual local-stack runbook with two commands: `pnpm dev` starts PocketBase + bootstrap + dashboard server + local proxy + scheduler with prefixed logs and one shutdown path, and `pnpm verify:local` runs the build/test gates plus all local drills with a single PASS/FAIL summary.

Purpose: local verification currently requires remembering a long sequence (PB serve, superuser init, bootstrap --seed, dashboard build/start, temp proxy, scheduler) with no cleanup path; the user cannot reliably bring the stack up or prove it is healthy in one step.
Output: scripts/dev-local.mjs, scripts/dev-dashboard-proxy.mjs, scripts/verify-local.mjs, root package.json script entries, and docs/local-dev.md, proven by a real start→curl→SIGINT smoke test.

Executor scope guard: do NOT fix or invoke the pre-existing broken root `pnpm build`. Do NOT touch the known product gaps (SseHub slots, scheduler audit-drain wiring, bot skeleton, /api/audit/older). Do NOT modify `.env`, `pb_data/`, or any pre-existing uncommitted Phase 07 / `.gsd` / `.planning` files. No new npm dependencies.
</objective>

<execution_context>
@/home/jizelxprince/.config/opencode/gsd-core/workflows/execute-plan.md
@/home/jizelxprince/.config/opencode/gsd-core/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/STATE.md
@package.json
@.env.example
@apps/dashboard-server/src/index.ts
@apps/dashboard/index.html
@packages/db-hot/scripts/bootstrap-pb.ts
@infra/oracle/drills/edge-reject.sh
@infra/oracle/rebuild.sh
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add the local dashboard proxy and the one-command dev orchestrator</name>
  <files>scripts/dev-dashboard-proxy.mjs, scripts/dev-local.mjs</files>
  <action>Create the scripts/ directory and two Node ESM scripts using only node: built-ins (no new dependencies, no imports from workspace packages). Both scripts must resolve the repo root from import.meta.url, never from a hard-coded absolute path.

First create scripts/dev-dashboard-proxy.mjs, based on the existing temp proxy at /tmp/opencode/zod-dashboard-proxy.mjs with these changes:
1. Compute ROOT as the parent of the scripts/ directory via fileURLToPath(import.meta.url); resolve apps/dashboard/index.html from ROOT. Bind 127.0.0.1:8080 only; never 0.0.0.0.
2. On every request for `/` or `/index.html`, read apps/dashboard/index.html fresh with readFileSync (no module-level cache), replace every `https://dash.example.com` occurrence with `http://127.0.0.1:8080`, and respond 200 with `content-type: text/html; charset=utf-8` and `cache-control: no-store`. Editing the HTML must not require a proxy restart.
3. For any pathname starting with `/api/`, forward the request to 127.0.0.1:3000 using req.url verbatim so query strings survive, copy the incoming headers, set host to `127.0.0.1:3000`, and inject `cf-access-authenticated-user-email` from ACCESS_OWNER_EMAIL with fallback `owner@example.com`. On the upstream response call writeHead with the upstream status and headers, flushHeaders(), then pipe the upstream stream to the client without buffering so SSE frames arrive immediately. Pipe the request body upstream, answer 502 on upstream error when headers are not yet sent, and destroy the upstream request when the client disconnects.
4. Answer 404 JSON for every other pathname. Print exactly one ready line on listen (`listening on http://127.0.0.1:8080 (owner <email>)`, without a hard-coded `[proxy]` prefix because dev-local adds it) and no per-request noise. Close the server on SIGINT/SIGTERM and exit 0.

Then create scripts/dev-local.mjs with this behavior:
1. Parse flags `--no-seed`, `--no-scheduler`, and `--help`; reject unknown flags with usage and exit 2. Help prints the commands, ports, flags, and the http://127.0.0.1:8080 URL.
2. Preflight before starting anything, with one actionable error per failure: Node major version >= 22 (use process.versions.node), `pnpm` resolvable on PATH, `pocketbase` resolvable on PATH (state that PocketBase 0.40.x is expected), `.env` present at ROOT (hint `cp .env.example .env` and fill credentials), and ports 8090, 3000, and 8080 free on 127.0.0.1. Probe each port with node:net by listening on 127.0.0.1 and closing; report the specific busy port and tell the user to stop the existing process.
3. Read ROOT/.env only to resolve non-secret defaults (parse KEY=VALUE lines, skip blank and `#` lines, strip one layer of surrounding single or double quotes). Never print values. Resolve the owner identity in this order: a non-empty process.env.ACCESS_OWNER_EMAIL, else a non-empty ACCESS_OWNER_EMAIL from .env, else `owner@example.com`.
4. If `pb_data/data.db` does not exist, resolve PB_SERVICE_EMAIL and PB_SERVICE_PASSWORD from process env or .env and fail with a clear message when either is missing. Initialize the superuser with an argument array (no shell) running `pocketbase superuser create <email> <password> --dir ./pb_data` from ROOT. If data.db exists, do not create or modify superusers; a credential mismatch will surface at bootstrap and must be reported, never worked around by deleting pb_data.
5. Start PocketBase as `pocketbase serve --http 127.0.0.1:8090 --dir ./pb_data` and wait for `http://127.0.0.1:8090/api/health` to return 200 (retry up to ~30s, 250ms interval).
6. Run `pnpm exec tsx packages/db-hot/scripts/bootstrap-pb.ts` from ROOT, appending `--seed` unless `--no-seed`; use inherited stdio and fail the whole run with the exit code and a short hint if it fails.
7. Build only the dashboard server with `pnpm --filter @zod/dashboard-server build`. Do not call the root `pnpm build`; add a code comment that the root build is a known pre-existing failure and is intentionally skipped.
8. Start `node apps/dashboard-server/dist/index.js` with cwd ROOT and env `{...process.env, ACCESS_OWNER_EMAIL: owner}`, and wait for `http://127.0.0.1:3000/api/boards` to return 200 (503 means PB auth/upstream is not ready yet, so retry rather than fail immediately).
9. Start `node scripts/dev-dashboard-proxy.mjs` with the same owner env and wait for `http://127.0.0.1:8080/` to return 200.
10. Unless `--no-scheduler`, start `pnpm dev:scheduler` with cwd ROOT and the same owner env. After ~1s confirm the process is still alive; a prompt exit is handled by the unexpected-exit path below.
11. Prefix every child stdout/stderr line with `[pb]`, `[dashboard]`, `[proxy]`, or `[scheduler]` using a line buffer (partial lines included on flush). Bootstrap and build output may use their own inherited output. After all readiness gates pass, print `READY → http://127.0.0.1:8080` and a single line noting that Ctrl-C stops all services.
12. Spawn children with `detached: true` on POSIX so each has its own process group. On SIGINT or SIGTERM, run a reentrancy-guarded shutdown that sends SIGTERM to each group (`process.kill(-pid, 'SIGTERM')`, falling back to child.kill when group kill throws), waits up to 5s per child for exit, then sends SIGKILL to any survivor; exit 0 after cleanup. If any child exits unexpectedly (not during shutdown), log `[name] exited unexpectedly (code ..., signal ...)`, shut down every other child through the same path, and set a nonzero exit code (the child's code when nonzero, else 1).
13. Failures during startup (preflight, superuser init, bootstrap, build, or a readiness timeout) must run the same shutdown path and exit nonzero rather than leaving orphaned services. Include process.on handlers for uncaughtException and unhandledRejection that log the message (never env values) and shut down.</action>
  <verify>
    <automated>node --check scripts/dev-local.mjs &amp;&amp; node --check scripts/dev-dashboard-proxy.mjs &amp;&amp; (set -e; node scripts/dev-dashboard-proxy.mjs &amp; PROXY_PID=$!; trap 'kill -TERM $PROXY_PID 2>/dev/null || true' EXIT; for i in $(seq 1 40); do if curl -fsS http://127.0.0.1:8080/ -o /tmp/zod-proxy-check.html 2>/dev/null; then break; fi; sleep 0.2; done; grep -q '&lt;h1&gt;Zod Telemetry&lt;/h1&gt;' /tmp/zod-proxy-check.html; grep -q 'data-boards-url="http://127.0.0.1:8080/api/boards"' /tmp/zod-proxy-check.html; kill -TERM $PROXY_PID; wait $PROXY_PID || true)</automated>
  </verify>
  <done>Both scripts pass node --check; the proxy starts on 127.0.0.1:8080, serves the dashboard HTML with the local-origin rewrite, and exits cleanly on SIGTERM; dev-local has the complete preflight/startup/readiness/shutdown state machine described above.</done>
</task>

<task type="auto">
  <name>Task 2: Add the verify:local runner, package scripts, and local-dev documentation</name>
  <files>scripts/verify-local.mjs, package.json, docs/local-dev.md</files>
  <action>Create scripts/verify-local.mjs with only node: built-ins. It must run these steps sequentially from ROOT, printing a clear `[n/total] label` banner before each and continuing past failures so the summary is complete:
1. `pnpm --filter @zod/dashboard-server build`.
2. `pnpm test`.
3. `pnpm --filter @zod/dashboard-server test`.
4. `pnpm --filter @zod/db-hot typecheck:scripts`.
5. Every `infra/oracle/drills/*.sh` file except `browser-soak.sh`, sorted by filename, invoked as `bash <absolute-path> --local`.
6. `bash infra/oracle/rebuild.sh --dry-run`.
7. Only when `--soak` is passed, append `bash infra/oracle/drills/browser-soak.sh --local` (the documented 5-minute local soak).
Use spawnSync with cwd ROOT, stdio inherit, and no shell. Treat a spawn error (including ENOENT) as a failed step with its message. Record each step's label, pass/fail, and duration; after the last step print a summary block listing every step as PASS or FAIL with seconds, plus `N passed, M failed`. Exit 1 when any step failed, 0 otherwise. Support `--help` (usage plus the step list) and reject unknown flags.

Edit the root package.json scripts block to add exactly: `"dev": "node scripts/dev-local.mjs"`, `"dev:local": "node scripts/dev-local.mjs"`, and `"verify:local": "node scripts/verify-local.mjs"`. Keep every existing script (`build`, `test`, `dev:scheduler`, `start:scheduler`) unchanged and add no dependencies.

Create docs/local-dev.md as a concise operator page:
- Prerequisites: Node >= 22, pnpm, PocketBase 0.40.x on PATH, and a `.env` copied from `.env.example` with real credentials (PB_SERVICE_EMAIL/PB_SERVICE_PASSWORD, ACCESS_OWNER_EMAIL optional).
- Quickstart: `pnpm dev`, open http://127.0.0.1:8080, Ctrl-C stops PocketBase, dashboard server, proxy, and scheduler.
- What starts and on which loopback ports: PocketBase 8090 (`--dir ./pb_data`), idempotent bootstrap `--seed`, dashboard server 3000, proxy 8080, scheduler via `pnpm dev:scheduler`.
- First-run behavior: when pb_data/data.db is absent, the superuser is created from PB_SERVICE_EMAIL/PB_SERVICE_PASSWORD; if the data file exists, credentials must already match.
- Flags: `--no-seed`, `--no-scheduler`, `--help`.
- Verification: `pnpm verify:local` and `pnpm verify:local --soak`, with the list of gates and the note that browser-soak only runs with `--soak`.
- Troubleshooting: busy ports, missing `.env`, credential mismatch against an existing pb_data (do not delete the data directory), and the fact that only `@zod/dashboard-server` is built because the root `pnpm build` is a known pre-existing failure.
- Security note: this is a loopback-only local harness; production remains the Cloudflare Tunnel + Zero Trust path, and the proxy must never be exposed publicly.
Do NOT edit README.md: it is a one-line placeholder (`# zod`) with no docs/quickstart section to link from, so creating docs/local-dev.md is the complete documentation change for this task.</action>
  <verify>
    <automated>node --check scripts/verify-local.mjs &amp;&amp; node -e "const p=require('./package.json'); if(p.scripts.dev!=='node scripts/dev-local.mjs'||p.scripts['dev:local']!=='node scripts/dev-local.mjs'||p.scripts['verify:local']!=='node scripts/verify-local.mjs') process.exit(1); if(p.scripts.build!=='tsc -b tsconfig.json') process.exit(1)" &amp;&amp; pnpm verify:local</automated>
  </verify>
  <done>scripts/verify-local.mjs runs every gate and drill sequentially, prints the PASS/FAIL summary, and exits nonzero on failure; package.json exposes dev, dev:local, and verify:local without disturbing existing scripts or dependencies; docs/local-dev.md covers the quickstart, flags, first-run credentials, verification, and troubleshooting; README.md is unchanged.</done>
</task>

<task type="auto">
  <name>Task 3: Prove the one-command stack end-to-end and clean shutdown</name>
  <files>scripts/dev-local.mjs, scripts/dev-dashboard-proxy.mjs, scripts/verify-local.mjs</files>
  <action>Run the real smoke test from ROOT with no services started. Do not edit source files in this task unless a smoke failure exposes a defect in Task 1/2 code; if a fix is needed, keep it minimal and re-run the smoke.

Precondition: confirm ports 8090, 3000, and 8080 have no listeners using `ss -ltnH | awk '{print $4}' | grep -E ':(8090|3000|8080)$'`. If a port is occupied, do NOT kill an unknown process; record exactly which port and process (if identifiable) and treat the smoke as blocked for that reason.

Smoke procedure:
1. Start the documented command with `setsid pnpm dev > /tmp/zod-dev-smoke.log 2>&1 &` and capture the PID. Using setsid makes the PID a process-group leader so SIGINT can be delivered to the pnpm wrapper and the dev-local process together.
2. Poll /tmp/zod-dev-smoke.log up to 120s for the `READY` line. If it does not appear, print the full log tail and fail with the last `[pb]`/`[dashboard]`/`[proxy]`/`[scheduler]` line that explains why.
3. Curl `http://127.0.0.1:8080/` and assert both `<h1>Zod Telemetry</h1>` and `data-boards-url="http://127.0.0.1:8080/api/boards"` are present (proves the proxy serves the dashboard and rewrites the hard-coded origin).
4. Curl `http://127.0.0.1:8080/api/boards` and assert `boards.length === 8` and `count === 11` by piping the JSON into `node -e` (the committed seed data produces one row in each of 7 board tabs plus 4 audit-log rows). On mismatch print the tab ids and counts.
5. Curl `http://127.0.0.1:8080/api/stream` with `--max-time 3 -N` (timeout is expected) and assert the output contains `"type":"connected"`, proving the proxy injects the owner header and the dashboard server authorizes the SSE stream.
6. Assert the log contains each of `[pb]`, `[dashboard]`, `[proxy]`, and `[scheduler]`, and that `scheduler boot ok` appears, proving all four supervised components started. Allow ~2s after READY before asserting the scheduler line.
7. Send SIGINT to the whole group: `kill -INT -- -<pid>`. Poll up to 15s for all three ports to have no listeners; require the ports to be free. Check the log tail shows the proxy/dashboard/PocketBase shutdown or that the parent recorded a clean shutdown. A wrapper exit status of 130 is acceptable because SIGINT is delivered to pnpm; the authoritative assertions are freed ports, no remaining dev-local process holding the three ports, and the shutdown log.
8. If the smoke cannot run for an environmental reason (for example PB credentials in .env do not match the existing pb_data), do NOT delete pb_data or edit .env. Document the exact failing step and its log line, then run the closest safe checks: `node --check` on all three scripts, `pnpm verify:local` (already run in Task 2), and `node scripts/dev-local.mjs --help`, and state clearly what remains unverified.

Record in the task summary: the READY line, the /api/boards tab/row counts, the SSE frame observed, the SIGINT cleanup result for each port, and any skipped check with its reason.</action>
  <verify>
    <automated>set -euo pipefail; sport() { ss -ltnH | awk '{print $4}' | grep -E ':(8090|3000|8080)$' || true; }; test -z "$(sport)"; LOG=/tmp/zod-dev-smoke.log; rm -f "$LOG"; setsid pnpm dev >"$LOG" 2>&1 &amp; DEV_PID=$!; for i in $(seq 1 240); do if grep -q 'READY' "$LOG"; then break; fi; sleep 0.5; done; grep -q 'READY' "$LOG"; sleep 2; curl -fsS http://127.0.0.1:8080/ | grep -q '&lt;h1&gt;Zod Telemetry&lt;/h1&gt;'; curl -fsS http://127.0.0.1:8080/ | grep -q 'data-boards-url="http://127.0.0.1:8080/api/boards"'; curl -fsS http://127.0.0.1:8080/api/boards | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const j=JSON.parse(s);if(j.boards.length!==8||j.count!==11){console.error('boards mismatch',j.boards.map(b=>b.tab+':'+b.count),j.count);process.exit(1)}console.log('boards ok: 8 tabs / 11 rows')})"; (curl -sN --max-time 3 http://127.0.0.1:8080/api/stream || true) | grep -q '"type":"connected"'; grep -q '\[pb\]' "$LOG"; grep -q '\[dashboard\]' "$LOG"; grep -q '\[proxy\]' "$LOG"; grep -q '\[scheduler\]' "$LOG"; grep -q 'scheduler boot ok' "$LOG"; kill -INT -- -"$DEV_PID" || true; for i in $(seq 1 60); do if test -z "$(sport)"; then break; fi; sleep 0.25; done; test -z "$(sport)"; wait "$DEV_PID" || true; echo 'smoke ok: READY, 8 tabs/11 rows, SSE connected, SIGINT freed 8090/3000/8080'</automated>
  </verify>
  <done>The stack starts with `pnpm dev`, prints READY, serves the rewritten dashboard on 8080, returns 8 tabs and 11 rows from /api/boards, streams an SSE connected frame through the proxy, logs all four component prefixes, and SIGINT leaves ports 8090/3000/8080 free; otherwise the blocking environmental reason is documented with the exact failing step.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| local browser → proxy on 8080 | Untrusted local HTTP requests cross here; the proxy injects the owner identity header before forwarding to the dashboard server. |
| proxy → dashboard server on 3000 | The proxy must be the only component allowed to synthesize `cf-access-authenticated-user-email`; loopback binding limits exposure. |
| .env → child processes | Real PocketBase credentials and tokens exist locally; no script may print or commit them. |
| dev-local → child processes | Command arguments and environment are assembled by the scripts; no shell interpolation is allowed. |

## STRIDE Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation Plan |
|-----------|----------|-----------|----------|-------------|-----------------|
| T-NEA-01 | Spoofing | scripts/dev-dashboard-proxy.mjs owner header injection | medium | mitigate | Bind only 127.0.0.1:8080 (never 0.0.0.0), document that this harness is loopback-only and must never be exposed publicly, and keep the Cloudflare Zero Trust + dashboard `authorizeStream` gate as the production path. The injected header is derived only from the resolved ACCESS_OWNER_EMAIL, never from a request header. |
| T-NEA-02 | Information disclosure | scripts/dev-local.mjs .env parsing and superuser init | high | mitigate | Read `.env` only for non-secret resolution and for PB_SERVICE_EMAIL/PB_SERVICE_PASSWORD when initializing pb_data; never log values, and log only the error message on failure. Superuser creation uses an argument array so no shell history expansion occurs; docs warn that local process arguments may be visible to the same user. |
| T-NEA-03 | Tampering / command injection | child_process spawn calls | medium | mitigate | All spawns use command + argument arrays with `shell: false`; no user-controlled string is interpolated into a shell command. Only the fixed flags `--no-seed`, `--no-scheduler`, `--soak`, `--help` are accepted; unknown flags exit before any spawn. |
| T-NEA-04 | Denial of service / resource leak | orphaned PocketBase, dashboard, proxy, scheduler processes | medium | mitigate | Detached process groups plus a reentrancy-guarded SIGTERM → wait 5s → SIGKILL shutdown; unexpected child exit triggers the same shutdown with a nonzero exit; startup failures use the same cleanup path. The smoke asserts all three ports are free after SIGINT. |
| T-NEA-SC | Tampering | npm/pnpm dependency installs | high | mitigate | No packages are added; all three scripts use node: built-ins only. No package-legitimacy checkpoint is required, and any incidental dependency addition is a scope violation. |
</threat_model>

<verification>
Run from the repo root, in order:

1. `node --check scripts/dev-local.mjs && node --check scripts/dev-dashboard-proxy.mjs && node --check scripts/verify-local.mjs`
2. `pnpm verify:local` (all gates + local drills; no soak)
3. The Task 3 end-to-end smoke: `pnpm dev` → READY → `/` dashboard + rewritten origin → `/api/boards` 8 tabs/11 rows → SSE `connected` → SIGINT → ports 8090/3000/8080 free.
4. `git diff --stat` confirms only scripts/, docs/local-dev.md, package.json, and this quick-task's planning artifacts changed; `.env`, `pb_data/`, Phase 07 files, `.gsd/`, and `.planning/milestone.lock` are untouched.
5. `git diff package.json` shows only the three added scripts and no dependency changes.

Notes:
- Root `pnpm build` is known broken (discord-router/scheduler TS5055 cycle + orchestrator fixture drift) and must not be fixed or invoked by this task; the dev and verify paths build only `@zod/dashboard-server` and run the existing test suites.
- `pnpm verify:local` runs drills in local mode and does not require the stack to be running; Task 3 is the only step that starts services and must leave them stopped.
- If the full smoke cannot run (for example credentials in `.env` do not match the existing `pb_data`), the executor must document the exact failing step and log line and run the closest safe checks rather than deleting data or editing secrets.
</verification>

<success_criteria>
- `pnpm dev` starts PocketBase 8090, runs the idempotent bootstrap (seeded unless `--no-seed`), builds and starts the dashboard server on 3000, starts the proxy on 8080, starts the scheduler unless `--no-scheduler`, prefixes logs with `[pb]`/`[dashboard]`/`[proxy]`/`[scheduler]`, and prints `READY → http://127.0.0.1:8080`.
- http://127.0.0.1:8080 serves the dashboard with `dash.example.com` rewritten to the local origin; `/api/boards` returns 8 tabs and 11 rows; `/api/stream` yields a `connected` frame through the proxy without manual headers.
- SIGINT/SIGTERM stops all child process groups cleanly and frees 8090, 3000, and 8080; an unexpected child exit shuts everything down with a nonzero exit.
- `pnpm verify:local` runs the dashboard-server build, root tests, dashboard-server tests, db-hot scripts typecheck, every local drill except browser-soak, and `rebuild.sh --dry-run`, prints a PASS/FAIL summary, and exits nonzero on any failure; `--soak` adds the 5-minute browser soak.
- `docs/local-dev.md` documents the quickstart, URL, Ctrl-C, flags, first-run superuser behavior, verify commands, and troubleshooting; README.md remains unchanged because it has no docs/quickstart section.
- No new dependencies; `.env`, `pb_data/`, and the listed pre-existing uncommitted files are untouched; the broken root `pnpm build` is neither fixed nor invoked.
</success_criteria>

<output>
Create `.planning/quick/261020-nea-add-one-command-local-dev-and-verify-scr/261020-nea-SUMMARY.md` when done, including: the exact commands added, the smoke-test evidence (READY line, boards tab/row counts, SSE frame, SIGINT port-free result), any documented skip with its reason, and confirmation that no dependencies, `.env`, `pb_data/`, or pre-existing Phase 07 files were modified.
</output>
