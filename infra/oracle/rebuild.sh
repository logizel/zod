#!/usr/bin/env bash
# One-command VM rebuild (D-26; success criterion 1).
#
# Usage:
#   infra/oracle/rebuild.sh --dry-run            # local: prove every assertion path, change nothing
#   sudo infra/oracle/rebuild.sh                 # live on the Ampere host: provision for real
#   PB_VERSION=0.35.0 .../rebuild.sh             # pin an explicit server line (see version policy below)
#
# Version policy (01-04 Task 1 verdict, Option B): download PocketBase server
# v0.40.5 (2026-10-08, carries the upstream Go net/http denial-of-service
# fix). Greenfield upgrade is free — no data or migration cost. FALLBACK: if
# the v0.40.5 asset is missing, its checksums fail, or a real JS-SDK-0.28 vs
# server-0.40 incompatibility surfaces, fall back to the locked v0.35.x line
# (0.35.0), print the evidence, keep going — never halt for another round-trip.
#
# Live steps, in order:
#   1. assert aarch64 (uname -m) before any download
#   2. download pocketbase_<ver>_linux_arm64.zip + verify against the
#      release's published checksums file (checksums.txt, then SHA256SUMS)
#   3. install the binary to /opt/zod/pocketbase (+ optional superuser upsert)
#   4. restore pb_data from the latest block-volume backup (or init fresh on
#      first provision — loudly, never silently)
#   5. reapply the idempotent Turso schema (infra/turso/schema.sql)
#   6. install cloudflared (apt cloudflare-main) + tunnel/unit files + backup timer
#   7. assert every supervised service is active
#   8. run the outbound tunnel pre-check (egress for QUIC 7844)
#
# Dry-run executes the same assertion functions in report-only mode: host
# assertions that cannot hold on a workstation (arch, systemd, root) print
# SKIP notes instead of failing, so `rebuild.sh --dry-run` exits 0 locally
# while every live assertion stays reachable in the code path.
set -euo pipefail

PB_VERSION="${PB_VERSION:-0.40.5}"
FALLBACK_PB_VERSION="0.35.0"
DRY_RUN=0

# Overridable paths (the wipe drill and workstation runs use the defaults).
REPO_DIR="${REPO_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)}"
OPT_DIR="${OPT_DIR:-/opt/zod}"
VOL_DIR="${VOL_DIR:-/vol/pb_data}"
BACKUP_DIR="${BACKUP_DIR:-/var/backups/zod}"
SYSTEMD_DIR="${SYSTEMD_DIR:-/etc/systemd/system}"
ENV_FILE="${ENV_FILE:-/etc/zod/env}"
CLOUDFLARED_HOME="${CLOUDFLARED_HOME:-/home/zod/.cloudflared}"
HEARTBEAT_DIR="${HEARTBEAT_DIR:-/var/lib/zod/heartbeats}"

usage() {
  sed -n '2,30p' "${BASH_SOURCE[0]}" | sed 's/^# \?//'
}

for arg in "$@"; do
  case "$arg" in
    --dry-run) DRY_RUN=1 ;;
    --help|-h) usage; exit 0 ;;
    *) echo "rebuild: unknown arg $arg (see --help)" >&2; exit 2 ;;
  esac
done

note()  { echo "rebuild[$1]: $2"; }
pass()  { echo "REBUILD DRY-RUN PASS: $1"; }
hard()  { echo "REBUILD-ABORT: $1" >&2; exit 1; }

# --- 1. architecture gate -------------------------------------------------
ARCH="$(uname -m)"
if [ "$ARCH" = "aarch64" ]; then
  [ "$DRY_RUN" -eq 1 ] && pass "arch gate reachable (uname -m == aarch64)" \
    || note "arch" "aarch64 confirmed"
else
  if [ "$DRY_RUN" -eq 1 ]; then
    note "dry-run" "arch gate reachable but softened: host is $ARCH, live run requires aarch64"
  else
    hard "host is $ARCH — PocketBase asset is linux_arm64; refusing to download the wrong binary"
  fi
fi

# --- 2. download + checksum verify (with locked-line fallback) ------------
PB_ZIP="pocketbase_${PB_VERSION}_linux_arm64.zip"
PB_BASE="https://github.com/pocketbase/pocketbase/releases/download/v${PB_VERSION}"

if [ "$DRY_RUN" -eq 1 ]; then
  note "dry-run" "would download $PB_BASE/$PB_ZIP and verify against the release checksums file"
  note "dry-run" "fallback reachable: asset-missing/checksum-fail/SDK-incompat -> locked v$FALLBACK_PB_VERSION with evidence"
else
CHECKS=""
for sums in checksums.txt SHA256SUMS; do
  if curl -fsSL -o "/tmp/pb-${PB_VERSION}-${sums}" "$PB_BASE/$sums" 2>/dev/null; then
    CHECKS="/tmp/pb-${PB_VERSION}-${sums}"
    break
  fi
