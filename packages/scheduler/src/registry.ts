// Single scheduler registry (D-23, D-24-corrected, T-1-07).
//
// This module owns EVERY cron.schedule() call in the system. Future pipeline
// code must register here — never scatter setInterval or ad-hoc schedules.
//
// Locked guard contract: Asia/Kolkata timezone + noOverlap + per-job
// maxRandomDelay jitter on every job, overlap skips warned on the same child
// logger, and a boot assertion that fails loudly on a wrong scheduler build
// (e.g. the kelektiv/* git-shorthand family, which lacks this API).

import cron, { type ScheduledTask, type TaskFn } from 'node-cron';
import {
  SCHEDULER_TIMEZONE,
  STUB_JOBS,
  GATEWAY_JOBS,
  JOB_POLL_JOBS,
  AUDIT_JOBS,
  computeBufferHoldMiB,
  runStubTick,
  runGatewayTick,
  type MetricsSink,
  type StubJobDef,
  type TickLogger,
  type TickOptions,
  type TickRecord,
} from './jobs.js';

export {
  SCHEDULER_TIMEZONE,
  STUB_JOBS,
  GATEWAY_JOBS,
  JOB_POLL_JOBS,
  AUDIT_JOBS,
  computeBufferHoldMiB,
  runStubTick,
  runGatewayTick,
};
export type { MetricsSink, TickLogger, TickOptions, TickRecord };

/**
 * Structural scheduler surface the registry needs. `typeof cron` satisfies it;
 * tests inject fakes to prove registration values and guard failures.
 */
export interface SchedulerModule {
  schedule(expression: string, func: TaskFn, options?: Record<string, unknown>): ScheduledTask;
  validate(expression: string): boolean;
}

export interface RegistryHandle {
  tasks: ScheduledTask[];
  stop(): void;
}

export interface RegisterOptions {
  /** Metrics destination for start/done/skip tick records. */
  sink?: MetricsSink;
  /**
   * Heartbeat directory for tick-done files the watchdog reads. Defaults to
   * SCHEDULER_HEARTBEAT_DIR; unset skips heartbeat writes (dev/test).
   */
  heartbeatDir?: string;
}

const GUARD_PREFIX = '[scheduler-guard]';

/**
 * Boot assertion: the installed scheduler build must expose the overlap-guard
 * API (schedule + validate, probe task with .on/.start/.stop/.destroy, and
 * acceptance of { timezone, noOverlap, maxRandomDelay }). A wrong-package
 * install fails loudly here instead of silently stampeding later.
 */
export function assertSchedulerGuards(mod: SchedulerModule = cron): void {
  if (
    mod === null ||
    mod === undefined ||
    typeof (mod as SchedulerModule).schedule !== 'function' ||
    typeof (mod as SchedulerModule).validate !== 'function'
  ) {
    throw new Error(
      `${GUARD_PREFIX} installed scheduler build lacks schedule()/validate() — ` +
        'expected registry node-cron@^4 on the 4.6 line (never the kelektiv/* git shorthand)',
    );
  }
  for (const def of [
    ...STUB_JOBS,
    ...GATEWAY_JOBS,
    ...JOB_POLL_JOBS,
    ...AUDIT_JOBS,
  ]) {
    if (!mod.validate(def.expression)) {
      throw new Error(
        `${GUARD_PREFIX} scheduler build rejects expression '${def.expression}' (${def.name})`,
      );
    }
  }
  let probe: ScheduledTask | undefined;
  try {
    probe = mod.schedule('0 0 1 1 *', () => undefined, {
      name: 'guard-probe',
      timezone: SCHEDULER_TIMEZONE,
      noOverlap: true,
      maxRandomDelay: 1,
    });
  } catch (err) {
    throw new Error(
      `${GUARD_PREFIX} scheduling with { timezone, noOverlap, maxRandomDelay } failed — ` +
        'wrong scheduler build (overlap-guard API missing)',
      { cause: err },
    );
  }
  const probeRecord = probe as unknown as Record<string, unknown>;
  for (const method of ['on', 'start', 'stop', 'destroy'] as const) {
    if (typeof probeRecord[method] !== 'function') {
      try {
        (probeRecord['stop'] as (() => void) | undefined)?.();
        (probeRecord['destroy'] as (() => void) | undefined)?.();
      } catch {
        // best-effort cleanup before failing loudly
      }
      throw new Error(
        `${GUARD_PREFIX} scheduled task lacks .${method}() — ` +
          'wrong scheduler build (overlap-event API missing)',
      );
    }
  }
  void probe.stop();
  void probe.destroy();
}

/**
 * Register all four stub jobs with timezone + overlap guard + jitter, attach
 * the skip warning on the same child logger, and start every task.
 */
