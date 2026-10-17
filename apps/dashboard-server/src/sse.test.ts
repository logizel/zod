// SSE hub tests (D-06, D-07): single-subscription fan-out, coalesced push,
// heartbeat. PocketBase is faked — no live server required.

import { describe, expect, it } from 'vitest';
import { SseHub } from './sse.js';

type PbLike = {
  collection: (name: string) => {
    subscribe: (event: string, handler: (e: unknown) => void) => { unsubscribe?: () => void };
  };
};

type LogLike = { info: (...args: any[]) => void; warn: (...args: any[]) => void };

/** Fake PocketBase: captures subscribe calls per collection. */
function makeFakePb(): PbLike & { subscriptions: Map<string, Map<string, Array<(e: unknown) => void>>> } {
  const subscriptions = new Map<string, Map<string, Array<(e: unknown) => void>>>();
  return {
    collection: (name: string) => {
      if (!subscriptions.has(name)) subscriptions.set(name, new Map());
      const subs = subscriptions.get(name)!;
      return {
        subscribe: (event: string, handler: (e: unknown) => void) => {
          let handlers = subs.get(event);
          if (!handlers) {
            handlers = [];
            subs.set(event, handlers);
          }
          handlers.push(handler);
          return { unsubscribe: () => undefined };
        },
      };
    },
    subscriptions,
  } as unknown as PbLike & {
    subscriptions: Map<string, Map<string, Array<(e: unknown) => void>>>;
  };
}

/** Fake SSE client: captures everything written to it. */
function makeFakeClient(): { write: (chunk: string) => boolean; written: string[] } {
  const written: string[] = [];
  return {
    write: (chunk: string) => {
      written.push(chunk);
      return true;
    },
    written,
  };
}

function makeLog(): LogLike & { infoCalls: any[]; warnCalls: any[] } {
  const infoCalls: any[] = [];
  const warnCalls: any[] = [];
  return {
    info: (...args: any[]) => infoCalls.push(args),
    warn: (...args: any[]) => warnCalls.push(args),
    infoCalls,
    warnCalls,
  } as unknown as LogLike & { infoCalls: any[]; warnCalls: any[] };
}

describe('SseHub', () => {
  it('subscribes once to both agent_telemetry and opportunities (single shared bus, D-06)', () => {
    const pb = makeFakePb();
    const hub = new SseHub(pb, makeLog());
    hub.start();

    const telemetrySubs = pb.subscriptions.get('agent_telemetry')?.get('*') ?? [];
    const opportunitiesSubs = pb.subscriptions.get('opportunities')?.get('*') ?? [];
    expect(telemetrySubs.length).toBe(1);
    expect(opportunitiesSubs.length).toBe(1);
    hub.stop();
  });

  it('tracks connected clients via addClient/removeClient', () => {
    const pb = makeFakePb();
    const hub = new SseHub(pb, makeLog());
    expect(hub.size).toBe(0);

    const clientA = makeFakeClient();
    const clientB = makeFakeClient();
    hub.addClient(clientA);
    hub.addClient(clientB);
    expect(hub.size).toBe(2);

    hub.removeClient(clientA);
    expect(hub.size).toBe(1);
    hub.removeClient(clientB);
    expect(hub.size).toBe(0);
  });

  it('pushes a coalesced delta containing a slot row to every connected client', () => {
    const pb = makeFakePb();
    const hub = new SseHub(
      pb,
      makeLog(),
      [],
      [{ provider: 'groq', model: 'llama-3.1-8b-instant', step: 'STEP_1-filter', status: 'active', batonPass: null }],
    );

    const clientA = makeFakeClient();
    const clientB = makeFakeClient();
    hub.addClient(clientA);
    hub.addClient(clientB);

    // Drive the push directly (same payload the ~4s timer emits).
    (hub as any).pushDelta();

    expect(clientA.written.length).toBe(1);
    expect(clientB.written.length).toBe(1);
    const parsedA = JSON.parse(clientA.written[0].replace(/^data: /, ''));
    expect(parsedA.type).toBe('delta');
    expect(Array.isArray(parsedA.slots)).toBe(true);
    expect(parsedA.slots[0]).toMatchObject({
      provider: 'groq',
      model: 'llama-3.1-8b-instant',
      step: 'STEP_1-filter',
      status: 'active',
    });
    // Both clients received the same coalesced delta.
    expect(clientA.written[0]).toBe(clientB.written[0]);
  });

  it('pushes a heartbeat event to every connected client (D-07)', () => {
    const pb = makeFakePb();
    const hub = new SseHub(pb, makeLog());

    const client = makeFakeClient();
    hub.addClient(client);

    (hub as any).pushHeartbeat();

    expect(client.written.length).toBe(1);
    const parsed = JSON.parse(client.written[0].replace(/^data: /, ''));
    expect(parsed.type).toBe('heartbeat');
    expect(typeof parsed.ts).toBe('number');
  });

  it('reports lastEventAgeMs after start (D-07 staleness driver)', () => {
    const pb = makeFakePb();
    const hub = new SseHub(pb, makeLog());
    hub.start();
    expect(typeof hub.lastEventAgeMs).toBe('number');
    expect(hub.lastEventAgeMs).toBeGreaterThanOrEqual(0);
    hub.stop();
  });
});