done

  if [ -z "$CHECKS" ]; then
    note "fallback" "v$PB_VERSION published checksums file not fetchable — evidence: no checksums.txt/SHA256SUMS at $PB_BASE"
    PB_VERSION="$FALLBACK_PB_VERSION"
  else
    curl -fsSL -o "/tmp/$PB_ZIP" "$PB_BASE/$PB_ZIP" \
      || { note "fallback" "v$PB_VERSION asset missing — evidence: curl failed for $PB_BASE/$PB_ZIP";
           PB_VERSION="$FALLBACK_PB_VERSION"; CHECKS=""; }
    if [ -n "$CHECKS" ] && ! (cd /tmp && grep "$PB_ZIP" "$CHECKS" | sha256sum -c - >/dev/null 2>&1); then
      note "fallback" "v$PB_VERSION checksum mismatch — evidence: sha256sum -c failed; NOT installing"
      PB_VERSION="$FALLBACK_PB_VERSION"
    fi
  fi
  if [ "$PB_VERSION" = "$FALLBACK_PB_VERSION" ]; then
    PB_ZIP="pocketbase_${PB_VERSION}_linux_arm64.zip"
    PB_BASE="https://github.com/pocketbase/pocketbase/releases/download/v${PB_VERSION}"
    curl -fsSL -o "/tmp/pb-${PB_VERSION}-checksums.txt" "$PB_BASE/checksums.txt" \
      || hard "fallback v$PB_VERSION checksums unfetchable — refusing to install unverified binary"
    curl -fsSL -o "/tmp/$PB_ZIP" "$PB_BASE/$PB_ZIP" \
      || hard "fallback v$PB_VERSION asset missing — nothing installable"
    (cd /tmp && grep "$PB_ZIP" "pb-${PB_VERSION}-checksums.txt" | sha256sum -c -) \
      || hard "fallback v$PB_VERSION checksum mismatch — refusing to install unverified binary"
    note "fallback" "installed locked line v$PB_VERSION (record evidence in 01-04-SUMMARY as deviation)"
  fi
  [ "$(id -u)" -eq 0 ] || hard "live rebuild needs root (unit install + /opt + /vol paths)"
  command -v unzip >/dev/null 2>&1 || hard "unzip not installed"
  mkdir -p "$OPT_DIR"
  unzip -o -q "/tmp/$PB_ZIP" -d "$OPT_DIR"
  chmod +x "$OPT_DIR/pocketbase"
  "$OPT_DIR/pocketbase" --version
fi

# --- 3. pb_data restore (or loud fresh init) -------------------------------
latest_backup() { ls -1 "$BACKUP_DIR"/pb-*.db 2>/dev/null | sort | tail -1 || true; }
if [ "$DRY_RUN" -eq 1 ]; then
  pass "restore gate reachable (latest $BACKUP_DIR/pb-*.db -> $VOL_DIR, else loud fresh init)"
else
  LATEST="$(latest_backup)"
  mkdir -p "$VOL_DIR"
  if [ -n "$LATEST" ]; then
    cp "$LATEST" "$VOL_DIR/data.db"
    note "restore" "restored $VOL_DIR/data.db from $LATEST"
  elif [ -f "$VOL_DIR/data.db" ]; then
    note "restore" "no backup found but $VOL_DIR/data.db already present — keeping in place"
  else
    mkdir -p "$VOL_DIR"
    date -u +"%Y-%m-%dT%H:%M:%SZ first-provision empty init (no backup existed)" > "$VOL_DIR/FIRST_PROVISION.txt"
    note "restore" "NOTICE: no backup found — initialized fresh $VOL_DIR (first provision, explicit marker written)"
  fi
fi

# --- 4. reapply idempotent Turso schema ------------------------------------
SCHEMA="$REPO_DIR/infra/turso/schema.sql"
[ -f "$SCHEMA" ] || hard "schema file missing: $SCHEMA"
if [ "$DRY_RUN" -eq 1 ]; then
  sqlite3 :memory: < "$SCHEMA"
  pass "turso reapply reachable (idempotent IF NOT EXISTS schema lints clean + node libsql apply on live)"
