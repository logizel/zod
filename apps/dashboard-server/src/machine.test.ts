// Machine event feed endpoint: filters, cursor pagination, failure modes.
import { describe, expect, it } from 'vitest';
import {
  buildMachineEventsFilter,
  handleMachineEvents,
  parseMachineEventsQuery,
  toMachineEventDto,
} from './machine.js';

function makeRes() {
  const state = {
    status: 0,
    headers: {} as Record<string, string>,
    body: '',
  };
  return {
    state,
    writeHead(status: number, headers: Record<string, string>) {
      state.status = status;
      state.headers = headers;
    },
    end(body?: string) {
      state.body = body ?? '';
    },
    json() {
      return JSON.parse(state.body);
    },
  };
}

function makeEventRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'evt-1',
    created: '2026-11-10T10:00:00.000Z',
    updated: '2026-11-10T10:00:00.000Z',
    trace_id: 'trace-1',
    agent: 'auditor-events-1',
    pipeline: 'events',
    event_type: 'llm',
    tool: 'groq.chat',
    provider: 'groq',
    model: 'llama-3.3-70b-versatile',
    step: 'STEP_3-audit',
    status: 'ok',
    duration_ms: 820,
    url: 'https://example.com/event',
    input_summary: 'in',
    output_summary: 'out',
    detail: 'detail',
    baton_to: '',
    meta: { verdict: 'admit' },
    ...overrides,
  };
}

describe('machine event query', () => {
  it('parses filters and applies defaults', () => {
    const query = parseMachineEventsQuery('?tool=groq.chat&status=ok&limit=25');
    expect(query).toMatchObject({ tool: 'groq.chat', status: 'ok', limit: 25 });
    expect(parseMachineEventsQuery('?provider=groq&model=llama').provider).toBe('groq');
    expect(parseMachineEventsQuery('').limit).toBe(100);
  });

  it('rejects unknown statuses and oversized limits', () => {
    expect(() => parseMachineEventsQuery('?status=banana')).toThrow();
    expect(() => parseMachineEventsQuery('?limit=500')).toThrow();
  });

  it('builds an escaped PocketBase filter', () => {
    const filter = buildMachineEventsFilter({
      cursor: '2026-11-10T10:00:00.000Z',
      tool: 'groq.chat',
      status: 'ok',
      pipeline: 'events',
      provider: 'groq',
      model: 'llama-3.3-70b',
      agent: 'auditor"1',
      event_type: 'llm',
      trace_id: 'trace-1',
      limit: 100,
    });
    expect(filter).toContain('created < "2026-11-10T10:00:00.000Z"');
    expect(filter).toContain('status = "ok"');
    expect(filter).toContain('provider = "groq"');
    expect(filter).toContain('agent = "auditor\\"1"');
    expect(filter.split(' && ')).toHaveLength(9);
  });

  it('maps rows to a stable DTO with null duration and object meta', () => {
    const dto = toMachineEventDto(
      makeEventRow({ duration_ms: null, meta: null, status: 'start' }),
    );
    expect(dto.duration_ms).toBeNull();
    expect(dto.meta).toEqual({});
    expect(dto.tool).toBe('groq.chat');
  });
});

describe('handleMachineEvents', () => {
  it('returns events plus a cursor when the page is full', async () => {
    const res = makeRes();
    const calls: unknown[] = [];
    const pb = {
      collection: () => ({
        getList: async (page: number, perPage: number, options: unknown) => {
          calls.push({ page, perPage, options });
          return { items: [makeEventRow()] };
        },
      }),
    };

    await handleMachineEvents({ url: '/api/machine/events?limit=1&status=ok' }, res, {
      pb,
      nowMs: 1234,
    });

    expect(res.state.status).toBe(200);
    const body = res.json();
    expect(body.ts).toBe(1234);
    expect(body.events).toHaveLength(1);
    expect(body.nextCursor).toBe('2026-11-10T10:00:00.000Z');
    expect(calls[0]).toMatchObject({
      page: 1,
      perPage: 1,
      options: { sort: '-created', filter: 'status = "ok"' },
    });
  });

  it('returns a null cursor when the page is not full', async () => {
    const res = makeRes();
    const pb = {
      collection: () => ({
        getList: async () => ({ items: [makeEventRow()] }),
      }),
    };

    await handleMachineEvents({ url: '/api/machine/events?limit=100' }, res, { pb });

    expect(res.json().nextCursor).toBeNull();
  });

  it('returns 400 for an invalid query', async () => {
    const res = makeRes();
    const pb = { collection: () => ({ getList: async () => ({ items: [] }) }) };
    await handleMachineEvents({ url: '/api/machine/events?status=nope' }, res, { pb });
    expect(res.state.status).toBe(400);
    expect(res.json().error).toContain('invalid');
  });

  it('returns 503 when PocketBase fails', async () => {
    const res = makeRes();
    const pb = {
      collection: () => ({
        getList: async () => {
          throw new Error('down');
        },
      }),
    };
    await handleMachineEvents({ url: '/api/machine/events' }, res, { pb });
    expect(res.state.status).toBe(503);
  });
});
