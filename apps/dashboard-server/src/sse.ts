// SSE stream hub (D-06, D-07).
//
// Single shared PocketBase realtime subscription fans out coalesced deltas
// to all SSE clients. One upstream subscription regardless of viewer count
// keeps fan-out flat (Pitfall 13). Heartbeat every ~15s keeps connections
// alive and drives the client staleness banner (D-07).
//
// State hydration: the hub loads the latest agent_telemetry rows at boot and
// applies every realtime telemetry record, so the pool-health grid and the
// agent-slot ticker are populated even before the first audit event.

export type SseClient = {
  write: (chunk: string) => boolean;
  close?: () => void;
  req?: { setTimeout: (ms: number) => void; on: (event: string, handler: () => void) => void };
};

export type PbRecord = Record<string, unknown>;

export type PbCollection = {
  subscribe: (event: string, handler: (e: unknown) => void) => { unsubscribe?: () => void };
  getList?: (
    page: number,
    perPage: number,
    options?: unknown,
  ) => Promise<{ items: PbRecord[] }>;
  getFullList?: (options?: unknown) => Promise<PbRecord[]>;
};

export type PbLike = {
  collection: (name: string) => PbCollection;
};

export type LogLike = {
  info: (...args: any[]) => void;
  warn: (...args: any[]) => void;
};

/** Per-bucket state snapshot for the health grid (DSH-03). */
export type BucketStateSnapshot = {
  provider: string;
  model: string;
  state: string; // READY | ACTIVE | 60s-COOLDOWN | DAILY-CAP
};

/** Agent slot with optional 429 baton-pass transition marker (DSH-02). */
export type SseSlot = {
  provider: string;
  model: string;
  step: string;
  status: string;
  batonPass?: { from: string; to: string; reason: string } | null;
};

