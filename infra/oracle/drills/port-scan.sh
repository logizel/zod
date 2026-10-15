#!/usr/bin/env bash
# Port-scan drill (D-18; T-1-12): zero open inbound ports, tunnel only ingress.
#
# Usage:
#   infra/oracle/drills/port-scan.sh --local   # config-lint + best-effort ss check (no cloud accounts)
#   infra/oracle/drills/port-scan.sh           # live on the VM: loopback bind REQUIRED
#
# Asserts the socket table shows the hot database on loopback
# (127.0.0.1:8090, exactly as the supervised unit declares) and no public
# listener on that port. Prefers `ss -tlnp` bind assertions over nmap (which
# is not installed per RESEARCH environment notes) — asserting the BIND is
# stronger than asserting closed ports: a loopback bind stays safe even if a
# firewall rule slips.
set -euo pipefail

LOCAL=0
[ "${1:-}" = "--local" ] && LOCAL=1

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
UNIT="$REPO_DIR/infra/cloudflared/pocketbase.service"
CONFIG="$REPO_DIR/infra/cloudflared/config.yml"

fail() { echo "PORT-SCAN FAIL: $1" >&2; exit 1; }

# 1. The unit must declare the loopback-only bind (the drill asserts against
#    the exact bind address the unit declares).
grep -q -- '--http=127\.0\.0\.1:8090' "$UNIT" \
  || fail "pocketbase.service does not bind --http=127.0.0.1:8090 (loopback-only violated at declaration)"

# 2. The tunnel route table must never front the hot database directly.
if grep -Eq '8090' "$CONFIG"; then
  fail "tunnel config references the hot-database port (only the future stream origin belongs here)"
fi

# 3. Live socket table (when ss exists).
if command -v ss >/dev/null 2>&1; then
  TABLE="$(ss -tlnp 2>/dev/null || ss -tln 2>/dev/null || true)"
  if echo "$TABLE" | grep -Eq '\*:8090|0\.0\.0\.0:8090|\[::\]:8090'; then
    fail "public listener on 8090 (tunnel is the only ingress — nothing may listen publicly)"
  fi
  if echo "$TABLE" | grep -Eq '127\.0\.0\.1:8090'; then
    BIND_NOTE="hot database on loopback (127.0.0.1:8090), no public listener"
  elif [ "$LOCAL" -eq 1 ]; then
    BIND_NOTE="hot database not running on this workstation (acceptable in --local; declaration proven above)"
  else
    fail "127.0.0.1:8090 not listening on the live host (unit should be active)"
  fi
else
  BIND_NOTE="ss unavailable; unit-declaration proof only"
fi

echo "PORT-SCAN PASS: unit declares loopback-only bind, tunnel route clean, $BIND_NOTE"
