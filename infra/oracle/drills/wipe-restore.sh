#!/usr/bin/env bash
# Wipe-restore drill (D-16; success criterion 2): records written before a
# simulated wipe are readable after restore, via the off-server cold path.
#
# Usage:
#   infra/oracle/drills/wipe-restore.sh --local         # fixture simulation (no cloud accounts)
#   infra/oracle/drills/wipe-restore.sh --live          # real host: requires WIPE_RESTORE_LIVE=1
#
# --local seeds a fixture hot DB (opportunities + agent telemetry) and a
# fixture cold ledger (applies the real infra/turso/schema.sql), snapshots it
# with the real backup.sh, wipes the hot file, restores the latest snapshot,
# reapplies the schema idempotently, proves new writes flow to BOTH stores,
# and prints one named PASS line per count. It also self-tests the MEM-01
# residual guard: an empty restore source aborts with a named error instead
# of booting an empty store silently.
set -euo pipefail

MODE="${1:-}"; LOCAL=0; LIVE=0
[ "$MODE" = "--local" ] && LOCAL=1
[ "$MODE" = "--live" ] && LIVE=1
[ "$LOCAL" -eq 1 ] || [ "$LIVE" -eq 1 ] || { echo "usage: wipe-restore.sh --local|--live" >&2; exit 2; }

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
SCHEMA="$REPO_DIR/infra/turso/schema.sql"
BACKUP_SCRIPT="$REPO_DIR/infra/pocketbase/backup.sh"

# Restore helper shared by both modes. Named-abort contract (MEM-01
# residual): an empty restore source is a hard abort, never a silent empty
# boot — the drill self-tests this path in --local.
restore_latest() { # $1 = backup dir, $2 = destination db path
  local bdir="$1" dest="$2" latest
  latest="$(ls -1 "$bdir"/pb-*.db 2>/dev/null | sort | tail -1 || true)"
  if [ -z "$latest" ]; then
    echo "WIPE-RESTORE-ABORT: empty restore source in $bdir — refusing to boot an empty store" >&2
    return 1
  fi
  cp "$latest" "$dest"
}

count() { sqlite3 "$1" "$2"; }  # $1 = db, $2 = scalar query

