// System: uptime, SSE viewers, GC marker, event volume, and scheduler jobs.
import { describe, expect, it } from 'vitest';
import { handleSystem } from './system.js';

const NOW = Date.UTC(2026, 10, 10, 12, 0, 0);

function at(minutesAgo: number): string {
  return new Date(NOW - minutesAgo * 60_000).toISOString();
}

function schedulerEvent(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: `evt-${Math.random()}`,
    created: at(2),
    agent: 'scheduler',
    event_type: 'scheduler',
    tool: 'scheduler.tick',
    status: 'ok',
    duration_ms: 430,
    meta: { job: 'portal-ctftime' },
    ...overrides,
  };
}

function makeRes() {
  const state = { status: 0, body: '' };
  return {
    state,
    writeHead(status: number) {
      state.status = status;
    },
    end(body?: string) {
      state.body = body ?? '';
    },
  };
}

describe('handleSystem', () => {
  it('composes uptime, hub stats, GC age, volume, and latest job per name', async () => {
    const res = makeRes();
    const pb = {
      collection: (name: string) => {
        if (name === 'agent_telemetry') {
          return {
            getFirstListItem: async () => ({ detail: at(180) }),
          };
        }
        return {
          getList: async (_page: number, perPage: number) => {
            if (perPage === 1) {
              return {
                items: [schedulerEvent({ id: 'latest', created: at(1) })],
                totalItems: 42,
              };
            }
            return {
              items: [
                schedulerEvent({ id: 'ctftime-new', created: at(1), status: 'ok' }),
                schedulerEvent({
                  id: 'clist',
                  created: at(2),
                  meta: { job: 'portal-clist' },
                  status: 'error',
                  detail: 'HTTP 503',
                }),
                schedulerEvent({
                  id: 'ctftime-old',
                  created: at(8),
                  status: 'error',
                  detail: 'old failure',
                }),
              ],
            };
          },
        };
      },
    };

    await handleSystem(res, {
      pb,
      hub: { size: 1, capacity: 2, lastEventAgeMs: 1500 },
      nowMs: NOW,
    });

    expect(res.state.status).toBe(200);
    const body = JSON.parse(res.state.body);
    expect(body.ts).toBe(NOW);
    expect(body.uptimeSec).toBeGreaterThan(0);
    expect(typeof body.node).toBe('string');
    expect(body.memory.rssMb).toBeGreaterThan(0);
    expect(body.sse).toEqual({ viewers: 1, capacity: 2, lastEventAgeMs: 1500 });
    expect(body.gc.lastSuccessMs).toBe(Date.parse(at(180)));
    expect(body.gc.ageMs).toBe(180 * 60_000);
    expect(body.events).toEqual({ retained: 42, latestAt: at(1) });
    expect(body.jobs).toHaveLength(2);
    expect(body.jobs[0]).toMatchObject({
      name: 'portal-ctftime',
      lastStatus: 'ok',
      lastAt: at(1),
    });
    expect(body.jobs.find((j: any) => j.name === 'portal-clist')).toMatchObject({
      lastStatus: 'error',
      detail: 'HTTP 503',
    });
  });

  it('tolerates a missing GC marker', async () => {
    const res = makeRes();
    const pb = {
      collection: (name: string) => {
        if (name === 'agent_telemetry') {
          return {
            getFirstListItem: async () => {
              throw new Error('not found');
            },
          };
        }
        return {
          getList: async () => ({ items: [], totalItems: 0 }),
        };
      },
    };
    await handleSystem(res, {
      pb,
      hub: { size: 0, capacity: 2, lastEventAgeMs: 0 },
      nowMs: NOW,
    });
    const body = JSON.parse(res.state.body);
    expect(body.gc).toEqual({ lastSuccessMs: null, ageMs: null });
    expect(body.jobs).toEqual([]);
    expect(body.events.latestAt).toBeNull();
  });

  it('returns 503 when the hot store fails', async () => {
    const res = makeRes();
    await handleSystem(res, {
      pb: {
        collection: () => ({
          getList: async () => {
            throw new Error('down');
          },
        }),
      },
      hub: { size: 0, capacity: 2, lastEventAgeMs: 0 },
    });
    expect(res.state.status).toBe(503);
  });
});