export function registerStubJobs(
  log: TickLogger,
  mod: SchedulerModule = cron,
  opts: RegisterOptions = {},
): RegistryHandle {
  assertSchedulerGuards(mod);
  const heartbeatDir = opts.heartbeatDir ?? process.env['SCHEDULER_HEARTBEAT_DIR'];
  const tasks = STUB_JOBS.map((def) => {
    const task = mod.schedule(
      def.expression,
      () => runStubTick(def, log, { sink: opts.sink, heartbeatDir }),
      {
        name: def.name,
        timezone: SCHEDULER_TIMEZONE,
        noOverlap: true,
        maxRandomDelay: def.maxRandomDelayMs,
      },
    );
    task.on('execution:overlap', () => {
      log.child({ job: def.name }).warn('tick skipped: previous run pending');
      opts.sink?.record({ job: def.name, phase: 'skip', at: new Date().toISOString() });
    });
    void task.start();
    return task;
  });
  return {
    tasks,
    stop: () => {
      for (const task of tasks) {
        void task.stop();
      }
    },
  };
}

/** Register gateway bucket-timer jobs alongside stub jobs via the same single
 * registry path (no setInterval scatter). Accepts an injected tickHandler so
 * the scheduler stays agnostic of gateway internals (llm provides the handler
 * via registry-integration.ts). */
export function registerGatewayJobs(
  log: TickLogger,
  mod: SchedulerModule = cron,
  opts: RegisterOptions & {
    tickHandler?: (def: StubJobDef, log: TickLogger) => Promise<void> | void;
  } = {},
): RegistryHandle {
  assertSchedulerGuards(mod);
  const heartbeatDir = opts.heartbeatDir ?? process.env['SCHEDULER_HEARTBEAT_DIR'];
  const tasks = GATEWAY_JOBS.map((def) => {
    const task = mod.schedule(
      def.expression,
      () => runGatewayTick(def, log, { sink: opts.sink, heartbeatDir, tickHandler: opts.tickHandler }),
      {
        name: def.name,
        timezone: SCHEDULER_TIMEZONE,
        noOverlap: true,
        maxRandomDelay: def.maxRandomDelayMs,
      },
    );
    task.on('execution:overlap', () => {
      log.child({ job: def.name }).warn('tick skipped: previous run pending');
      opts.sink?.record({ job: def.name, phase: 'skip', at: new Date().toISOString() });
    });
    void task.start();
    return task;
  });
  return {
    tasks,
    stop: () => {
      for (const task of tasks) {
        void task.stop();
      }
    },
  };
}

/** Register job-pipeline poll jobs (jobs-poll, loot-watchlist) via runStubTick
 * with injected candidate sources. The scheduler stays agnostic of source
 * internals — sources are injected through TickOptions.candidateSources. */
export function registerPollJobs(
  log: TickLogger,
  mod: SchedulerModule = cron,
  opts: RegisterOptions & {
    candidateSources?: Record<string, import('./jobs.js').CandidateSource>;
  } = {},
): RegistryHandle {
  assertSchedulerGuards(mod);
  const heartbeatDir = opts.heartbeatDir ?? process.env['SCHEDULER_HEARTBEAT_DIR'];
  const tasks = JOB_POLL_JOBS.map((def) => {
    const task = mod.schedule(
      def.expression,
      () => runStubTick(def, log, {
        sink: opts.sink,
        heartbeatDir,
        candidateSources: opts.candidateSources,
      }),
      {
        name: def.name,
        timezone: SCHEDULER_TIMEZONE,
        noOverlap: true,
        maxRandomDelay: def.maxRandomDelayMs,
      },
    );
    task.on('execution:overlap', () => {
      log.child({ job: def.name }).warn('tick skipped: previous run pending');
      opts.sink?.record({ job: def.name, phase: 'skip', at: new Date().toISOString() });
    });
    void task.start();
    return task;
  });
  return {
    tasks,
    stop: () => {
      for (const task of tasks) {
        void task.stop();
      }
    },
  };
}

/** Register the audit-drain job via an injected tickHandler (orchestrator
 * provides the handler; scheduler stays agnostic — cycle-free). */
export function registerAuditDrain(
  log: TickLogger,
  mod: SchedulerModule = cron,
  opts: RegisterOptions & {
    tickHandler?: (def: StubJobDef, log: TickLogger) => Promise<void> | void;
  } = {},
): RegistryHandle {
  assertSchedulerGuards(mod);
  const heartbeatDir = opts.heartbeatDir ?? process.env['SCHEDULER_HEARTBEAT_DIR'];
  const tasks = AUDIT_JOBS.map((def) => {
    const task = mod.schedule(
      def.expression,
      () => runGatewayTick(def, log, { sink: opts.sink, heartbeatDir, tickHandler: opts.tickHandler }),
      {
        name: def.name,
        timezone: SCHEDULER_TIMEZONE,
        noOverlap: true,
        maxRandomDelay: def.maxRandomDelayMs,
      },
    );
    task.on('execution:overlap', () => {
      log.child({ job: def.name }).warn('tick skipped: previous run pending');
      opts.sink?.record({ job: def.name, phase: 'skip', at: new Date().toISOString() });
    });
    void task.start();
    return task;
  });
  return {
    tasks,
    stop: () => {
      for (const task of tasks) {
        void task.stop();
      }
    },
  };
}

/** Single registry start the scheduler entry calls (env parse -> logger -> this). */
export function startRegistry(
  log: TickLogger,
  mod: SchedulerModule = cron,
  opts: RegisterOptions = {},
): RegistryHandle {
  return registerStubJobs(log, mod, opts);
}
