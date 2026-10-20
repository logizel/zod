# Local development

Two commands replace the manual local-stack runbook: `pnpm dev` starts the whole
stack, and `pnpm verify:local` runs every local gate and drill.

## Prerequisites

- Node.js 22 or newer
- pnpm 10
- PocketBase 0.40.x on `PATH`
- `.env` at the repo root, copied from `.env.example` and filled in:

  ```bash
  cp .env.example .env
  chmod 600 .env
  ```

  `PB_SERVICE_EMAIL` and `PB_SERVICE_PASSWORD` must point at the PocketBase the
  stack will use. `ACCESS_OWNER_EMAIL` is optional locally; when it is unset or
  empty, `pnpm dev` uses `owner@example.com` for both the dashboard server and
  the local proxy.

## Quickstart

```bash
pnpm dev
```

Open <http://127.0.0.1:8080>. The command prints `READY → http://127.0.0.1:8080`
only after PocketBase, the dashboard server, and the proxy all answer.

Press **Ctrl-C** to stop PocketBase, the dashboard server, the proxy, and the
scheduler. The shutdown path signals each child process group (SIGTERM, then
SIGKILL after 5 seconds) so no service is left holding a port.

## What starts

| Component | Loopback address | Notes |
|-----------|------------------|-------|
| PocketBase | `127.0.0.1:8090` | `pocketbase serve --http 127.0.0.1:8090 --dir ./pb_data` |
| Bootstrap | — | `pnpm exec tsx packages/db-hot/scripts/bootstrap-pb.ts --seed` (idempotent schema + dev seed) |
| Dashboard server | `127.0.0.1:3000` | Built first with `pnpm --filter @zod/dashboard-server build`, then `node apps/dashboard-server/dist/index.js` |
| Dashboard proxy | `127.0.0.1:8080` | Serves `apps/dashboard/index.html` with `https://dash.example.com` rewritten to the local origin; forwards `/api/*` and injects the owner identity header |
| Scheduler | — | `pnpm dev:scheduler` |

All logs are prefixed with `[pb]`, `[dashboard]`, `[proxy]`, or `[scheduler]`.

## First run vs. existing data

- **No `pb_data/data.db`:** the superuser is created from `PB_SERVICE_EMAIL` and
  `PB_SERVICE_PASSWORD` before PocketBase starts. Both must be present in the
  process environment or `.env`.
- **Existing `pb_data/data.db`:** the superuser is never created or modified.
  The credentials in `.env` must already match that data directory. A mismatch
  surfaces at bootstrap; fix the credentials instead of deleting `pb_data`.

## Flags

```bash
pnpm dev --no-seed        # apply the schema but skip dev seed rows
pnpm dev --no-scheduler   # start everything except the scheduler
pnpm dev --help           # commands, ports, flags, and the local URL
```

Unknown flags exit 2 before anything starts.

## Verification

```bash
pnpm verify:local         # every gate and local drill, no browser soak
pnpm verify:local --soak  # also run the 5-minute local browser soak
```

The runner executes these sequentially, prints a `[n/total]` banner before each
step, and always ends with a PASS/FAIL summary (`N passed, M failed`; exit 1 on
any failure):

1. Build `@zod/dashboard-server`
2. Root test suite (`pnpm test`)
3. `@zod/dashboard-server` test suite
4. `@zod/db-hot` scripts typecheck
5. Every `infra/oracle/drills/*.sh` except `browser-soak.sh`, in `--local` mode
6. `infra/oracle/rebuild.sh --dry-run`
7. With `--soak` only: `infra/oracle/drills/browser-soak.sh --local`

`pnpm verify:local` does not require the dev stack to be running.

## Troubleshooting

- **Port already in use:** `pnpm dev` checks `8090`, `3000`, and `8080` before
  starting anything and names the busy port. Stop the process using it, then
  re-run.
- **Missing `.env`:** run `cp .env.example .env` and fill in the required
  credentials.
- **Bootstrap authentication failure against an existing `pb_data`:** the
  credentials in `.env` no longer match the data directory. Correct the
  credentials — do not delete or reinitialize `pb_data`.
- **Only the dashboard server is built:** the root `pnpm build` is a known
  pre-existing failure (discord-router/scheduler project cycle plus fixture
  drift). The dev and verify paths intentionally build only
  `@zod/dashboard-server` and run the existing test suites.

## Security

This is a loopback-only local harness. The proxy binds `127.0.0.1:8080` and
injects `cf-access-authenticated-user-email` from the resolved owner identity;
it must never be exposed publicly or bound to `0.0.0.0`. Production remains the
Cloudflare Tunnel + Zero Trust path with the application-layer `authorizeStream`
gate.

PocketBase superuser creation passes the email and password as process
arguments, so they may briefly be visible to other processes owned by the same
user on the local machine. The scripts themselves never print or log
credential values.
