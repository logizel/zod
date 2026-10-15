// Stub-job table + tick runner (D-23).
//
// One module owns every cadence definition; the registry (registry.ts) owns
// every cron.schedule() call. Real poll logic plugs into runStubTick Phase 2+
// without structural change.
//
// TickLogger is structural on purpose: the production pino Logger satisfies it,
// while unit tests inject an in-memory fake — no secrets, no singletons.

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

/**
 * One stub tick: logs start on the per-job child logger, performs no polling,
 * records durationMs on done. Duration flows to the same child logger Phase 7
 * telemetry consumes unchanged.
 */
export async function runStubTick(def: StubJobDef, log: TickLogger): Promise<TickOutcome> {
  const startedAt = Date.now();
  const jobLog = log.child({ job: def.name });
  jobLog.info('tick start');
  // Phase 1 stub: no polling, no I/O. Real poll logic replaces this body.
  const durationMs = Date.now() - startedAt;
  jobLog.info({ durationMs }, 'tick done');
  return { job: def.name, durationMs };
}
