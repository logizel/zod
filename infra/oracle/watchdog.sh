#!/usr/bin/env bash
# External silence watchdog (D-19, D-25; T-1-08, T-1-09).
#
# Usage: watchdog.sh scheduler|tunnel
#
# Dead-man-switch semantics: on a FRESH channel the script pings the
# env-plumbed URL (success ping resets the provider's silence timer); on a
# STALE or missing channel it exits non-zero WITHOUT pinging, so the provider
# fires the silence alert. The watchdog never trusts a self-reported "healthy"
# line — heartbeats carry per-tick {job, at, durationMs} through the redacting
# logger shape with no secret fields, and silence (not content) is the signal.
#
# Provider swappable without code changes: every provider detail lives in env.
#   WATCHDOG_SCHEDULER_URL / WATCHDOG_TUNNEL_URL — dead-man ping URLs
#   (default provider recorded in 01-03-SUMMARY: healthchecks.io-compatible
#   ping URLs; UptimeRobot heartbeat URLs are interchangeable)
#   HEARTBEAT_DIR — where scheduler ticks write *.heartbeat (default below)
#   WATCHDOG_SCHEDULER_MAX_AGE — staleness seconds (default 1800: covers the
#   20-minute stub cadence plus jitter)
#
# Scheduler heartbeats are written by scheduler ticks themselves (registry
# heartbeatDir, default SCHEDULER_HEARTBEAT_DIR) — never by a separate
# scheduler. Tunnel liveness prefers a tunnel.heartbeat file when the
# plan-04 cloudflared supervision writes one, else falls back to the local
# systemd state of the cloudflared unit.
set -euo pipefail

MODE="${1:?usage: watchdog.sh scheduler|tunnel}"
HEARTBEAT_DIR="${HEARTBEAT_DIR:-/var/lib/zod/heartbeats}"

fresh_file() {
  # $1 = path, $2 = max age seconds. True iff the file exists and its mtime
  # is within the window.
  local path="$1" max_age="$2"
  [ -f "$path" ] || return 1
  local mtime now
  mtime="$(stat -c %Y "$path")"
  now="$(date +%s)"
  [ "$((now - mtime))" -le "$max_age" ]
}

ping_url() {
  # $1 = dead-man URL. Ping resets the silence timer; failure to reach the
  # provider is itself suspicious — exit non-zero so cron/systemd surfaces it.
  curl -fsS -m 10 --retry 2 -o /dev/null "$1"
}

case "$MODE" in
  scheduler)
    : "${WATCHDOG_SCHEDULER_URL:?set WATCHDOG_SCHEDULER_URL to the dead-man ping URL}"
    MAX_AGE="${WATCHDOG_SCHEDULER_MAX_AGE:-1800}"
    fresh=0
    if [ -d "$HEARTBEAT_DIR" ]; then
      while IFS= read -r hb; do
        if fresh_file "$hb" "$MAX_AGE"; then
          fresh=1
          break
        fi
      done < <(find "$HEARTBEAT_DIR" -maxdepth 1 -name '*.heartbeat' -print 2>/dev/null)
    fi
    if [ "$fresh" -eq 1 ]; then
      ping_url "$WATCHDOG_SCHEDULER_URL"
      echo "watchdog: scheduler heartbeats fresh — pinged dead-man URL" >&2
    else
      echo "watchdog: STALE — no scheduler heartbeat within ${MAX_AGE}s (not pinging; provider will alert)" >&2
      exit 3
    fi
    ;;
  tunnel)
    : "${WATCHDOG_TUNNEL_URL:?set WATCHDOG_TUNNEL_URL to the dead-man ping URL}"
    if fresh_file "$HEARTBEAT_DIR/tunnel.heartbeat" 300; then
      ping_url "$WATCHDOG_TUNNEL_URL"
      echo "watchdog: tunnel heartbeat fresh — pinged dead-man URL" >&2
    elif command -v systemctl >/dev/null 2>&1 && systemctl is-active --quiet cloudflared; then
      ping_url "$WATCHDOG_TUNNEL_URL"
      echo "watchdog: cloudflared unit active — pinged dead-man URL" >&2
    else
      echo "watchdog: STALE — tunnel heartbeat missing and cloudflared unit not active (not pinging; provider will alert)" >&2
      exit 3
    fi
    ;;
  *)
    echo "usage: watchdog.sh scheduler|tunnel" >&2
    exit 2
    ;;
esac
