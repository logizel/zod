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

import {
  isTelemetryExpired,
  purgeExpiredHeavyText,
  type TelemetryRow,
  type OpportunityRow,
} from '@zod/db-hot/telemetry';
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

/** 48h heavy-text retention for rejected/tombstoned opportunities (MEM-05). */
const REJECTION_RETENTION_MS = 48 * 60 * 60 * 1000;

/** Persisted GC last-success marker lives in the agent_telemetry ring. */
export const GC_LAST_SUCCESS_SLOT = 'gc-last-success';

type LogLike = {
  info: (...args: any[]) => void;
  warn: (...args: any[]) => void;
  error?: (...args: any[]) => void;
};

/** Minimal PocketBase surface used by the production GC runner. */
export interface GcPb {
  collection(name: string): {
    getFullList(options?: unknown): Promise<Array<Record<string, unknown>>>;
    getFirstListItem(filter: string, options?: unknown): Promise<Record<string, unknown>>;
    create(data: Record<string, unknown>): Promise<unknown>;
    update(id: string, data: Record<string, unknown>): Promise<unknown>;
    delete(id: string): Promise<boolean>;
  };
}

export interface PersistentGcResult extends GcRunResult {
  /** agent_telemetry rows deleted for being older than 24h. */
  telemetryDeleted: number;
  /** opportunity heavy-text cells cleared (24h end_date / 48h rejection). */
  opportunityTextPurged: number;
  /** True when the last-success marker was updated in PocketBase. */
  persisted: boolean;
}

export interface PersistentGcOpts {
  pb: GcPb;
  env?: Env;
  log?: LogLike;
  nowMs?: number;
  sendAlert?: (text: string) => Promise<boolean>;
  /** Set false to suppress the per-run summary alert (tests). */
  summaryAlert?: boolean;
}

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
 *               (default: a no-op that returns false; production wires sendOpsAlert),
 *               lastSuccessMs (production passes the PocketBase-persisted marker;
 *               omitted means use in-process module state for pure tests)
 */
export async function runMidnightGc(
  rows: { agentTelemetry: TelemetryRow[]; opportunities: OpportunityRow[] },
  nowMs: number = Date.now(),
  opts: {
    env?: Env;
    log?: { info: (...args: any[]) => void; warn: (...args: any[]) => void };
    sendAlert?: (text: string) => Promise<boolean>;
    lastSuccessMs?: number | null;
  } = {},
): Promise<GcRunResult> {
  const env = opts.env ?? (globalThis as any).parseEnv ?? undefined;
  const log = opts.log ?? createLogger('info');
  const sendAlert = opts.sendAlert ?? (async () => false);

  const gcAlertHours =
    env && env.GC_ALERT_HOURS != null ? Number(env.GC_ALERT_HOURS) : DEFAULT_GC_ALERT_HOURS;

  // 25h-missing check: alert only when there was a previous successful run
  // that has gone stale. Skip the alert on the very first successful run
  // (lastSuccessfulGcMs === null) to avoid a false-positive on boot/reset.
  // Production passes the persisted marker explicitly so a scheduler restart
  // cannot hide a stalled GC.
  const priorLastSuccessMs =
    opts.lastSuccessMs !== undefined ? opts.lastSuccessMs : lastSuccessfulGcMs;
  const msSinceLastSuccess =
    priorLastSuccessMs === null ? Infinity : nowMs - priorLastSuccessMs;
  const alertNeeded =
    priorLastSuccessMs !== null && msSinceLastSuccess > gcAlertHours * 60 * 60 * 1000;

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
        `(last success: ${priorLastSuccessMs ?? 'never'})`,
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

// ---------------------------------------------------------------------------
// Production persistent GC runner (MEM-05)
// ---------------------------------------------------------------------------

function isNotFound(err: unknown): boolean {
  const e = err as { status?: number; response?: { code?: number; status?: number } } | null;
  return (e?.status ?? e?.response?.code ?? e?.response?.status) === 404;
}

function toEpochMs(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.length > 0) {
    const ms = Date.parse(value);
    return Number.isFinite(ms) ? ms : null;
  }
  return null;
}

/** Rejected/tombstoned rows retain heavy text for 48h after the rejection. */
function rejectionPurgeEligible(row: Record<string, unknown>, nowMs: number): boolean {
  const status = String(row['status'] ?? '');
  if (status !== 'rejected' && status !== 'tombstoned') return false;
  const stamp = toEpochMs(row['updated']) ?? toEpochMs(row['created']);
  return stamp !== null && nowMs - stamp > REJECTION_RETENTION_MS;
}

/** Read the persisted last-success marker from agent_telemetry. */
export async function readGcMarker(
  pb: GcPb,
): Promise<{ lastSuccessMs: number | null; rowId: string | null }> {
  try {
    const row = await pb
      .collection('agent_telemetry')
      .getFirstListItem(`slot = '${GC_LAST_SUCCESS_SLOT}'`, { sort: '-updated' });
    const lastSuccessMs =
      toEpochMs(row['detail']) ?? toEpochMs(row['updated']) ?? toEpochMs(row['created']);
    const id = String(row['id'] ?? '');
    return { lastSuccessMs: lastSuccessMs ?? null, rowId: id || null };
  } catch (err) {
    if (isNotFound(err)) return { lastSuccessMs: null, rowId: null };
    throw err;
  }
}

