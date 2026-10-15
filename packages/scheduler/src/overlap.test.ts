// Scheduler tests: registry proof (Task 1) + forced-overlap/metrics/sizing (Task 2).
import { describe, expect, it } from 'vitest';
import cron, { type ScheduledTask, type TaskFn } from 'node-cron';
import {
  assertSchedulerGuards,
  registerStubJobs,
  SCHEDULER_TIMEZONE,
  STUB_JOBS,
  type SchedulerModule,
  type TickLogger,
} from './registry.js';

/** In-memory TickLogger: records every call with its child bindings. */
interface LogRecord {
  level: 'info' | 'warn';
  bindings: Record<string, unknown>;
  obj?: Record<string, unknown>;
  msg?: string;
}

function makeFakeLogger(rootBindings: Record<string, unknown> = {}): {
  log: TickLogger;
  records: LogRecord[];
} {
  const records: LogRecord[] = [];
  const build = (bindings: Record<string, unknown>): TickLogger => ({
    info: (...args: [Record<string, unknown>, string] | [string]) => {
      if (typeof args[0] === 'string') {
        records.push({ level: 'info', bindings, msg: args[0] });
      } else {
        records.push({ level: 'info', bindings, obj: args[0], msg: args[1] });
      }
    },
    warn: (...args: [Record<string, unknown>, string] | [string]) => {
      if (typeof args[0] === 'string') {
        records.push({ level: 'warn', bindings, msg: args[0] });
      } else {
        records.push({ level: 'warn', bindings, obj: args[0], msg: args[1] });
      }
    },
    child: (extra: Record<string, unknown>) => build({ ...bindings, ...extra }),
  });
  return { log: build(rootBindings), records };
}

interface CapturedSchedule {
  expression: string;
  options: Record<string, unknown>;
  handlers: Record<string, () => void>;
  started: boolean;
  stopped: boolean;
}

/** Fake scheduler module capturing every schedule() call for value assertions. */
function makeFakeScheduler(taskImpl: Partial<CapturedSchedule> = {}): {
  mod: SchedulerModule;
  calls: CapturedSchedule[];
} {
  const calls: CapturedSchedule[] = [];
  const mod: SchedulerModule = {
    validate: () => true,
    schedule: (expression: string, fn: TaskFn, options: Record<string, unknown> = {}) => {
      void fn;
      const call: CapturedSchedule = {
        expression,
        options,
        handlers: {},
        started: false,
        stopped: false,
        ...taskImpl,
      };
      calls.push(call);
      return {
        on: (event: string, handler: () => void) => {
          call.handlers[event] = handler;
        },
        start: () => {
          call.started = true;
        },
        stop: () => {
          call.stopped = true;
        },
        destroy: () => undefined,
      } as unknown as ScheduledTask;
    },
  };
  return { mod, calls };
}

describe('registry registers four guarded stub jobs', () => {
  it('schedules exactly the four stub jobs with timezone, overlap guard, and jitter', () => {
    const { log } = makeFakeLogger();
    const { mod, calls } = makeFakeScheduler();

    const handle = registerStubJobs(log, mod);

    // The boot probe ('guard-probe') also flows through schedule() — the four
    // stub jobs are the calls carrying stub names.
    const jobCalls = calls.filter((c) => c.options['name'] !== 'guard-probe');
    expect(handle.tasks).toHaveLength(4);
    expect(jobCalls).toHaveLength(4);
    expect(jobCalls.map((c) => c.options['name'])).toEqual(STUB_JOBS.map((j) => j.name));
    expect(jobCalls.map((c) => c.expression)).toEqual(STUB_JOBS.map((j) => j.expression));
    for (const [index, call] of jobCalls.entries()) {
      expect(call.options['timezone']).toBe(SCHEDULER_TIMEZONE);
      expect(call.options['timezone']).toBe('Asia/Kolkata');
      expect(call.options['noOverlap']).toBe(true);
      expect(call.options['maxRandomDelay']).toBe(STUB_JOBS[index]?.maxRandomDelayMs);
    }
    // every task started, every overlap handler attached
    for (const call of jobCalls) {
      expect(call.started).toBe(true);
      expect(call.handlers['execution:overlap']).toBeTypeOf('function');
    }

    handle.stop();
    for (const call of jobCalls) {
      expect(call.stopped).toBe(true);
    }
  });

  it('warns on the overlap event with the job binding', () => {
    const { log, records } = makeFakeLogger();
    const { mod, calls } = makeFakeScheduler();

    registerStubJobs(log, mod);
    for (const call of calls) {
      call.handlers['execution:overlap']?.();
    }

    const warnings = records.filter((r) => r.level === 'warn');
    expect(warnings).toHaveLength(4);
    expect(warnings.map((w) => w.bindings['job']).sort()).toEqual(
      [...STUB_JOBS.map((j) => j.name)].sort(),
    );
    for (const warning of warnings) {
      expect(warning.msg).toMatch(/previous run pending/);
    }
  });

  it('registers the required per-job cadence and jitter table', () => {
    expect(STUB_JOBS.map((j) => [j.name, j.expression, j.maxRandomDelayMs])).toEqual([
      ['events-stub', '*/20 * * * *', 5 * 60_000],
      ['jobs-stub', '*/45 * * * *', 10 * 60_000],
      ['local-stub', '0 */3 * * *', 20 * 60_000],
      ['social-stub', '0 * * * *', 25 * 60_000],
    ]);
  });
});

describe('boot assertion', () => {
  it('passes on the installed registry scheduler build', () => {
    expect(() => assertSchedulerGuards(cron)).not.toThrow();
  });

  it('fails on a scheduler build lacking schedule/validate', () => {
    expect(() => assertSchedulerGuards({} as SchedulerModule)).toThrow(/scheduler-guard/);
    // NOTE: explicit undefined selects the default (real cron) parameter — by
    // design. A null build must still fail loudly.
    expect(() => assertSchedulerGuards(null as unknown as SchedulerModule)).toThrow(
      /scheduler-guard/,
    );
  });

  it('fails on a scheduler build whose tasks lack the overlap-event API', () => {
    const broken = {
      validate: () => true,
      schedule: () => ({ start: () => undefined, stop: () => undefined }),
    } as unknown as SchedulerModule;
    expect(() => assertSchedulerGuards(broken)).toThrow(/scheduler-guard/);
  });

  it('fails when the build rejects a stub expression', () => {
    const { mod } = makeFakeScheduler();
    const rejecting = { ...mod, validate: () => false };
    expect(() => assertSchedulerGuards(rejecting)).toThrow(/scheduler-guard/);
  });
});
