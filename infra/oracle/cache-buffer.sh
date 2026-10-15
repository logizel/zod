#!/usr/bin/env bash
# Reclaim defense wired-cache buffer (D-25, T-1-08, Assumptions Log A1).
#
# Oracle's idle-reclaim detector kills VMs that look unused. This script holds
# a wired anonymous-memory buffer so the box reports a 22-30% busy baseline.
# The hold size derives from ACTUAL memory at provisioning (never a blind
# constant): 2.5 GiB by default, shrunk when free RAM cannot afford it or when
# it would push usage past the 30% ceiling. Formula mirrors the tested spec in
# packages/scheduler (computeBufferHoldMiB) — change both together.
#
# Supervised by cache-buffer.service (Restart=always). Install path on the VM
# is /opt/zod/cache-buffer.sh (placed by the plan-04 rebuild script).
#
# PROHIBITION: never shrink or swap out this buffer to free RAM for workloads
# — removing it changes the idle-reclaim risk profile (plan 01-03 must-haves).
set -euo pipefail

DEFAULT_HOLD_MIB="${CACHE_BUFFER_HOLD_MIB:-2560}"   # 2.5 GiB wired cache
HOLD_MARGIN_MIB="${CACHE_BUFFER_MARGIN_MIB:-512}"     # never eat the last 512 MiB of free RAM
CEILING_PERCENT="${CACHE_BUFFER_CEILING_PERCENT:-30}"      # reclaim-band ceiling (floor needs no enforcement:
                        # the buffer only ever ADDS usage)

mem_kb() {
  awk -v key="$1:" '$1 == key { print $2; exit }' "${CACHE_BUFFER_MEMINFO:-/proc/meminfo}"
}

TOTAL_KB="$(mem_kb MemTotal)"
AVAIL_KB="$(mem_kb MemAvailable)"
: "${TOTAL_KB:?/proc/meminfo has no MemTotal}"
: "${AVAIL_KB:?/proc/meminfo has no MemAvailable}"

TOTAL_MIB=$((TOTAL_KB / 1024))
AVAIL_MIB=$((AVAIL_KB / 1024))
USED_MIB=$((TOTAL_MIB - AVAIL_MIB))

AFFORDABLE_MIB=$((AVAIL_MIB - HOLD_MARGIN_MIB))
if [ "$AFFORDABLE_MIB" -lt 0 ]; then AFFORDABLE_MIB=0; fi
TO_CEILING_MIB=$(((CEILING_PERCENT * TOTAL_MIB - 100 * USED_MIB + 99) / 100))
if [ "$TO_CEILING_MIB" -lt 0 ]; then TO_CEILING_MIB=0; fi

HOLD_MIB="$DEFAULT_HOLD_MIB"
if [ "$AFFORDABLE_MIB" -lt "$HOLD_MIB" ]; then HOLD_MIB="$AFFORDABLE_MIB"; fi
if [ "$TO_CEILING_MIB" -lt "$HOLD_MIB" ]; then HOLD_MIB="$TO_CEILING_MIB"; fi

BASELINE_PERCENT=$(((100 * (USED_MIB + HOLD_MIB)) / TOTAL_MIB))
echo "cache-buffer: total=${TOTAL_MIB}MiB avail=${AVAIL_MIB}MiB hold=${HOLD_MIB}MiB baseline=${BASELINE_PERCENT}% (band 22-30%)" >&2

if [ "$HOLD_MIB" -le 0 ]; then
  echo "cache-buffer: memory too tight to hold a buffer; watchdog silence-alerting still covers reclaim" >&2
  # Sleep forever holding nothing: keeps the supervised unit green while the
  # watchdog (which pages on VM silence, not on buffer size) stays the guard.
  exec sleep infinity
fi

# Node is guaranteed on the VM (the scheduler runs on it). The holder allocates
# the buffer once and re-touches every page each minute so the reclaim metric
# observes resident, recently-used RAM rather than a swappable cold mapping.
HOLD_MIB="$HOLD_MIB" exec node -e '
const holdMiB = Number(process.env.HOLD_MIB);
if (!Number.isFinite(holdMiB) || holdMiB <= 0) {
  throw new Error(`cache-buffer holder: invalid HOLD_MIB=${process.env.HOLD_MIB}`);
}
const buf = Buffer.alloc(holdMiB * 1024 * 1024, 0x5a);
const touch = () => {
  let acc = 0;
  for (let i = 0; i < buf.length; i += 4096) acc = (acc + buf[i]) % 251;
  return acc;
};
touch();
const rssMiB = Math.round(process.memoryUsage().rss / 1024 / 1024);
console.error(`cache-buffer: holding ${holdMiB}MiB wired (holder RSS ~${rssMiB}MiB)`);
setInterval(() => { touch(); }, 60_000);
'
