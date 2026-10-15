#!/usr/bin/env bash
# Secrets-hygiene drill (D-28): every secret lives in env, never in git.
#
# Usage: infra/oracle/drills/secrets-scan.sh   (no args; exits 0 clean, non-zero on any finding)
#
# Scans the FULL history plus staged diffs: the real `.env` is gitignored
# from the first commit, so any credential-shaped string that ever entered
# history is a finding. Prefers the `gitleaks` binary (Go, v8.x per RESEARCH)
# when installed; otherwise falls back to assembled patterns. Fallback
# patterns are built by string concatenation so the pattern literals never
# appear in this file — otherwise this drill would flag its own committed
# source on every future history scan.
set -euo pipefail

fail() { echo "SECRETS-SCAN FAIL: $1" >&2; exit 1; }

# 1. Forbidden paths must never be tracked (env-only tokens, credential
#    files, tunnel identity — all 0600 outside the repo by contract).
TRACKED="$(git ls-files)"
echo "$TRACKED" | grep -qx '\.env' && fail ".env is tracked (env-only violated)"
echo "$TRACKED" | grep -Ei '(^|/)\.cloudflared/.*\.json$|(^|/)credentials.*\.json$|(^|/)[^.]*token.*\.json$' \
  && fail "credential/token JSON is tracked (env-only violated)"

COMMITS="$(git rev-list --count HEAD)"

# 2. Content scan: history + staged.
if command -v gitleaks >/dev/null 2>&1; then
  gitleaks git --no-banner --redact \
    || fail "gitleaks history scan reported findings"
  gitleaks protect --staged --no-banner --redact \
    || fail "gitleaks staged scan reported findings"
  echo "SECRETS-SCAN PASS: $COMMITS commits + staged clean (gitleaks history + protect)"
  exit 0
fi

# Fallback: assembled patterns (literals never appear — see header note).
D5="-----"
P_KEY="${D5}BEGIN [A-Z ]*PRIVATE KEY${D5}"
P_AWS="AK""IA[0-9A-Z]{16}"
P_GH="ghp""_[A-Za-z0-9]{36}"
P_SLACK="xox""[bpas]-[A-Za-z0-9-]{10,}"
P_SK="sk-live""-[A-Za-z0-9]{20,}"
P_ASN="(TOKEN|PASSWORD|SECRET|PRIVATE_KEY)[A-Z_]*[=:][\"']?[A-Za-z0-9_.\\/+-]{16,}"
ALLOW='example|test|fake|placeholder|changeme|your|here|paste|xxx|redacted|\[|<|sha512|integrity'

CORPUS="$(git log --all -p -- . ':!pnpm-lock.yaml' 2>/dev/null; git diff --cached -- . ':!pnpm-lock.yaml' 2>/dev/null)"
for pat in "$P_KEY" "$P_AWS" "$P_GH" "$P_SLACK" "$P_SK"; do
  HIT="$(echo "$CORPUS" | grep -E -- "$pat" | grep -viE -- "$ALLOW" || true)"
  [ -z "$HIT" ] || fail "credential-shaped hit [$pat]: $(echo "$HIT" | head -1 | cut -c1-120)"
done
HIT="$(echo "$CORPUS" | grep -E -- "^[+-].*$P_ASN" | grep -viE -- "$ALLOW" || true)"
[ -z "$HIT" ] || fail "secret assignment with real-length value: $(echo "$HIT" | head -1 | cut -c1-120)"

echo "SECRETS-SCAN PASS: $COMMITS commits + staged clean (fallback assembled-patterns; gitleaks absent)"
