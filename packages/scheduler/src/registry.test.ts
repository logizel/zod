// Gateway scheduler registry tests — gateway bucket timers via single cron registry.
// No setInterval scatter; every job carries noOverlap + maxRandomDelay jitter.
import { describe, expect, it } from 'vitest';
import cron from 'node-cron';
import {
  assertSchedulerGuards,
  GATEWAY_JOBS,
  registerGatewayJobs,
  registerStubJobs,
  runGatewayTick,
  SCHEDULER_TIMEZONE,
  type MetricsSink,
  type SchedulerModule,
  type TickLogger,
  type TickRecord,
} from './registry.js';

/** In-memory TickLogger: records every call with its child bindings. */
function makeFakeLogger(): { log: TickLogger; records: any[] } {
  const records: any[] = [];
  const build = (bindings: Record<string, unknown> = {}): TickLogger => ({
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
  return { log: build({}), records };
}

interface CapturedSchedule {
  expression: string;
  options: Record<string, unknown>;
  handlers: Record<string, () => void>;
  started: boolean;
  stopped: boolean;
}

/** Fake scheduler module capturing every schedule() call for value assertions. */
function makeFakeScheduler(): { mod: SchedulerModule; calls: CapturedSchedule[] } {
  const calls: CapturedSchedule[] = [];
  const mod: SchedulerModule = {
    validate: () => true,
    schedule: (expression: string, _fn: unknown, options: Record<string, unknown> = {}) => {
      const call: CapturedSchedule = {
        expression,
        options,
        handlers: {},
        started: false,
        stopped: false,
      };
      calls.push(call);
      return {
        on: (_event: string, handler: () => void) => {
          call.handlers[_event] = handler;
        },
        start: () => {
          call.started = true;
        },
        stop: () => {
          call.stopped = true;
        },
        destroy: () => undefined,
      } as never;
    },
  };
  return { mod, calls };
}

describe('gateway jobs registered via single registry', () => {
  it('schedules exactly the three gateway jobs with timezone, overlap guard, and jitter', () => {
    const { log } = makeFakeLogger();
    const { mod, calls } = makeFakeScheduler();

    const handle = registerGatewayJobs(log, mod);

    const jobCalls = calls.filter((c) => c.options['name'] !== 'guard-probe');
    expect(handle.tasks).toHaveLength(GATEWAY_JOBS.length);
    expect(jobCalls).toHaveLength(GATEWAY_JOBS.length);
    expect(jobCalls.map((c) => c.options['name'])).toEqual(
      GATEWAY_JOBS.map((j) => j.name),
    );
    expect(jobCalls.map((c) => c.expression)).toEqual(
      GATEWAY_JOBS.map((j) => j.expression),
    );
    for (const [index, call] of jobCalls.entries()) {
      expect(call.options['timezone']).toBe(SCHEDULER_TIMEZONE);
      expect(call.options['timezone']).toBe('Asia/Kolkata');
      expect(call.options['noOverlap']).toBe(true);
      expect(call.options['maxRandomDelay']).toBe(
        GATEWAY_JOBS[index]?.maxRandomDelayMs,
      );
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

  it('gateway job expressions are valid cron (assertSchedulerGuards passes)', () => {
    expect(() => assertSchedulerGuards(cron)).not.toThrow();
    for (const def of GATEWAY_JOBS) {
      expect(cron.validate(def.expression)).toBe(true);
    }
  });

  it('fails when the scheduler build rejects a gateway expression', () => {
    const { mod } = makeFakeScheduler();
    const rejecting = { ...mod, validate: () => false };
    expect(() => assertSchedulerGuards(rejecting)).toThrow(/scheduler-guard/);
  });

  it('gateway job table has noOverlap + jitter on every entry', () => {
    for (const def of GATEWAY_JOBS) {
      expect(def.maxRandomDelayMs).toBeGreaterThan(0);
      expect(def.expression).toBeTruthy();
      expect(def.name).toMatch(/^gateway-/);
    }
  });
});

describe('runGatewayTick', () => {
  it('records start + done to the sink and calls tickHandler', async () => {
    const records: TickRecord[] = [];
    const sink: MetricsSink = { record: (r) => records.push(r) };
    let handlerCalled = false;
    const log = makeFakeLogger().log;

    await runGatewayTick(GATEWAY_JOBS[0], log, {
      sink,
      tickHandler: (_def, _log) => {
        handlerCalled = true;
      },
    });

    expect(handlerCalled).toBe(true);
    expect(records.map((r) => r.phase)).toEqual(['start', 'done']);
    expect(records[0]?.job).toBe('gateway-bucket-cooldown');
  });

  it('tickHandler throw is caught and logged as warn, not propagated', async () => {
    const records: TickRecord[] = [];
    const sink: MetricsSink = { record: (r) => records.push(r) };
    const { log, records: logRecords } = makeFakeLogger();

    await runGatewayTick(GATEWAY_JOBS[0], log, {
      sink,
      tickHandler: () => {
        throw new Error('handler boom');
      },
    });

    expect(records.map((r) => r.phase)).toEqual(['start', 'done']);
    const warns = logRecords.filter((r: any) => r.level === 'warn');
    expect(warns.length).toBeGreaterThanOrEqual(1);
  });
});
