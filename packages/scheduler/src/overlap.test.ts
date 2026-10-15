// Scheduler tests: registry proof (Task 1) + forced-overlap/metrics/sizing (Task 2).
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import cron, { type ScheduledTask, type TaskFn } from 'node-cron';
import {
  assertSchedulerGuards,
  computeBufferHoldMiB,
  registerStubJobs,
  runStubTick,
  SCHEDULER_TIMEZONE,
  STUB_JOBS,
  type MetricsSink,
  type SchedulerModule,
  type TickLogger,
  type TickRecord,
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

describe('registry registers stub + portal jobs', () => {
  it('schedules all STUB_JOBS with timezone, overlap guard, and jitter', () => {
    const { log } = makeFakeLogger();
    const { mod, calls } = makeFakeScheduler();

    const handle = registerStubJobs(log, mod);

    // The boot probe ('guard-probe') also flows through schedule() — all jobs
    // in STUB_JOBS (4 stub + 7 portal) are the calls carrying job names.
    const jobCalls = calls.filter((c) => c.options['name'] !== 'guard-probe');
    expect(handle.tasks).toHaveLength(STUB_JOBS.length);
    expect(jobCalls).toHaveLength(STUB_JOBS.length);
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
    expect(warnings).toHaveLength(STUB_JOBS.length);
    expect(warnings.map((w) => w.bindings['job']).sort()).toEqual(
      [...STUB_JOBS.map((j) => j.name)].sort(),
    );
    for (const warning of warnings) {
      expect(warning.msg).toMatch(/previous run pending/);
    }
  });

  it('registers the required per-job cadence and jitter table', () => {
    const table = STUB_JOBS.map((j) => [j.name, j.expression, j.maxRandomDelayMs]);
    // 4 stub jobs + 7 portal jobs = 11 total
    expect(table).toHaveLength(11);
    // All portal jobs have maxRandomDelayMs = 5 minutes
    for (const row of table) {
      if (String(row[0]).startsWith('portal-')) {
        expect(row[2]).toBe(5 * 60_000);
      }
    }
    // Stub jobs retain their original cadence
    const names = table.map((row) => row[0]);
    expect(names).toContain('events-stub');
    expect(names).toContain('jobs-stub');
    expect(names).toContain('local-stub');
    expect(names).toContain('social-stub');
    expect(names).toContain('portal-ctftime');
    expect(names).toContain('portal-clist');
    expect(names).toContain('portal-unstop');
    expect(names).toContain('portal-devfolio');
    expect(names).toContain('portal-devpost');
    expect(names).toContain('portal-luma');
    expect(names).toContain('portal-meetup');
    // Portal expressions staggered across 15-30m window
    const portalExprs = table
      .filter(([name]) => String(name).startsWith('portal-'))
      .map(([, expr]) => expr);
    expect(portalExprs.sort()).toEqual([
      '*/15 * * * *',
      '*/15 * * * *',
      '*/20 * * * *',
      '*/20 * * * *',
      '*/25 * * * *',
      '*/25 * * * *',
      '*/30 * * * *',
    ].sort());
  });
});

describe('boot assertion', () => {  it('passes on the installed registry scheduler build', () => {
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

describe('forced overlap proof (D-27)', () => {
  it(
    'a one-second job with a three-second handler emits overlap and completes exactly one run per window',
    async () => {
      let completions = 0;
      let overlaps = 0;
      const task = cron.schedule(
        '* * * * * *',
        async () => {
          await new Promise((resolve) => setTimeout(resolve, 3000));
          completions += 1;
        },
        { name: 'overlap-drill', timezone: 'Asia/Kolkata', noOverlap: true },
      );
      task.on('execution:overlap', () => {
        overlaps += 1;
      });
      task.start();
      try {
        const deadline = Date.now() + 9000;
        while (completions === 0 && Date.now() < deadline) {
          await new Promise((resolve) => setTimeout(resolve, 100));
        }
        // Second tick skipped while the first was pending: exactly one
        // completion, at least one overlap event.
        expect(completions).toBe(1);
        expect(overlaps).toBeGreaterThanOrEqual(1);
      } finally {
        await task.stop();
        await task.destroy();
      }
    },
    15000,
  );
});

describe('stub tick metrics sink', () => {
  it('writes start and done records with durationMs to the injected sink', async () => {
    const { log } = makeFakeLogger();
    const records: TickRecord[] = [];
    const sink: MetricsSink = {
      record: (record) => {
        records.push(record);
      },
    };

    const outcome = await runStubTick(STUB_JOBS[0] as (typeof STUB_JOBS)[number], log, { sink });

    expect(records.map((r) => r.phase)).toEqual(['start', 'done']);
    expect(records[0]?.job).toBe('events-stub');
    const done = records[1] as TickRecord;
    expect(done.job).toBe('events-stub');
    expect(typeof done.durationMs).toBe('number');
    expect(done.durationMs as number).toBeGreaterThanOrEqual(0);
    expect(done.durationMs).toBe(outcome.durationMs);
  });

  it('writes a heartbeat file when a directory is configured', async () => {
    const { log } = makeFakeLogger();
    const dir = join(tmpdir(), `sched-heartbeat-${Date.now()}`);

    await runStubTick(STUB_JOBS[0] as (typeof STUB_JOBS)[number], log, { heartbeatDir: dir });

    const body = JSON.parse(
      readFileSync(join(dir, 'events-stub.heartbeat'), 'utf8'),
    ) as { job: string; at: string; durationMs: number };
    expect(body.job).toBe('events-stub');
    expect(typeof body.durationMs).toBe('number');
    expect(Number.isNaN(Date.parse(body.at))).toBe(false);
  });
});

describe('buffer sizing helper', () => {
  it('computes a hold that keeps baseline inside the 22-30% band on the sizing fixtures', () => {
    const fixtures: Array<[totalMiB: number, freeMiB: number]> = [
      [10240, 9984],
      [6144, 5632],
      [4096, 3900],
    ];
    for (const [total, free] of fixtures) {
      const hold = computeBufferHoldMiB(total, free);
      expect(hold).toBeGreaterThan(0);
      const baseline = (total - free + hold) / total;
      expect(baseline).toBeGreaterThanOrEqual(0.22);
      expect(baseline).toBeLessThanOrEqual(0.3);
    }
  });

  it('holds nothing when memory is already tight', () => {
    expect(computeBufferHoldMiB(4096, 100)).toBe(0);
  });

  it('rejects non-positive totals', () => {
    expect(() => computeBufferHoldMiB(0, 0)).toThrow();
  });
});
