// MEM-05 midnight GC: purge heavy-text columns + telemetry + 25h alert (D-14, Pitfall 11).
//
// runMidnightGc() composes purgeExpiredHeavyText (@zod/db-hot/telemetry) with:
//   - a telemetry event with counts (purged/compacted/errors)
//   - tracking of last successful GC run time
//   - a 25h-missing alert dispatched to #🛠-ops-health via alerts.ts
//
// Idempotent: re-running on already-purged rows is a no-op.
// GC targets only description_raw (opportunities) and detail (agent_telemetry);
// tombstone_ledger and taste_rules are never touched.

import { purgeExpiredHeavyText, type TelemetryRow, type OpportunityRow } from '@zod/db-hot/telemetry';
import type { Env } from '@zod/config';
import { createLogger } from '@zod/logger';

export interface GcRunResult {
  purged: number;      // heavy-text cells cleared
  compacted: number;   // rows visited that were purge-eligible
  errors: number;      // rows that threw during expiry evaluation
  lastSuccessMs: number; // epoch ms of last successful GC run (0 if never)
  alertRaised: boolean;  // whether the 25h-missing alert was raised this run
}

const DEFAULT_GC_ALERT_HOURS = 25;

/** Last successful GC run time (module state, reset between tests). */
let lastSuccessfulGcMs: number | null = null;

/** Returns the epoch-ms of the last successful GC run, or null if never. */
export function getLastSuccessfulGcMs(): number | null {
  return lastSuccessfulGcMs;
}

/** Resets module state — for test isolation only. */
export function resetGcState(): void {
  lastSuccessfulGcMs = null;
}

/**
 * Run the midnight GC cycle: purge heavy-text columns, emit telemetry counts,
 * track last success, and raise a 25h-missing alert if overdue.
 *
 * @param rows - agentTelemetry + opportunities rows to purge (mutated in place)
 * @param nowMs - epoch-ms "now" for purge/threshold math (default Date.now)
 * @param opts - env (default parseEnv), log (default createLogger), sendAlert
 *               (default: a no-op that returns false; production wires sendOpsAlert)
 */
export async function runMidnightGc(
  rows: { agentTelemetry: TelemetryRow[]; opportunities: OpportunityRow[] },
  nowMs: number = Date.now(),
  opts: {
    env?: Env;
    log?: { info: (...args: any[]) => void; warn: (...args: any[]) => void };
    sendAlert?: (text: string) => Promise<boolean>;
  } = {},
): Promise<GcRunResult> {
  const env = opts.env ?? (globalThis as any).parseEnv ?? undefined;
  const log = opts.log ?? createLogger('info');
  const sendAlert = opts.sendAlert ?? (async () => false);

  const gcAlertHours =
    env && env.GC_ALERT_HOURS != null ? Number(env.GC_ALERT_HOURS) : DEFAULT_GC_ALERT_HOURS;

  // 25h-missing check: alert if never succeeded or past the threshold
  const msSinceLastSuccess =
    lastSuccessfulGcMs === null ? Infinity : nowMs - lastSuccessfulGcMs;
  const alertNeeded = msSinceLastSuccess > gcAlertHours * 60 * 60 * 1000;

  // Purge heavy-text columns (idempotent: already-empty cells are no-ops)
  const purge = purgeExpiredHeavyText(rows, nowMs);

  // Emit telemetry event with counts
  log.info(
    {
      component: 'gc',
      purged: purge.purged,
      compacted: purge.compacted,
      errors: purge.errors,
      nowMs,
    },
    'midnight GC telemetry',
  );

  let alertRaised = false;
  if (alertNeeded) {
    alertRaised = true;
    await sendAlert(
      `GC 25h-missing alert: no successful GC run in ${gcAlertHours}h ` +
        `(last success: ${lastSuccessfulGcMs ?? 'never'})`,
    );
  }

  // Track last successful GC run time
  if (purge.errors === 0) {
    lastSuccessfulGcMs = nowMs;
  }

  return {
    purged: purge.purged,
    compacted: purge.compacted,
    errors: purge.errors,
    lastSuccessMs: lastSuccessfulGcMs ?? 0,
    alertRaised,
  };
}
