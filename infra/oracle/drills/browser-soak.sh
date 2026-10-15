#!/usr/bin/env bash
# 24h browser soak drill (Phase 2 Plan 03; SWM-03 / ING-06 era): sustained
# fetchViaBrowser() load, flat RSS, zero zombie Chromium processes.
#
# Usage:
#   infra/oracle/drills/browser-soak.sh --local   # 5-minute mini-soak
#   infra/oracle/drills/browser-soak.sh            # 24-hour soak (production host)
#
# --local exercises the same code path + thresholds but with a shortened
# duration so the drill is runnable on a dev machine.
set -euo pipefail

MODE="${1:-}"
LOCAL=0
if [ "$MODE" = "--local" ]; then LOCAL=1; fi
if [ "$MODE" != "" ] && [ "$MODE" != "--local" ]; then
  echo "usage: $0 [--local]" >&2
  exit 2
fi

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
DIST="$REPO_DIR/packages/browser/dist/queue.js"

if [ ! -f "$DIST" ]; then
  echo "[soak] building workspace (dist missing)"
  (cd "$REPO_DIR" && pnpm build >/tmp/opencode/soak-build.log 2>&1) || {
    echo "SOAK FAIL: build failed (see /tmp/opencode/soak-build.log)" >&2
    exit 1
  }
fi

if [ "$LOCAL" -eq 1 ]; then
  DURATION_MS=$((5 * 60 * 1000))
else
  DURATION_MS=$((24 * 60 * 60 * 1000))
fi

WORK="$(mktemp -d /tmp/opencode/soak-XXXXXX)"
trap 'rm -rf "$WORK"' EXIT
LOG="$WORK/soak.log"
NODE_SCRIPT="$WORK/soak.mjs"

cat > "$NODE_SCRIPT" <<'NODE'
import { writeFileSync, appendFileSync, readFileSync, readdirSync } from 'node:fs';

const durationMs = Number(process.argv[2]);
const logPath = process.argv[3];
const distPath = process.argv[4];

const { fetchViaBrowser, shutdown } = await import(distPath);

const URLS = [
  'https://example.com',
  'https://www.iana.org/domains/reserved',
  'https://httpbin.org/html',
];

const stats = { total: 0, success: 0, failed: 0 };
const rssSamples = []; // MB
let lastRssAt = 0;
const startTime = Date.now();

function chromiumPids() {
  const out = [];
  try {
    for (const d of readdirSync('/proc')) {
      if (!/^\d+$/.test(d)) continue;
      try {
        const cmd = readFileSync(`/proc/${d}/cmdline`, 'utf8');
        if (cmd.includes('chrome-headless-shell') || cmd.includes('ms-playwright')) out.push(Number(d));
      } catch {}
    }
  } catch {}
  return out;
}

function sampleRss() {
  let rssMb = 0;
  for (const pid of chromiumPids()) {
    try {
      const statm = readFileSync(`/proc/${pid}/statm`, 'utf8');
      const pages = Number(statm.trim().split(/\s+/)[1]);
      if (Number.isFinite(pages)) rssMb += (pages * 4096) / (1024 * 1024);
    } catch {}
  }
  rssSamples.push(rssMb);
  const ts = new Date().toISOString();
  appendFileSync(logPath, `${ts} rss_mb=${rssMb.toFixed(1)} zombies=${chromiumPids().length}\n`);
  return rssMb;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

let i = 0;
try {
  sampleRss();
  lastRssAt = Date.now();
  while (Date.now() - startTime < durationMs) {
    const url = URLS[i % URLS.length];
    i++;
    stats.total++;
    try {
      await fetchViaBrowser(url);
      stats.success++;
    } catch (err) {
      stats.failed++;
      process.stderr.write(`[soak] fetch failed: ${url}: ${err?.message || err}\n`);
    }
    if (Date.now() - lastRssAt >= 5 * 60 * 1000) {
      sampleRss();
      lastRssAt = Date.now();
    }
    const remaining = durationMs - (Date.now() - startTime);
    if (remaining > 0) {
      await sleep(Math.min(30000, remaining));
    }
  }
  // final RSS sample before shutdown
  sampleRss();
} finally {
  try { await shutdown(); } catch {}
}

const endZombies = chromiumPids().length;
const successRate = stats.total > 0 ? stats.success / stats.total : 1;
const maxRss = rssSamples.length ? Math.max(...rssSamples) : 0;
let rising = false;
if (rssSamples.length >= 3) {
  rising = rssSamples.every((v, idx) => (idx === 0 ? true : v > rssSamples[idx - 1]));
}

const summary = {
  total: stats.total,
  success: stats.success,
  failed: stats.failed,
  successRate: Number(successRate.toFixed(4)),
  maxRssMb: Number(maxRss.toFixed(1)),
  zombies: endZombies,
  rssSamples: rssSamples.map((v) => Number(v.toFixed(1))),
  rising,
};

process.stdout.write(`SOAK_SUMMARY ${JSON.stringify(summary)}\n`);

const ok =
  successRate >= 0.95 &&
  maxRss < 1536 &&
  endZombies === 0 &&
  !rising;

if (!ok) {
  process.stderr.write(`SOAK FAIL: ${JSON.stringify(summary)}\n`);
  process.exit(1);
}
process.exit(0);
NODE

echo "[soak] running ${DURATION_MS}ms soak (local=$LOCAL)"
if ! node "$NODE_SCRIPT" "$DURATION_MS" "$LOG" "$DIST"; then
  echo "SOAK FAIL" >&2
  echo "--- log tail ---" >&2
  tail -20 "$LOG" >&2 || true
  exit 1
fi

echo "BROWSER-SOAK PASS (local=$LOCAL, duration_ms=$DURATION_MS)"
exit 0
