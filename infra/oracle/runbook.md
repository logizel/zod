# Zod Oracle VM runbook — one-command rebuild + closed-network proof (D-26)

> Single source of truth for provisioning the Ampere host, restoring memory,
> and proving criteria 1–4 with scripts instead of checklists. Every step
> below names the exact command; every proof is a file under
> `infra/oracle/drills/`.

## 0. Day-0 owner prerequisites (nothing below works without these)

Check each box before provisioning. Items marked *(manual)* need a human in
a console; everything else is a command in this repo.

- [ ] *(manual)* **Oracle Cloud Ampere A1 VM** (ARM, Ubuntu 22.04+) with an
  attached block volume formatted + mounted at `/vol`, SSH reachable as
  `zod@<host>`. Record the host in `OCI_VM_HOST` (provisioning only).
- [ ] *(manual)* **Turso account + database**: `turso db create zod-cold`,
  then `turso db tokens create zod-cold`. Record as `TURSO_DATABASE_URL`
  (the `libsql://…` URL) and `TURSO_AUTH_TOKEN`. Env-only, never in git.
- [ ] *(manual)* **Cloudflare account + domain**: a tunnel created once
  (`cloudflared tunnel create zod`), its token recorded as
  `CLOUDFLARE_TUNNEL_TOKEN`, a DNS record `<hostname>` routed to the tunnel
  recorded as `DASHBOARD_HOSTNAME`, and the owner login email recorded as
  `ACCESS_OWNER_EMAIL` for the Allow rule below.
- [ ] **PocketBase service account**: `PB_SERVICE_EMAIL` /
  `PB_SERVICE_PASSWORD` (created on first boot via `superuser upsert`;
  stored in `/etc/zod/env`, never in git).
- [ ] **Dead-man provider URLs** (default provider: healthchecks.io-compatible
  ping URLs; UptimeRobot heartbeat URLs are interchangeable, zero code
  change): `WATCHDOG_SCHEDULER_URL`, `WATCHDOG_TUNNEL_URL`.
- [ ] *(optional)* **Off-server backup target**: `PB_BACKUP_REMOTE`
  (`s3://bucket/prefix` via aws CLI, or `rclone remote:path`). Unset =
  local snapshots only (still a passing posture; remote is the bonus).

Record the installed versions after provisioning (D-21):

| Component | Version (fill at provision) |
|-----------|-----------------------------|
| PocketBase server | `v0.40.5` (Option B verdict, 2026-10-15 — see §1; fallback `v0.35.0`) |
| cloudflared | `<paste cloudflared --version output>` |
| Node.js | `>=22` (`node --version`) |

## 1. Version policy — PocketBase server v0.40.5

The 01-04 Task 1 gate resolved **Option B**: server **`v0.40.5`**
(2026-10-08, includes the upstream Go `net/http` denial-of-service fix).
Greenfield upgrade is free (no data/migration cost) and keeps Phase 7 off
the older line; JS SDK 0.28 supports server 0.29+, so drift risk is bounded.
`rebuild.sh` downloads exactly `pocketbase_0.40.5_linux_arm64.zip`, asserts
`uname -m == aarch64` first, and verifies against the release's published
checksums file. **Fallback (no extra round-trip):** missing asset, checksum
failure, or a real SDK-0.28-vs-server-0.40 incompatibility falls back to the
locked `v0.35.x` line (`0.35.0`) with the evidence printed — record any such
fallback in the next SUMMARY as a deviation.

## 2. The one rebuild command (success criterion 1)

On a fresh VM, as `zod` (repo checked out at `/home/zod/zod`):

```bash
# Prove first — zero side effects, exits 0 on any workstation:
infra/oracle/rebuild.sh --dry-run

# Provision for real (needs root for /opt, /vol, /etc/systemd):
sudo infra/oracle/rebuild.sh
```

Live order inside the script: arch gate → checksum-verified ARM64 download
(with locked-line fallback) → `pb_data` restore from the latest
`/var/backups/zod/pb-*.db` (or a loudly-marked fresh init on first
provision — never a silent empty boot) → idempotent Turso schema reapply
(`infra/turso/schema.sql`, `IF NOT EXISTS` throughout) → cloudflared via the
apt `cloudflare-main` repo with auto-update on → unit + backup-timer install
→ all-units-active assertion → outbound tunnel pre-check (egress for QUIC
7844; `cloudflared` falls back to QUIC-over-HTTPS automatically).

## 3. Install-path map (repo → host)

