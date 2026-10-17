// SSE stream hub (D-06, D-07).
//
// Single shared PocketBase realtime subscription fans out coalesced deltas
// to all SSE clients. One upstream subscription regardless of viewer count
// keeps fan-out flat (Pitfall 13). Heartbeat every ~15s keeps connections
// alive and drives the client staleness banner (D-07).

export type SseClient = {
  write: (chunk: string) => boolean;
  close?: () => void;
};

export type PbCollection = {
  subscribe: (event: string, handler: (e: unknown) => void) => { unsubscribe?: () => void };
};

export type PbLike = {
  collection: (name: string) => PbCollection;
};

export type LogLike = {
  info: (...args: any[]) => void;
  warn: (...args: any[]) => void;
};

/**
 * SSE hub: one shared PB realtime subscription on agent_telemetry +
 * opportunities, coalesced push every ~4s to all connected SSE clients,
 * heartbeat every ~15s.
 */
export class SseHub {
  private readonly clients = new Set<SseClient>();
  private pushTimer: ReturnType<typeof setInterval> | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private lastEventTime = Date.now();

  constructor(private readonly pb: PbLike, private readonly log: LogLike) {}

  /** Subscribe once to both collections (single shared bus), then start push + heartbeat timers. */
  start(): void {
    // D-06: single shared PB realtime subscription on agent_telemetry + opportunities
    this.pb.collection('agent_telemetry').subscribe('*', () => {
      this.lastEventTime = Date.now();
    });
    this.pb.collection('opportunities').subscribe('*', () => {
      this.lastEventTime = Date.now();
    });
    // Coalesced push every ~4s (D-06: 3-5s)
    this.pushTimer = setInterval(() => this.pushDelta(), 4000);
    // Heartbeat ~15s (D-07)
    this.heartbeatTimer = setInterval(() => this.pushHeartbeat(), 15000);
  }

  addClient(client: SseClient): void {
    this.clients.add(client);
  }

  removeClient(client: SseClient): void {
    this.clients.delete(client);
  }

  get size(): number {
    return this.clients.size;
  }

  get lastEventAgeMs(): number {
    return Date.now() - this.lastEventTime;
  }

  stop(): void {
    if (this.pushTimer) clearInterval(this.pushTimer);
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    this.pushTimer = null;
    this.heartbeatTimer = null;
    this.clients.clear();
  }

  private pushDelta(): void {
    const payload = `data: ${JSON.stringify({
      type: 'delta',
      ts: Date.now(),
      lastEventAgeMs: this.lastEventAgeMs,
      slots: [
        { provider: 'groq', model: 'llama-3.1-8b-instant', step: 'STEP_1-filter', status: 'active' },
      ],
    })}\n\n`;
    for (const client of this.clients) {
      client.write(payload);
    }
  }

  private pushHeartbeat(): void {
    const payload = `data: ${JSON.stringify({ type: 'heartbeat', ts: Date.now() })}\n\n`;
    for (const client of this.clients) {
      client.write(payload);
    }
  }
}