// ---------------------------------------------------------------------------
// Bucket states + 429 baton-pass slots (D-02, DSH-02, DSH-03)
// ---------------------------------------------------------------------------

describe('SseHub bucket states + 429 baton-pass slots', () => {
  it('delta includes bucketStates with READY/ACTIVE/60s-COOLDOWN/DAILY-CAP per bucket', () => {
    const pb = makeFakePb();
    const hub = new SseHub(
      pb,
      makeLog(),
      [
        { provider: 'groq', model: 'llama-3.1-8b-instant', state: 'READY' },
        { provider: 'cerebras', model: 'llama3.1-8b', state: 'ACTIVE' },
        { provider: 'sambanova', model: 'llama-3.3-70B', state: '60s-COOLDOWN' },
        { provider: 'mistral', model: 'mixtral-8x7b', state: 'DAILY-CAP' },
      ],
      [],
    );
    const client = makeFakeClient();
    hub.addClient(client);
    (hub as any).pushDelta();

    const parsed = JSON.parse(client.written[0].replace(/^data: /, ''));
    expect(Array.isArray(parsed.bucketStates)).toBe(true);
    expect(parsed.bucketStates.length).toBe(4);
    const states = parsed.bucketStates.map((b: any) => b.state);
    expect(states).toContain('READY');
    expect(states).toContain('ACTIVE');
    expect(states).toContain('60s-COOLDOWN');
    expect(states).toContain('DAILY-CAP');
    // Each bucket state carries provider + model for the health grid cell.
    const groq = parsed.bucketStates.find((b: any) => b.provider === 'groq' && b.model === 'llama-3.1-8b-instant');
    expect(groq.state).toBe('READY');
  });

  it('slots include 429 baton-pass transition markers between model buckets', () => {
    const pb = makeFakePb();
    const hub = new SseHub(
      pb,
      makeLog(),
      [],
      [
        {
          provider: 'groq',
          model: 'llama-3.1-8b-instant',
          step: 'STEP_3-audit',
          status: 'done',
          batonPass: { from: 'groq:llama-3.1-8b-instant', to: 'cerebras:llama3.1-8b', reason: '429' },
        },
        {
          provider: 'cerebras',
          model: 'llama3.1-8b',
          step: 'STEP_4-curate',
          status: 'active',
          batonPass: null,
        },
      ],
    );
    const client = makeFakeClient();
    hub.addClient(client);
    (hub as any).pushDelta();

    const parsed = JSON.parse(client.written[0].replace(/^data: /, ''));
    expect(Array.isArray(parsed.slots)).toBe(true);
    expect(parsed.slots.length).toBe(2);
    const first = parsed.slots[0];
    expect(first.provider).toBe('groq');
    expect(first.model).toBe('llama-3.1-8b-instant');
    expect(first.step).toBe('STEP_3-audit');
    expect(first.status).toBe('done');
    // 429 baton-pass marker present on the slot that handed off.
    expect(first.batonPass).toMatchObject({ reason: '429' });
    expect(first.batonPass.from).toBe('groq:llama-3.1-8b-instant');
    expect(first.batonPass.to).toBe('cerebras:llama3.1-8b');
    // Slot that received the baton has no outgoing 429 marker.
    expect(parsed.slots[1].batonPass).toBeNull();
  });

  it('delta carries both bucket states and slots together (single SSE event)', () => {
    const pb = makeFakePb();
    const hub = new SseHub(
      pb,
      makeLog(),
      [{ provider: 'groq', model: 'llama-3.1-8b-instant', state: 'READY' }],
      [{ provider: 'groq', model: 'llama-3.1-8b-instant', step: 'STEP_1-filter', status: 'active', batonPass: null }],
    );
    const client = makeFakeClient();
    hub.addClient(client);
    (hub as any).pushDelta();

    const parsed = JSON.parse(client.written[0].replace(/^data: /, ''));
    expect(parsed.type).toBe('delta');
    expect(typeof parsed.ts).toBe('number');
    expect(Array.isArray(parsed.bucketStates)).toBe(true);
    expect(Array.isArray(parsed.slots)).toBe(true);
    expect(parsed.bucketStates[0].state).toBe('READY');
    expect(parsed.slots[0].step).toBe('STEP_1-filter');
  });
});
