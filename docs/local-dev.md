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

- Turso cold ledger credentials (`TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN`).
  Apply the idempotent schema once per database:

  ```bash
  pnpm db:cold:apply
  ```

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

## Dashboard pages

The dashboard is a true multi-page app served by the dashboard server: one
concern per page, a shared sidebar/header, vanilla HTML/CSS/JS, no build step.

| Route | Page | Refresh |
|-------|------|---------|
| `/` | Overview — stage stats, pipeline kanban, live agent slots | SSE (`/api/stream`) |
| `/flow` | Pipeline Flow — the candidate kanban | poll |
| `/glass` | Machine Glass — every tool call, filterable, with a per-candidate trace drawer | SSE |
| `/pools` | Pool Health — provider × model buckets | poll |
| `/boards` | Boards — 8 tabs of admitted opportunities | poll |
| `/audit` | Audit & Rejection — verdicts, tombstones, rejections | poll |
| `/sources` | Sources — per-adapter health | poll |
| `/system` | System — runtime, SSE, GC, scheduler jobs | poll |

Read-only by construction: every route is `GET`/`HEAD`, there is no mutation
endpoint, and the pipeline processes (not the dashboard) own all writes.

### Machine glass events

`machine_events` (PocketBase) is the append-only machinery log behind the
Glass page. One row per machine operation — scheduler tick, dedup verdict,
fetch, sanitize, LLM attempt, 429 baton-pass, orchestrator verdict, tombstone,
Discord post, GC summary — with the agent, pipeline, tool, provider/model,
step, status, duration, and URL.

- Retention: 24h, cleared by the midnight GC like `agent_telemetry`.
- Never seeded. The dev bootstrap deliberately writes no `machine_events`
  rows, so the feed only ever shows real pipeline activity. Seed rows for the
  other collections stay available for the boards/audit pages.
- Writers are best-effort: a failed telemetry write never fails the pipeline
  step it observes.

### Discord announcement router

The bot reads every configured source announcement channel and reposts
on-topic messages into the existing topic channels. There is no audit step:
the original text, link, flyer, and `from <source server>` attribution are
forwarded, and a message with no link or flyer is still posted when it is
on-topic.

Flow:

1. `gateway-relay-poll` (bot, every 5m + 60s jitter) extracts `content`,
   embeds, link buttons, attachments, and images into `discord_inbox`
   (`status=pending`). Message IDs and normalized external links dedupe
   capture across sources.
2. `discord-triage` (scheduler, every 5m + 30s jitter) applies the chatter
   filter and weighted keyword classifier, then calls the shared `LlmRouter`
   only for ambiguous rows. It maps the verdict to a code-owned target
   channel and sets `status=classified`.
3. The next bot tick posts classified rows, re-uploads flyers to avoid
   expiring CDN URLs, and records `posted_message_id` /
   `status=posted`.

On first run for a source channel (no cursor row yet), the bot initializes
the cursor at the newest existing message and does **not** replay channel
history. Capture starts with the next new announcement. To re-capture recent
history deliberately, delete the `relay-cursor:<channelId>` row from
`agent_telemetry` and send a new announcement.

Relevant env:

```dotenv
DISCORD_RELAY_SOURCE_CHANNEL_ID=
DISCORD_RELAY_SOURCE_CHANNEL_ID_1=
DISCORD_RELAY_SOURCE_CHANNEL_ID_2=
DISCORD_RELAY_SOURCE_CHANNEL_ID_3=
DISCORD_RELAY_MIRROR_RAW=false   # optional debug copy to #raw-incoming-feeds
```

Applying `Manage Webhooks` in the source guilds lets the bot resolve the
original server/channel name from the follower webhook. Without it, posts
fall back to `from external server`; capture and reposting still work.

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
