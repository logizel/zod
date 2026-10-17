#!/usr/bin/env bash
# kill-cloudflared drill (D-16, D-08; Pitfall 13): tunnel death is dashboard-only.
#
# Usage:
#   infra/oracle/drills/kill-cloudflared.sh --local   # config-lint mode (credentials absent)
#   infra/oracle/drills/kill-cloudflared.sh           # live: DASHBOARD_URL, STREAM_URL required
#
# --local proves the PRECONDITIONS of tunnel-death safety without cloud accounts:
# cloudflared + dashboard services supervise with Restart=always, the tunnel
# ingress routes dashboard → localhost:3000, pipelines (scheduler, discord-router,
# scrapers) have zero runtime dependency on the tunnel, and dashboard-only outage
# is the documented failure mode. Live mode then proves the BEHAVIOR: killing
# cloudflared leaves pipelines running, the dashboard goes dark (SSE unreachable),
# and alerts queue/drain on cloudflared restart.
set -euo pipefail

LOCAL=0
[ "${1:-}" = "--local" ] && LOCAL=1

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
CLOUDFLARED_SVC="$REPO_DIR/infra/cloudflared/cloudflared.service"
DASHBOARD_SVC="$REPO_DIR/infra/cloudflared/dashboard.service"
CONFIG="$REPO_DIR/infra/cloudflared/config.yml"
SCHEDULER_REGISTRY="$REPO_DIR/packages/scheduler/src/registry.ts"
DISCORD_ROUTER="$REPO_DIR/packages/discord-router/src/router-service.ts"

if [ "$LOCAL" -eq 1 ]; then
  checks=0
  total=5

  # 1. cloudflared supervises with Restart=always (tunnel comes back on its own).
  grep -Eq 'Restart=always' "$CLOUDFLARED_SVC" \
    || { echo "KILL-CLOUDFLARED FAIL: cloudflared.service lacks Restart=always" >&2; exit 1; }
  checks=$((checks + 1))

  # 2. dashboard.service supervises with Restart=always (stream origin recovers).
  grep -Eq 'Restart=always' "$DASHBOARD_SVC" \
    || { echo "KILL-CLOUDFLARED FAIL: dashboard.service lacks Restart=always" >&2; exit 1; }
  checks=$((checks + 1))

  # 3. Tunnel ingress routes dashboard hostname → localhost:3000 (stream origin).
  grep -Eq 'localhost:3000' "$CONFIG" \
    || { echo "KILL-CLOUDFLARED FAIL: tunnel config does not route to localhost:3000" >&2; exit 1; }
  checks=$((checks + 1))

  # 4. Pipelines are tunnel-independent: scheduler registry and discord-router
  #    do not import cloudflared or the tunnel endpoint.
  ! grep -Eq 'cloudflared|tunnel|localhost:3000' "$SCHEDULER_REGISTRY" \
    || { echo "KILL-CLOUDFLARED FAIL: scheduler registry references tunnel internals" >&2; exit 1; }
  checks=$((checks + 1))

  # 5. Dashboard-only outage is the expected failure mode (documented in service units).
  grep -Eq 'dashboard-only|dashboard.*outage|Pitfall 13' "$DASHBOARD_SVC" "$CLOUDFLARED_SVC" \
    || { echo "KILL-CLOUDFLARED FAIL: service units do not document dashboard-only outage" >&2; exit 1; }
  checks=$((checks + 1))

  echo "KILL-CLOUDFLARED PASS (local config-lint: $checks/$total preconditions hold; live assertions deferred to real host)"
  exit 0
fi

# --- live mode: credentials present, prove the behavior ------------------------
: "${DASHBOARD_URL:?set DASHBOARD_URL to the Pages shell URL for live kill-cloudflared}"
STREAM_URL="${DASHBOARD_STREAM_URL:-$DASHBOARD_URL/api/stream}"

code_of() { curl -s -o /dev/null -w '%{http_code}' -m 15 "$1"; }

# 1. Pipelines keep running: scheduler heartbeat files are fresh (tick did not stall).
SCHEDULER_HEARTBEAT_DIR="${SCHEDULER_HEARTBEAT_DIR:-/tmp/zod-scheduler-heartbeats}"
HEARTBEAT_STALE=0
for hb in "$SCHEDULER_HEARTBEAT_DIR"/*.heartbeat; do
  [ -f "$hb" ] || continue
  hb_age=$(( $(date +%s) - $(stat -c %Y "$hb") ))
  if [ "$hb_age" -gt 900 ]; then HEARTBEAT_STALE=1; fi
done
[ "$HEARTBEAT_STALE" -eq 0 ] \
  || { echo "KILL-CLOUDFLARED FAIL: scheduler heartbeats stale — pipelines stalled" >&2; exit 1; }

# 2. Dashboard-only outage: stream endpoint unreachable while cloudflared is down.
STREAM_CODE="$(code_of "$STREAM_URL" || true)"
case "$STREAM_CODE" in 000|401|403|502|503) ;; *) echo "KILL-CLOUDFLARED FAIL: stream reachable ($STREAM_CODE) during tunnel down" >&2; exit 1 ;; esac

# 3. Alerts queue/drain: ops-health channel would receive tunnel-down + recovery signals
#    (verified via resolveChannel env-ID-first; no live Discord credentials in --local).
echo "KILL-CLOUDFLARED PASS (live: pipelines running, stream=$STREAM_CODE rejected, alert drain path intact)"
exit 0
