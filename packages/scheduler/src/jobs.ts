// Stub-job table + tick runner (D-23).
//
// One module owns every cadence definition; the registry (registry.ts) owns
// every cron.schedule() call. Real poll logic plugs into runStubTick Phase 2+
// without structural change.
//
// TickLogger is structural on purpose: the production pino Logger satisfies it,
// while unit tests inject an in-memory fake — no secrets, no singletons.

import { mkdirSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export const SCHEDULER_TIMEZONE = 'Asia/Kolkata';

/** Minimal logger shape a job tick needs: info/warn plus child bindings. */
export interface TickLogger {
  info(obj: Record<string, unknown>, msg: string): void;
  info(msg: string): void;
  warn(obj: Record<string, unknown>, msg: string): void;
  warn(msg: string): void;
  child(bindings: Record<string, unknown>): TickLogger;
}

export interface StubJobDef {
  /** Stable job name, also used as the node-cron task name + log binding. */
  name: string;
  /** Cron expression (node-cron v4 syntax). */
  expression: string;
  /** Per-job jitter in milliseconds -> node-cron maxRandomDelay. */
  maxRandomDelayMs: number;
  description: string;
}

/**
 * Exactly four stub jobs per D-23 (events 15-30m, jobs 30-60m, local 2-4h,
 * social 45-90m jitter):
 * - events-stub every 20m + 5m jitter
 * - jobs-stub every 45m (:00 + :45) + 10m jitter
 * - local-stub every 3h + 20m jitter
 * - social-stub hourly + 25m jitter
 */
export const STUB_JOBS: readonly StubJobDef[] = [
  {
    name: 'events-stub',
    expression: '*/20 * * * *',
    maxRandomDelayMs: 5 * 60_000,
    description: 'events pipeline cadence stub (real polling lands Phase 2+)',
  },
  {
    name: 'jobs-stub',
    expression: '*/45 * * * *',
    maxRandomDelayMs: 10 * 60_000,
    description: 'jobs pipeline cadence stub (real polling lands Phase 2+)',
  },
  {
    name: 'local-stub',
    expression: '0 */3 * * *',
    maxRandomDelayMs: 20 * 60_000,
    description: 'local DK/Udupi cadence stub (real polling lands Phase 2+)',
  },
  {
    name: 'social-stub',
    expression: '0 * * * *',
    maxRandomDelayMs: 25 * 60_000,
    description: 'social X/LI cadence stub (real polling lands Phase 2+)',
  },
];

export interface TickOutcome {
  job: string;
  durationMs: number;
}

/** One tick lifecycle record. Phase 7 telemetry consumes these unchanged. */
export interface TickRecord {
  job: string;
  phase: 'start' | 'done' | 'skip';
  /** Present on 'done' (and 'skip' never): wall-clock tick time in ms. */
  durationMs?: number;
  /** ISO-8601 timestamp of the record. */
  at: string;
}

/** Injected metrics destination: production wires telemetry, tests use memory. */
export interface MetricsSink {
  record(record: TickRecord): void;
}

export interface TickOptions {
  sink?: MetricsSink;
  /**
   * When set, tick done writes `<dir>/<job>.heartbeat` (`{job, at,
   * durationMs}`, atomic tmp+rename) for the external silence watchdog.
   * Best-effort: a failed write warns but never fails the tick.
   */
  heartbeatDir?: string;
}

function writeHeartbeat(
  dir: string,
  job: string,
  outcome: TickOutcome,
  log: TickLogger,
): void {
  try {
    mkdirSync(dir, { recursive: true });
    const finalPath = join(dir, `${job}.heartbeat`);
    const tmpPath = `${finalPath}.${Date.now()}.tmp`;
    writeFileSync(
      tmpPath,
      JSON.stringify({ job, at: new Date().toISOString(), durationMs: outcome.durationMs }),
    );
    renameSync(tmpPath, finalPath);
  } catch {
    // Fail-safe direction: the watchdog observes staleness and pages, so a
    // failed write must warn loudly but never kill the tick itself.
    log.warn({ job }, 'heartbeat write failed (watchdog will observe staleness)');
  }
}

/**
 * One stub tick: logs start on the per-job child logger, performs no polling,
 * records durationMs on done. Duration flows to the same child logger Phase 7
 * telemetry consumes unchanged.
 */
export async function runStubTick(
  def: StubJobDef,
  log: TickLogger,
  opts: TickOptions = {},
): Promise<TickOutcome> {
  const startedAt = Date.now();
  const jobLog = log.child({ job: def.name });
  jobLog.info('tick start');
  opts.sink?.record({ job: def.name, phase: 'start', at: new Date(startedAt).toISOString() });
  // Phase 1 stub: no polling, no I/O. Real poll logic replaces this body.
  const durationMs = Date.now() - startedAt;
  const outcome: TickOutcome = { job: def.name, durationMs };
  jobLog.info({ durationMs }, 'tick done');
  opts.sink?.record({ job: def.name, phase: 'done', durationMs, at: new Date().toISOString() });
  if (opts.heartbeatDir !== undefined) {
    writeHeartbeat(opts.heartbeatDir, def.name, outcome, log);
  }
  return outcome;
}

// --- Reclaim-defense sizing (D-25, A1; mirrored by infra/oracle/cache-buffer.sh)
//

/**
 * Idle-reclaim band: the VM must look 22-30% busy. The hold is the 2.5 GiB
 * wired cache by default, shrunk when free memory (minus a safety margin)
 * cannot afford it or when it would push usage past the 30% ceiling.
 */
export const RECLAIM_FLOOR = 0.22;
export const RECLAIM_CEILING = 0.3;
export const DEFAULT_HOLD_MIB = 2560; // 2.5 GiB
export const HOLD_MARGIN_MIB = 512; // never eat the last 512 MiB of free RAM

/**
 * Hold size in MiB from actual memory at provisioning. Throws on
 * non-positive totals (provisioning bug — fail loudly, never guess).
 */
export function computeBufferHoldMiB(totalMiB: number, freeMiB: number): number {
  if (!Number.isFinite(totalMiB) || totalMiB <= 0) {
    throw new Error(`[scheduler-guard] cannot size reclaim buffer: invalid totalMiB=${totalMiB}`);
  }
  const free = Math.min(Math.max(freeMiB, 0), totalMiB);
  const used = totalMiB - free;
  const affordable = Math.max(0, free - HOLD_MARGIN_MIB);
  const toCeiling = Math.max(0, RECLAIM_CEILING * totalMiB - used);
  return Math.floor(Math.min(DEFAULT_HOLD_MIB, affordable, toCeiling));
}
