import { describe, expect, it } from 'vitest';
import {
  MachineEventWriter,
  flushMachineEvents,
  recordMachineEvent,
  truncate,
  type MachineEventPb,
} from './machine-events.js';

type FakePb = MachineEventPb & {
  rows: Array<Record<string, unknown>>;
  maxInFlight: number;
  inFlight: number;
};

function makeFakePb(delayMs = 0): FakePb {
  const state: FakePb = {
    rows: [],
    maxInFlight: 0,
    inFlight: 0,
    collection: () => ({
      create: async (data: Record<string, unknown>) => {
        state.inFlight += 1;
        state.maxInFlight = Math.max(state.maxInFlight, state.inFlight);
        if (delayMs > 0) await new Promise((resolve) => setTimeout(resolve, delayMs));
        state.rows.push(data);
        state.inFlight -= 1;
        return data;
      },
    }),
  };
  return state;
}

function baseEvent(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    agent: 'auditor-events-1',
    event_type: 'llm',
    tool: 'groq.chat',
    status: 'ok',
    ...overrides,
  };
}

describe('MachineEventWriter', () => {
  it('writes one row with schema defaults applied', async () => {
    const pb = makeFakePb();
    const writer = new MachineEventWriter(pb, { flushDelayMs: 10_000 });
    writer.record(baseEvent({ trace_id: 'trace-1', provider: 'groq', model: 'llama' }));
    await writer.drain();

    expect(pb.rows).toHaveLength(1);
    expect(pb.rows[0]).toMatchObject({
      trace_id: 'trace-1',
      agent: 'auditor-events-1',
      pipeline: '',
      event_type: 'llm',
      tool: 'groq.chat',
      provider: 'groq',
      model: 'llama',
      status: 'ok',
      url: '',
      baton_to: '',
      meta: {},
    });
  });

  it('truncates summaries, detail, and url', () => {
    expect(truncate('abcdefghij', 5)).toBe('abcde');
    expect(truncate('abcdefghijklmnopqrstuvwxyz', 20)).toContain('…[truncated]');
  });

  it('caps oversized fields on write', async () => {
    const pb = makeFakePb();
    const writer = new MachineEventWriter(pb, {
      flushDelayMs: 10_000,
      maxSummaryChars: 20,
      maxDetailChars: 30,
      maxUrlChars: 25,
    });
    writer.record(
      baseEvent({
        url: 'https://example.com/' + 'x'.repeat(100),
        input_summary: 'i'.repeat(100),
        output_summary: 'o'.repeat(100),
        detail: 'd'.repeat(100),
      }),
    );
    await writer.drain();

    const row = pb.rows[0];
    expect(String(row.url).length).toBeLessThanOrEqual(25);
    expect(String(row.input_summary).length).toBeLessThanOrEqual(20);
    expect(String(row.output_summary).length).toBeLessThanOrEqual(20);
    expect(String(row.detail).length).toBeLessThanOrEqual(30);
  });

  it('drops invalid events without throwing', async () => {
    const pb = makeFakePb();
    const errors: unknown[] = [];
    const writer = new MachineEventWriter(pb, {
      flushDelayMs: 10_000,
      onError: (error) => errors.push(error),
    });
    expect(() => writer.record({ agent: '', event_type: 'llm', tool: '', status: 'ok' })).not.toThrow();
    await writer.drain();

    expect(pb.rows).toHaveLength(0);
    expect(errors).toHaveLength(1);
  });

  it('drops the oldest rows when the queue cap is exceeded', async () => {
    const pb = makeFakePb();
    const writer = new MachineEventWriter(pb, { flushDelayMs: 10_000, maxQueue: 2 });
    writer.record(baseEvent({ trace_id: 'one' }));
    writer.record(baseEvent({ trace_id: 'two' }));
    writer.record(baseEvent({ trace_id: 'three' }));
    await writer.drain();

    expect(pb.rows.map((row) => row.trace_id)).toEqual(['two', 'three']);
  });

  it('honours the in-flight cap under a burst', async () => {
    const pb = makeFakePb(5);
    const writer = new MachineEventWriter(pb, {
      flushDelayMs: 0,
      maxInFlight: 3,
      maxQueue: 50,
    });
    for (let i = 0; i < 12; i += 1) writer.record(baseEvent({ trace_id: `t-${i}` }));
    await writer.drain();

    expect(pb.rows).toHaveLength(12);
    expect(pb.maxInFlight).toBeLessThanOrEqual(3);
  });

  it('withToolCall emits start + ok with duration and output summary', async () => {
    const pb = makeFakePb();
    const writer = new MachineEventWriter(pb, { flushDelayMs: 10_000 });

    const result = await writer.withToolCall(
      { agent: 'fetch-1', event_type: 'fetch', tool: 'jina.reader', url: 'https://example.com' },
      async () => ({ markdown: '# hello' }),
    );
    await writer.drain();

    expect(result).toEqual({ markdown: '# hello' });
    expect(pb.rows).toHaveLength(2);
    expect(pb.rows[0]).toMatchObject({ status: 'start', tool: 'jina.reader' });
    expect(pb.rows[1]).toMatchObject({ status: 'ok', tool: 'jina.reader' });
    expect(typeof pb.rows[1].duration_ms).toBe('number');
    expect(String(pb.rows[1].output_summary)).toContain('hello');
  });

  it('withToolCall emits an error row and rethrows', async () => {
    const pb = makeFakePb();
    const writer = new MachineEventWriter(pb, { flushDelayMs: 10_000 });

    await expect(
      writer.withToolCall(
        { agent: 'fetch-1', event_type: 'fetch', tool: 'jina.reader' },
        async () => {
          throw new Error('boom');
        },
      ),
    ).rejects.toThrow('boom');
    await writer.drain();

    expect(pb.rows).toHaveLength(2);
    expect(pb.rows[1]).toMatchObject({ status: 'error' });
    expect(String(pb.rows[1].detail)).toContain('boom');
  });

  it('never throws from record when PocketBase create fails', async () => {
    const errors: unknown[] = [];
    const pb: MachineEventPb = {
      collection: () => ({
        create: async () => {
          throw new Error('PB down');
        },
      }),
    };
    const writer = new MachineEventWriter(pb, {
      flushDelayMs: 10_000,
      onError: (error) => errors.push(error),
    });

    expect(() => writer.record(baseEvent())).not.toThrow();
    await expect(writer.drain()).resolves.toBeUndefined();
    expect(errors).toHaveLength(1);
  });

  it('shared recordMachineEvent/flushMachineEvents round-trips', async () => {
    const pb = makeFakePb();
    recordMachineEvent(pb, baseEvent({ trace_id: 'shared' }));
    await flushMachineEvents(pb);

    expect(pb.rows).toHaveLength(1);
    expect(pb.rows[0].trace_id).toBe('shared');
  });
});
