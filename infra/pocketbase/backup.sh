#!/usr/bin/env bash
# Nightly hot-database backup (D-10).
#
# Takes a CONSISTENT snapshot of the live SQLite-WAL database with the
# `sqlite3 .backup` command — never a raw `cp` of data.db, which can copy a
# torn WAL frame and restore corrupt. Runs on the VM from a systemd timer
# installed by infra/oracle/rebuild.sh; every path is env-plumbed so the
# wipe-restore drill can run the same code against fixtures.
#
# Env:
#   PB_DATA_DIR       hot data dir (default /vol/pb_data)
#   BACKUP_DIR        local backup prefix (default /var/backups/zod)
#   BACKUP_KEEP_DAYS  local retention (default 7)
#   PB_BACKUP_REMOTE  optional off-server target: s3://bucket/prefix (via aws
#                     CLI) or rclone remote:path. When set but no uploader is
#                     installed, the local backup still succeeds with a warning
#                     (local snapshot is the guarantee; remote is the bonus).
set -euo pipefail

PB_DATA_DIR="${PB_DATA_DIR:-/vol/pb_data}"
BACKUP_DIR="${BACKUP_DIR:-/var/backups/zod}"
BACKUP_KEEP_DAYS="${BACKUP_KEEP_DAYS:-7}"
PB_BACKUP_REMOTE="${PB_BACKUP_REMOTE:-}"

SRC="$PB_DATA_DIR/data.db"
STAMP="$(date +%F)"
DEST="$BACKUP_DIR/pb-$STAMP.db"

command -v sqlite3 >/dev/null 2>&1 || { echo "BACKUP-ABORT: sqlite3 not installed" >&2; exit 1; }
[ -f "$SRC" ] || { echo "BACKUP-ABORT: source missing: $SRC" >&2; exit 1; }
[ -s "$SRC" ] || { echo "BACKUP-ABORT: source empty: $SRC" >&2; exit 1; }

mkdir -p "$BACKUP_DIR"
TMP="$DEST.tmp.$$"
trap 'rm -f "$TMP"' EXIT
sqlite3 "$SRC" ".backup main '$TMP'"
mv -f "$TMP" "$DEST"
trap - EXIT

# Retention: prune snapshots older than the keep window (never the newest —
# -mtime +N only matches files strictly older than N days).
find "$BACKUP_DIR" -maxdepth 1 -name 'pb-*.db' -mtime +"$BACKUP_KEEP_DAYS" -delete

# Optional off-server copy (object storage target is agent's discretion,
# recorded in 01-04-SUMMARY; any S3-compatible endpoint works unchanged).
if [ -n "$PB_BACKUP_REMOTE" ]; then
  if command -v aws >/dev/null 2>&1; then
    aws s3 cp "$DEST" "$PB_BACKUP_REMOTE/pb-$STAMP.db"
  elif command -v rclone >/dev/null 2>&1; then
    rclone copyto "$DEST" "$PB_BACKUP_REMOTE/pb-$STAMP.db"
  else
    echo "BACKUP-WARN: PB_BACKUP_REMOTE set but neither aws nor rclone installed — local snapshot kept" >&2
  fi
fi

echo "BACKUP PASS: $DEST ($(stat -c%s "$DEST") bytes, retained $(find "$BACKUP_DIR" -maxdepth 1 -name 'pb-*.db' | wc -l) snapshots)"