if [ "$LOCAL" -eq 1 ]; then
  command -v sqlite3 >/dev/null 2>&1 || { echo "WIPE-RESTORE-ABORT: sqlite3 not installed" >&2; exit 1; }
  WORK="$(mktemp -d)"; trap 'rm -rf "$WORK"' EXIT
  export PB_DATA_DIR="$WORK/pb_data" BACKUP_DIR="$WORK/backups"
  mkdir -p "$PB_DATA_DIR" "$BACKUP_DIR"
  HOT="$PB_DATA_DIR/data.db"; COLD="$WORK/cold-ledger.db"

  sqlite3 "$HOT" "CREATE TABLE opportunities (id INTEGER PRIMARY KEY, fingerprint_hash TEXT NOT NULL);
                  CREATE TABLE agent_telemetry (id INTEGER PRIMARY KEY, slot TEXT NOT NULL);"
  sqlite3 "$HOT" "INSERT INTO opportunities (fingerprint_hash) VALUES ('a'),('b'),('c');
                  INSERT INTO agent_telemetry (slot) VALUES ('s1'),('s2'),('s3'),('s4'),('s5');"
  sqlite3 "$COLD" < "$SCHEMA"
  sqlite3 "$COLD" "INSERT INTO tombstone_ledger (url_hash, fingerprint, terminal_status, source, decided_at)
                   VALUES ('h1','f1','routed','drill','t'),('h2','f2','rejected','drill','t');"

  PRE_OPP="$(count "$HOT" 'SELECT COUNT(*) FROM opportunities;')"
  PRE_TEL="$(count "$HOT" 'SELECT COUNT(*) FROM agent_telemetry;')"
  PRE_LED="$(count "$COLD" 'SELECT COUNT(*) FROM tombstone_ledger;')"

  bash "$BACKUP_SCRIPT" >/dev/null \
    || { echo "WIPE-RESTORE FAIL: backup.sh failed on fixture data" >&2; exit 1; }

  mv "$HOT" "$HOT.wiped"   # the simulated VM wipe
  restore_latest "$BACKUP_DIR" "$HOT" \
    || { echo "WIPE-RESTORE FAIL: restore failed with a backup present" >&2; exit 1; }
  sqlite3 "$COLD" < "$SCHEMA"  # idempotent cold reapply, exactly like rebuild

  # New writes must flow to BOTH stores after restore.
  sqlite3 "$HOT" "INSERT INTO opportunities (fingerprint_hash) VALUES ('d');
                  INSERT INTO agent_telemetry (slot) VALUES ('s6');"
  sqlite3 "$COLD" "INSERT INTO tombstone_ledger (url_hash, fingerprint, terminal_status, source, decided_at)
                   VALUES ('h3','f3','routed','drill','t');"

  POST_OPP="$(count "$HOT" 'SELECT COUNT(*) FROM opportunities;')"
  POST_TEL="$(count "$HOT" 'SELECT COUNT(*) FROM agent_telemetry;')"
  POST_LED="$(count "$COLD" 'SELECT COUNT(*) FROM tombstone_ledger;')"

  [ "$POST_OPP" -eq "$((PRE_OPP + 1))" ] \
    || { echo "WIPE-RESTORE FAIL: opportunity count $POST_OPP != pre-wipe $PRE_OPP + 1 new write" >&2; exit 1; }
  echo "WIPE-RESTORE PASS: opportunity count $POST_OPP == pre-wipe $PRE_OPP + 1 new write"
  [ "$POST_TEL" -eq "$((PRE_TEL + 1))" ] \
    || { echo "WIPE-RESTORE FAIL: telemetry count $POST_TEL != pre-wipe $PRE_TEL + 1 new write" >&2; exit 1; }
  echo "WIPE-RESTORE PASS: telemetry count $POST_TEL == pre-wipe $PRE_TEL + 1 new write"
  [ "$POST_LED" -eq "$((PRE_LED + 1))" ] \
    || { echo "WIPE-RESTORE FAIL: ledger count $POST_LED != pre-wipe $PRE_LED + 1 new write" >&2; exit 1; }
  echo "WIPE-RESTORE PASS: ledger count $POST_LED == pre-wipe $PRE_LED + 1 new write (cold rows unchanged by restore)"

  # Empty-source guard self-test: must abort with the named error.
  mkdir -p "$WORK/empty"
  if restore_latest "$WORK/empty" "$WORK/should-not-exist.db" 2>"$WORK/abort.log"; then
    echo "WIPE-RESTORE FAIL: empty restore source did not abort" >&2; exit 1
  fi
  grep -q 'WIPE-RESTORE-ABORT: empty restore source' "$WORK/abort.log" \
    || { echo "WIPE-RESTORE FAIL: abort fired without the named error" >&2; exit 1; }
  echo "WIPE-RESTORE PASS: empty-source guard aborts with named error (no silent empty boot)"
  exit 0
fi

# --- live mode: real host, real backup dir, real services --------------------
[ "${WIPE_RESTORE_LIVE:-}" = "1" ] \
  || { echo "WIPE-RESTORE-ABORT: live wipe needs WIPE_RESTORE_LIVE=1 (destructive by design)" >&2; exit 1; }
[ -n "${TURSO_DATABASE_URL:-}" ] || { echo "WIPE-RESTORE-ABORT: TURSO_DATABASE_URL unset" >&2; exit 1; }
[ -n "${TURSO_AUTH_TOKEN:-}" ] || { echo "WIPE-RESTORE-ABORT: TURSO_AUTH_TOKEN unset" >&2; exit 1; }

VOL="${VOL_DIR:-/vol/pb_data}"
HOT_DB="$VOL/data.db"
[ -f "$HOT_DB" ] || { echo "WIPE-RESTORE-ABORT: no hot database at $HOT_DB (nothing to prove)" >&2; exit 1; }

