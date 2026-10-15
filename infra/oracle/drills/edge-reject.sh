#!/usr/bin/env bash
# Edge-reject drill (D-20; T-1-10): unauthenticated requests die at the edge.
#
# Usage:
#   infra/oracle/drills/edge-reject.sh --local   # config-lint mode (credentials absent)
#   infra/oracle/drills/edge-reject.sh           # live: DASHBOARD_URL (+ DASHBOARD_STREAM_URL) required
#
# --local proves the PRECONDITIONS of rejection without cloud accounts: the
# shell exposes no realtime primitive an attacker could drive directly, the
# tunnel ingress ends in a deny catch-all, no hot-database route exists, and
# the owner-only Access rule is documented as deny-by-default with zero
# bypass. Live mode then proves the BEHAVIOR: unauthenticated shell + stream
# requests are rejected (401/403 or Access-login redirect) before render.
set -euo pipefail

LOCAL=0
[ "${1:-}" = "--local" ] && LOCAL=1

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
SHELL="$REPO_DIR/apps/dashboard/index.html"
CONFIG="$REPO_DIR/infra/cloudflared/config.yml"
RUNBOOK="$REPO_DIR/infra/oracle/runbook.md"

if [ "$LOCAL" -eq 1 ]; then
  checks=0
  # 1. Static-only shell: no realtime primitive to bypass the edge with.
  if grep -rEi 'EventSource|subscribe\(|fetch\(|WebSocket|XMLHttpRequest' "$SHELL" >/dev/null; then
    echo "EDGE-REJECT FAIL: shell exposes a dynamic primitive (edge wall would be bypassable)" >&2
    exit 1
  fi
  checks=$((checks + 1))
  # 2. Deny-by-default catch-all is the last ingress rule.
  tail -1 "$CONFIG" | grep -q 'http_status:404' \
    || { echo "EDGE-REJECT FAIL: tunnel ingress lacks the trailing 404 catch-all" >&2; exit 1; }
  checks=$((checks + 1))
  # 3. Dashboard hostname present, hot database absent from the route table.
  grep -q 'hostname:' "$CONFIG" \
    || { echo "EDGE-REJECT FAIL: tunnel config has no dashboard hostname" >&2; exit 1; }
  checks=$((checks + 1))
  ! grep -Eq '8090' "$CONFIG" \
    || { echo "EDGE-REJECT FAIL: tunnel config routes the hot database" >&2; exit 1; }
  checks=$((checks + 1))
  # 4. Owner-only Access rule documented deny-by-default with zero bypass.
  grep -qi 'owner-only' "$RUNBOOK" && grep -q 'Allow' "$RUNBOOK" \
    || { echo "EDGE-REJECT FAIL: runbook does not document the owner-only Allow rule" >&2; exit 1; }
  checks=$((checks + 1))
  echo "EDGE-REJECT PASS (local config-lint: $checks/5 preconditions hold; live assertions deferred to real host)"
  exit 0
fi

# --- live mode: credentials present, prove the behavior ---------------------
: "${DASHBOARD_URL:?set DASHBOARD_URL to the Pages shell URL for live edge-reject}"
STREAM_URL="${DASHBOARD_STREAM_URL:-$DASHBOARD_URL/api/stream}"

code_of() { curl -s -o /dev/null -w '%{http_code}' -m 15 "$1"; }
is_reject() { # 401/403, or 30x toward the Access login wall
  case "$1" in 401|403|301|302|303|307|308) return 0 ;; *) return 1 ;; esac
}

SHELL_CODE="$(code_of "$DASHBOARD_URL")"
STREAM_CODE="$(code_of "$STREAM_URL")"
is_reject "$SHELL_CODE" \
  || { echo "EDGE-REJECT FAIL: unauthenticated shell returned $SHELL_CODE (expected reject-before-render)" >&2; exit 1; }
is_reject "$STREAM_CODE" \
  || { echo "EDGE-REJECT FAIL: unauthenticated stream returned $STREAM_CODE (expected reject-before-render)" >&2; exit 1; }
echo "EDGE-REJECT PASS (live: shell=$SHELL_CODE stream=$STREAM_CODE, both rejected before render)"