function bucketStateFrom(status: string, detail: string): string {
  const haystack = `${status} ${detail}`.toLowerCase();
  if (haystack.includes('daily-cap') || haystack.includes('daily cap') || status === 'daily_cap') {
    return 'DAILY-CAP';
  }
  if (status === 'cooldown' || haystack.includes('cooldown')) return '60s-COOLDOWN';
  if (status === 'active') return 'ACTIVE';
  return 'READY';
}

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
  private bucketStates: BucketStateSnapshot[];
  private slots: SseSlot[];
  private readonly viewerCap: number;

  constructor(
    private readonly pb: PbLike,
    private readonly log: LogLike,
    bucketStates: BucketStateSnapshot[] = [],
    slots: SseSlot[] = [],
    viewerCap: number = 2,
  ) {
    this.bucketStates = bucketStates;
    this.slots = slots;
    this.viewerCap = Number.isFinite(viewerCap) && viewerCap > 0 ? Math.floor(viewerCap) : 2;
  }

  /** Replace bucket states (called when the BucketRegistry state changes). */
  setBucketStates(states: BucketStateSnapshot[]): void {
    this.bucketStates = states;
  }

  /** Replace agent slots (called when telemetry rows change). */
  setSlots(slots: SseSlot[]): void {
    this.slots = slots;
  }

  get capacity(): number {
    return this.viewerCap;
  }

  hasCapacity(): boolean {
    return this.clients.size < this.viewerCap;
  }

  /** Load the latest telemetry rows so the dashboard has an initial snapshot. */
  async hydrate(): Promise<void> {
    const coll = this.pb.collection('agent_telemetry');
    try {
      let rows: PbRecord[] = [];
      if (typeof coll.getList === 'function') {
        const page = await coll.getList(1, 200, { sort: '-updated' });
        rows = page.items ?? [];
      } else if (typeof coll.getFullList === 'function') {
        rows = await coll.getFullList({ sort: '-updated' });
      }
      // Oldest first so later rows win when we upsert per bucket.
      for (const row of [...rows].reverse()) this.applyTelemetryRow(row);
    } catch (err) {
      this.log.warn({ err: String(err) }, 'SSE telemetry hydration failed');
    }
  }

  /** Subscribe once to both collections, hydrate state, then start timers. */
  start(): void {
    this.pb.collection('agent_telemetry').subscribe('*', (event) => {
      this.onTelemetryEvent(event);
    });
    this.pb.collection('opportunities').subscribe('*', () => {
      this.lastEventTime = Date.now();
    });
    void this.hydrate();
    // Coalesced push every ~4s (D-06: 3-5s)
    this.pushTimer = setInterval(() => this.pushDelta(), 4000);
    // Heartbeat ~15s (D-07)
    this.heartbeatTimer = setInterval(() => this.pushHeartbeat(), 15000);
  }

  /**
   * Add a viewer and immediately send the current snapshot.
   * Returns false when the server-side viewer cap is reached (D-08).
   */
  addClient(client: SseClient, withSnapshot = true): boolean {
    if (!this.hasCapacity()) return false;
    this.clients.add(client);
    if (withSnapshot) this.sendTo(client, this.deltaPayload());
    return true;
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

  private onTelemetryEvent(event: unknown): void {
    this.lastEventTime = Date.now();
    const envelope = event as { record?: PbRecord; data?: PbRecord } | PbRecord | null;
    const record =
      envelope && typeof envelope === 'object' && 'record' in envelope && envelope.record
        ? envelope.record
        : envelope && typeof envelope === 'object' && 'data' in envelope && envelope.data
          ? envelope.data
          : (envelope as PbRecord | null);
    if (record && typeof record === 'object') this.applyTelemetryRow(record as PbRecord);
  }

  private applyTelemetryRow(row: PbRecord): void {
    const provider = String(row.provider ?? '');
    const model = String(row.model ?? '');
    if (!provider || !model) return;

    const slot = String(row.slot ?? '');
    const step = String(row.step ?? '');
    const status = String(row.status ?? '');
    const detail = String(row.detail ?? '');
    const batonPass = (row.batonPass ?? row.baton_pass ?? null) as SseSlot['batonPass'];

    // Slot ticker: keep the most recent entry per slot id (fall back to bucket).
    const slotKey = slot || `${provider}:${model}`;
    const nextSlot: SseSlot & { slotKey: string } = {
      provider,
      model,
      step,
      status,
      batonPass: batonPass ?? null,
      slotKey,
    };
    const without = this.slots.filter(
      (s) => `${(s as SseSlot & { slotKey?: string }).slotKey ?? `${s.provider}:${s.model}`}` !== slotKey,
    );
    this.slots = [...without, nextSlot].slice(-20);

    // Pool-health grid: latest state per provider × model bucket.
    const bucketKey = `${provider}:${model}`;
    const nextState: BucketStateSnapshot = {
      provider,
      model,
      state: bucketStateFrom(status, detail),
    };
    this.bucketStates = [
      ...this.bucketStates.filter((b) => `${b.provider}:${b.model}` !== bucketKey),
      nextState,
    ];
  }

  private deltaPayload(): string {
    return `data: ${JSON.stringify({
      type: 'delta',
      ts: Date.now(),
      lastEventAgeMs: this.lastEventAgeMs,
      bucketStates: this.bucketStates,
      slots: this.slots.map((s) => ({
        provider: s.provider,
        model: s.model,
        step: s.step,
        status: s.status,
        batonPass: s.batonPass ?? null,
      })),
    })}\n\n`;
  }

  private sendTo(client: SseClient, payload: string): void {
    try {
      client.write(payload);
    } catch {
      // Isolate: one bad client must not deny others
      this.clients.delete(client);
    }
  }

  private pushDelta(): void {
    const payload = this.deltaPayload();
    for (const client of this.clients) this.sendTo(client, payload);
  }

  private pushHeartbeat(): void {
    const payload = `data: ${JSON.stringify({ type: 'heartbeat', ts: Date.now() })}\n\n`;
    for (const client of this.clients) this.sendTo(client, payload);
  }
}