PRE_OPP="$(count "$HOT_DB" "SELECT COUNT(*) FROM opportunities;" 2>/dev/null || echo MISSING)"
PRE_TEL="$(count "$HOT_DB" "SELECT COUNT(*) FROM agent_telemetry;" 2>/dev/null || echo MISSING)"
[ "$PRE_OPP" = "MISSING" ] && { echo "WIPE-RESTORE-ABORT: opportunities table missing pre-wipe" >&2; exit 1; }
[ "$PRE_TEL" = "MISSING" ] && { echo "WIPE-RESTORE-ABORT: agent_telemetry table missing pre-wipe" >&2; exit 1; }
PRE_LED="$(cd "$REPO_DIR" && TURSO_DATABASE_URL="$TURSO_DATABASE_URL" TURSO_AUTH_TOKEN="$TURSO_AUTH_TOKEN" \
  node --input-type=module -e "
    import { createClient } from '@libsql/client';
    const db = createClient({ url: process.env.TURSO_DATABASE_URL, authToken: process.env.TURSO_AUTH_TOKEN });
    const r = await db.execute('SELECT COUNT(*) AS n FROM tombstone_ledger');
    console.log(r.rows[0].n);")"

systemctl stop zod-pocketbase
bash "$BACKUP_SCRIPT" || { systemctl start zod-pocketbase; echo "WIPE-RESTORE FAIL: live backup failed" >&2; exit 1; }
mv "$HOT_DB" "$HOT_DB.wiped.$(date +%s)"
restore_latest "${BACKUP_DIR:-/var/backups/zod}" "$HOT_DB" \
  || { echo "WIPE-RESTORE-ABORT: empty restore source after live backup (backup wrote nothing?)" >&2; exit 1; }
[ "$(count "$HOT_DB" 'PRAGMA integrity_check;')" = "ok" ] \
  || { echo "WIPE-RESTORE FAIL: restored database fails integrity_check" >&2; exit 1; }
systemctl start zod-pocketbase
systemctl is-active --quiet zod-pocketbase || { echo "WIPE-RESTORE FAIL: database unit not active after restore" >&2; exit 1; }

POST_OPP="$(count "$HOT_DB" 'SELECT COUNT(*) FROM opportunities;')"
POST_TEL="$(count "$HOT_DB" 'SELECT COUNT(*) FROM agent_telemetry;')"
POST_LED="$(cd "$REPO_DIR" && TURSO_DATABASE_URL="$TURSO_DATABASE_URL" TURSO_AUTH_TOKEN="$TURSO_AUTH_TOKEN" \
  node --input-type=module -e "
    import { createClient } from '@libsql/client';
    const db = createClient({ url: process.env.TURSO_DATABASE_URL, authToken: process.env.TURSO_AUTH_TOKEN });
    const r = await db.execute('SELECT COUNT(*) AS n FROM tombstone_ledger');
    console.log(r.rows[0].n);")"
[ "$POST_OPP" = "$PRE_OPP" ] || { echo "WIPE-RESTORE FAIL: opportunity count $POST_OPP != pre-wipe $PRE_OPP" >&2; exit 1; }
echo "WIPE-RESTORE PASS: opportunity count $POST_OPP == pre-wipe $PRE_OPP"
[ "$POST_TEL" = "$PRE_TEL" ] || { echo "WIPE-RESTORE FAIL: telemetry count $POST_TEL != pre-wipe $PRE_TEL" >&2; exit 1; }
echo "WIPE-RESTORE PASS: telemetry count $POST_TEL == pre-wipe $PRE_TEL"
[ "$POST_LED" = "$PRE_LED" ] || { echo "WIPE-RESTORE FAIL: ledger count $POST_LED != pre-wipe $PRE_LED" >&2; exit 1; }
echo "WIPE-RESTORE PASS: ledger count $POST_LED unchanged across wipe (cold survives the VM)"