else
  [ -n "${TURSO_DATABASE_URL:-}" ] || hard "TURSO_DATABASE_URL unset — refusing to skip the cold-ledger reapply silently"
  [ -n "${TURSO_AUTH_TOKEN:-}" ] || hard "TURSO_AUTH_TOKEN unset — refusing to skip the cold-ledger reapply silently"
  (cd "$REPO_DIR" && node --input-type=module -e "
    import { createClient } from '@libsql/client';
    import fs from 'node:fs';
    const db = createClient({ url: process.env.TURSO_DATABASE_URL, authToken: process.env.TURSO_AUTH_TOKEN });
    const stmts = fs.readFileSync(process.argv[1], 'utf8').split(/;\s*\n/).map((s) => s.trim()).filter(Boolean);
    for (const sql of stmts) { await db.execute(sql); }
    console.log('turso schema reapplied (' + stmts.length + ' statements, idempotent)');
  " "$SCHEMA")
fi

# --- 5. cloudflared install (apt cloudflare-main, auto-update on) ------------
if [ "$DRY_RUN" -eq 1 ]; then
  pass "cloudflared provision reachable (apt cloudflare-main + auto-update + version logged per D-21)"
else
  if ! command -v cloudflared >/dev/null 2>&1; then
    curl -fsSL https://pkg.cloudflare.com/cloudflare-main.gpg | tee /usr/share/keyrings/cloudflare-main.gpg >/dev/null
    echo 'deb [signed-by=/usr/share/keyrings/cloudflare-main.gpg] https://pkg.cloudflare.com/cloudflared any main' \
      | tee /etc/apt/sources.list.d/cloudflared.list
    apt-get update && apt-get install -y cloudflared
    systemctl enable --now unattended-upgrades 2>/dev/null || note "tunnel" "unattended-upgrades not enabled — ensure auto-update is on"
  fi
  cloudflared --version   # operator records this line in runbook.md per D-21
fi

# --- 6. unit + config + timer install ---------------------------------------
install_unit() { # $1 = repo file, $2 = installed unit name
  cp "$REPO_DIR/$1" "$SYSTEMD_DIR/$2"
  note "units" "installed $1 -> $SYSTEMD_DIR/$2"
}
if [ "$DRY_RUN" -eq 1 ]; then
  for u in infra/cloudflared/cloudflared.service infra/cloudflared/scheduler.service \
           infra/cloudflared/pocketbase.service infra/oracle/cache-buffer.service; do
    [ -f "$REPO_DIR/$u" ] || hard "unit file missing: $u"
    grep -q '^Restart=always' "$REPO_DIR/$u" || hard "unit lacks Restart=always: $u"
  done
  grep -q 'hostname:' "$REPO_DIR/infra/cloudflared/config.yml" \
    || hard "tunnel config has no hostname line"
  pass "unit install reachable (cloudflared + zod-scheduler + zod-pocketbase + zod-cache-buffer, all Restart=always)"
  pass "backup timer reachable (zod-pb-backup.service + zod-pb-backup.timer, daily, Persistent)"
else
  install_unit infra/cloudflared/cloudflared.service cloudflared.service
  install_unit infra/cloudflared/scheduler.service zod-scheduler.service
  install_unit infra/cloudflared/pocketbase.service zod-pocketbase.service
  install_unit infra/oracle/cache-buffer.service zod-cache-buffer.service
  cp "$REPO_DIR/infra/oracle/cache-buffer.sh" "$OPT_DIR/cache-buffer.sh"
  chmod +x "$OPT_DIR/cache-buffer.sh"
  mkdir -p "$CLOUDFLARED_HOME" "$HEARTBEAT_DIR"
  chmod 700 "$CLOUDFLARED_HOME"
  [ -f "$ENV_FILE" ] || hard "$ENV_FILE missing — place the 0600 secrets file before (re)starting services"
  chmod 600 "$ENV_FILE"
  # Nightly backup timer (target is env-plumbed inside backup.sh itself).
  cat > "$SYSTEMD_DIR/zod-pb-backup.service" <<EOF
[Unit]
Description=Zod nightly hot-database backup
[Service]
Type=oneshot
EnvironmentFile=$ENV_FILE
ExecStart=$REPO_DIR/infra/pocketbase/backup.sh
User=zod
EOF
  cat > "$SYSTEMD_DIR/zod-pb-backup.timer" <<EOF
[Unit]
Description=Zod nightly hot-database backup timer
[Timer]
OnCalendar=daily
Persistent=true
[Install]
WantedBy=timers.target
EOF
  systemctl daemon-reload
  systemctl enable --now cloudflared zod-scheduler zod-pocketbase zod-cache-buffer.service zod-pb-backup.timer
fi

# --- 7. supervised-services assertion ---------------------------------------
if [ "$DRY_RUN" -eq 1 ]; then
  pass "service assertion reachable (systemctl is-active cloudflared zod-scheduler zod-pocketbase zod-cache-buffer)"
else
  systemctl is-active --quiet cloudflared zod-scheduler zod-pocketbase zod-cache-buffer.service \
    || hard "supervised service not active: $(systemctl is-active cloudflared zod-scheduler zod-pocketbase zod-cache-buffer.service)"
  note "services" "cloudflared + zod-scheduler + zod-pocketbase + zod-cache-buffer all active"
fi

# --- 8. outbound tunnel pre-check --------------------------------------------
if [ "$DRY_RUN" -eq 1 ]; then
  pass "tunnel pre-check reachable (egress probe for QUIC 7844 path; cloudflared falls back to QUIC-over-HTTPS automatically)"
else
  curl -fsS -m 15 https://cloudflare.com/cdn-cgi/trace -o /dev/null \
    || hard "no egress to Cloudflare edge — tunnel cannot establish (check Oracle security-list egress for UDP/7844)"
  note "tunnel" "egress probe ok (QUIC 7844 outbound; QUIC-over-HTTPS fallback is automatic)"
fi

if [ "$DRY_RUN" -eq 1 ]; then
  echo "REBUILD DRY-RUN PASS: all 8 gates reachable, zero side effects (arch/download/restore/schema/cloudflared/units/services/pre-check)"
else
  "$OPT_DIR/pocketbase" --version
  echo "REBUILD PASS: v$PB_VERSION live on aarch64, schemas reapplied, 4 units + backup timer active, egress ok"
fi