| Repo file | Installed as | Notes |
|-----------|--------------|-------|
| `infra/cloudflared/config.yml` | `/home/zod/.cloudflared/config.yml` (+ `chmod 700`) | Fill `tunnel` UUID + credentials JSON + `DASHBOARD_HOSTNAME` first |
| `infra/cloudflared/cloudflared.service` | `/etc/systemd/system/cloudflared.service` | Canonical name — the watchdog probes `systemctl is-active cloudflared` |
| `infra/cloudflared/scheduler.service` | `/etc/systemd/system/zod-scheduler.service` | Compiled emit at `/home/zod/zod/.../dist`, heartbeats to `/var/lib/zod/heartbeats` |
| `infra/cloudflared/pocketbase.service` | `/etc/systemd/system/zod-pocketbase.service` | `--http=127.0.0.1:8090`, `--dir /vol/pb_data` (loopback-only, block volume) |
| `infra/oracle/cache-buffer.sh` + `.service` | `/opt/zod/cache-buffer.sh` + `zod-cache-buffer.service` | Plan-03 reclaim defense (2.5 GiB wired holder) |
| `infra/pocketbase/backup.sh` | `zod-pb-backup.service` + `.timer` (generated, daily, `Persistent=true`) | Env-plumbed target; `.backup`, never raw copy |
| secrets | `/etc/zod/env` (`chmod 600`) | Every credential from §0; `EnvironmentFile` for scheduler + backup |

## 4. Closed-network posture (success criterion 3)

- **Zero inbound firewall ports.** The Oracle security list allows ingress
  only for established SSH provisioning (removed after), and the tunnel is
  the only ingress path. Prove with `drills/port-scan.sh` (loopback-bind
  assertion — stronger than a port list).
- **Owner-only edge wall (T-1-10).** Cloudflare Zero Trust Access policy on
  the dashboard hostname AND the future stream endpoint: `Allow` action +
  `Include` → `Emails: <ACCESS_OWNER_EMAIL>`, deny-by-default, **zero bypass
  rules** (no `Include Everyone`, no OTP-only rule). Unauthenticated shell +
  stream requests are rejected before render. Prove with
  `drills/edge-reject.sh`.
- **Tunnel identity (T-1-11).** Credentials JSON lives at the path above
  (`0600`, outside the repo); the token travels in env only. **On suspected
  theft:** `cloudflared tunnel delete <uuid> && cloudflared tunnel create
  zod`, route DNS to the new tunnel, replace the JSON, `systemctl restart
  cloudflared`, verify with the edge-reject drill — the old identity dies
  with the deleted tunnel.
- **Bind surface (T-1-12).** The hot database never appears in the tunnel
  ingress table and never binds beyond loopback — asserted at declaration
  (unit file) and at runtime (socket table) by the port-scan drill.

## 5. Drill matrix (criteria 1–4, provable by script)

| Drill | Local (no cloud accounts) | Live (real host) |
|-------|---------------------------|------------------|
| `port-scan.sh --local` | unit-declared loopback bind + route-table check + best-effort `ss` | `port-scan.sh`: loopback bind REQUIRED, no public 8090 |
| `edge-reject.sh --local` | 5 config-lint preconditions → `EDGE-REJECT PASS` | `DASHBOARD_URL=… edge-reject.sh`: shell + stream rejected before render |
| `wipe-restore.sh --local` | fixture wipe → `PASS` lines for opportunity, telemetry, ledger counts + empty-guard | `WIPE_RESTORE_LIVE=1 wipe-restore.sh --live`: real backup/restore, integrity-checked |
| `secrets-scan.sh` | full history + staged (gitleaks, else assembled-pattern fallback) | same (runs anywhere; CI runs it here) |
| `rebuild.sh --dry-run` | all 8 gates reachable, zero side effects | `sudo rebuild.sh`: the one command |

Nightly rhythm on the VM: `zod-pb-backup.timer` snapshots to
`/var/backups/zod` (+ `PB_BACKUP_REMOTE` when set); the watchdog
(`infra/oracle/watchdog.sh` via system cron) pings the dead-man URLs while
scheduler/tunnel heartbeats stay fresh and stays silent otherwise, so the
provider — not self-reported health — raises the alarm.

## 6. Scheduler + reclaim wiring (from plan 01-03, supervised here)

- The single `node-cron` registry owns all poll ticks (`Asia/Kolkata`,
  `noOverlap`, per-job jitter); duration metrics flow to telemetry.
- `SCHEDULER_HEARTBEAT_DIR=/var/lib/zod/heartbeats` is set by the scheduler
  unit, so every tick drops an atomic heartbeat file the watchdog observes.
- The 2.5 GiB wired-cache holder keeps the 22–30% reclaim baseline under
  `zod-cache-buffer.service` (`Restart=always`); VM silence still pages via
  the external watchdog.