/** Upsert the persisted last-success marker after a clean GC run. */
async function writeGcMarker(pb: GcPb, nowMs: number, rowId: string | null): Promise<void> {
  const data: Record<string, unknown> = {
    slot: GC_LAST_SUCCESS_SLOT,
    provider: 'system',
    model: 'gc',
    step: 'gc-midnight',
    url: '',
    status: 'done',
    detail: new Date(nowMs).toISOString(),
  };
  if (rowId) {
    try {
      await pb.collection('agent_telemetry').update(rowId, data);
      return;
    } catch (err) {
      if (!isNotFound(err)) throw err;
    }
  }
  await pb.collection('agent_telemetry').create(data);
}

/**
 * Production GC cycle: load hot rows from PocketBase, purge heavy text
 * (24h after end_date, 48h after rejection), delete agent_telemetry rows
 * older than 24h, persist the last-success marker, and raise ops alerts.
 *
 * tombstone_ledger and taste_rules are never touched.
 */
export async function runPersistentGc(opts: PersistentGcOpts): Promise<PersistentGcResult> {
  const { pb } = opts;
  const nowMs = opts.nowMs ?? Date.now();
  const log = opts.log ?? createLogger('info');
  const sendAlert = opts.sendAlert ?? (async () => false);

  // Persisted marker makes a stalled GC visible across scheduler restarts.
  const marker = await readGcMarker(pb);

  const [telemetryRaw, opportunitiesRaw] = await Promise.all([
    pb.collection('agent_telemetry').getFullList(),
    pb.collection('opportunities').getFullList(),
  ]);
  const telemetryRows = telemetryRaw as unknown as TelemetryRow[];
  const opportunityRows = opportunitiesRaw as unknown as OpportunityRow[];
  const originalText = new Map(
    opportunityRows.map((row) => [row.id, String(row.description_raw ?? '')]),
  );

  // Expired telemetry rows are deleted outright (24h ring). The last-success
  // marker is excluded because it is updated below and must survive the trim.
  const expiredTelemetry = telemetryRows.filter((row) => {
    try {
      return isTelemetryExpired(row.created, nowMs);
    } catch {
      return false; // counted by the pure purge below
    }
  });

  // Pure GC retains existing behavior/tests: end_date-based heavy-text purge,
  // telemetry counts, and the 25h-missing alert.
  const pure = await runMidnightGc(
    { agentTelemetry: telemetryRows, opportunities: opportunityRows },
    nowMs,
    { env: opts.env, log, sendAlert, lastSuccessMs: marker.lastSuccessMs },
  );

  // 48h-after-rejection rule (rows rejected with no/ future end_date).
  let extraRejectedPurged = 0;
  for (const row of opportunityRows) {
    if (String(row.description_raw ?? '') === '') continue;
    if (rejectionPurgeEligible(row as unknown as Record<string, unknown>, nowMs)) {
      row.description_raw = '';
      extraRejectedPurged += 1;
    }
  }

  let persistenceErrors = 0;
  let opportunityTextPurged = 0;
  for (const row of opportunityRows) {
    const before = originalText.get(row.id) ?? '';
    if (before === '' || row.description_raw !== '') continue;
    opportunityTextPurged += 1;
    try {
      await pb.collection('opportunities').update(row.id, { description_raw: '' });
    } catch (err) {
      persistenceErrors += 1;
      log.warn({ err: String(err), id: row.id }, 'GC failed to compact opportunity heavy text');
    }
  }

  let telemetryDeleted = 0;
  for (const row of expiredTelemetry) {
    if (row.id === marker.rowId) continue;
    try {
      await pb.collection('agent_telemetry').delete(row.id);
      telemetryDeleted += 1;
    } catch (err) {
      persistenceErrors += 1;
      log.warn({ err: String(err), id: row.id }, 'GC failed to delete expired telemetry');
    }
  }

  const errors = pure.errors + persistenceErrors;
  let persisted = false;
  if (errors === 0) {
    try {
      await writeGcMarker(pb, nowMs, marker.rowId);
      persisted = true;
    } catch (err) {
      persistenceErrors += 1;
      log.error?.({ err: String(err) }, 'GC failed to persist last-success marker');
    }
  }

  const result: PersistentGcResult = {
    purged: pure.purged + extraRejectedPurged,
    compacted: pure.compacted + extraRejectedPurged,
    errors: pure.errors + persistenceErrors,
    lastSuccessMs: persisted ? nowMs : (marker.lastSuccessMs ?? 0),
    alertRaised: pure.alertRaised,
    telemetryDeleted,
    opportunityTextPurged,
    persisted,
  };

  if (opts.summaryAlert !== false) {
    const summary =
      `GC midnight summary: purged=${result.purged} compacted=${result.compacted} ` +
      `telemetryDeleted=${result.telemetryDeleted} opportunityText=${result.opportunityTextPurged} ` +
      `errors=${result.errors} lastSuccess=${result.lastSuccessMs || 'never'}`;
    await sendAlert(result.errors > 0 ? `${summary} — FAILED` : summary);
  }

  return result;
}
