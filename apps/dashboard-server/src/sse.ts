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
//
// machine_events rides the same SSE connection: each coalesced delta carries
// the new tool-call rows since the previous push, and slot activity is enriched
// from those rows (current tool, last event time, start time).

import { type MachineEventDto, toMachineEventDto } from './machine.js';

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
  /** Slot id / worker name (e.g. "auditor-events-1"). */
  agent?: string;
  /** When the current active run started (ISO). */
  startedAt?: string | null;
  /** Last machine event observed for this slot (ISO). */
  lastEventAt?: string | null;
  /** Concrete tool the slot is running right now. */
  currentTool?: string;
  /** Truncated last detail line. */
  detail?: string;
};

type InternalSlot = SseSlot & { slotKey: string };

export function bucketStateFrom(status: string, detail: string): string {
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
  private slots: InternalSlot[];
  private readonly viewerCap: number;
  /** Newest-first rolling tail of machine_events (last 200 rows). */
  private machineEvents: MachineEventDto[] = [];
  /** Rows observed since the previous coalesced push (newest-first). */
  private pendingEvents: MachineEventDto[] = [];
  private readonly subscriptions: Array<{ unsubscribe?: () => void }> = [];

  constructor(
    private readonly pb: PbLike,
    private readonly log: LogLike,
    bucketStates: BucketStateSnapshot[] = [],
    slots: SseSlot[] = [],
    viewerCap: number = 2,
  ) {
    this.bucketStates = bucketStates;
    this.slots = slots.map((slot) => toInternalSlot(slot));
    this.viewerCap = Number.isFinite(viewerCap) && viewerCap > 0 ? Math.floor(viewerCap) : 2;
  }

  /** Replace bucket states (called when the BucketRegistry state changes). */
  setBucketStates(states: BucketStateSnapshot[]): void {
    this.bucketStates = states;
  }

  /** Replace agent slots (called when telemetry rows change). */
  setSlots(slots: SseSlot[]): void {
    this.slots = slots.map((slot) => toInternalSlot(slot));
  }

  get capacity(): number {
    return this.viewerCap;
  }

  hasCapacity(): boolean {
    return this.clients.size < this.viewerCap;
  }

  /** Load the latest telemetry + machine events so the dashboard has a snapshot. */
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

    // machine_events is newer than some bootstrapped databases: a missing
    // collection must not take telemetry hydration down with it.
    try {
      const eventsColl = this.pb.collection('machine_events');
      let rows: PbRecord[] = [];
      if (typeof eventsColl.getList === 'function') {
        const page = await eventsColl.getList(1, 200, { sort: '-created' });
        rows = page.items ?? [];
      } else if (typeof eventsColl.getFullList === 'function') {
        rows = await eventsColl.getFullList({ sort: '-created' });
      }
      // Apply oldest first so the rolling tail ends up newest-first and slot
      // activity reflects the latest tool call.
      for (const row of [...rows].reverse()) this.applyMachineRow(row, false);
    } catch (err) {
      this.log.warn({ err: String(err) }, 'SSE machine-event hydration failed');
    }
  }

  /** Subscribe once to each collection, hydrate state, then start timers. */
  start(): void {
    this.subscribe('agent_telemetry', (event) => this.onTelemetryEvent(event));
    this.subscribe('opportunities', () => {
      this.lastEventTime = Date.now();
    });
    this.subscribe('machine_events', (event) => this.onMachineEvent(event));
    void this.hydrate();
    // Coalesced push every ~2s: fast enough for the glass feed, still one
    // payload per viewer regardless of upstream event rate.
    this.pushTimer = setInterval(() => this.pushDelta(), 2000);
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
    for (const subscription of this.subscriptions) {
      try {
        subscription.unsubscribe?.();
      } catch {
        // Stop must never throw during shutdown.
      }
    }
    this.subscriptions.length = 0;
    this.clients.clear();
  }

  /** Subscribe defensively: fake PB clients in tests may not implement it. */
  private subscribe(name: string, handler: (event: unknown) => void): void {
    try {
      const coll = this.pb.collection(name);
      if (typeof coll.subscribe !== 'function') return;
      this.subscriptions.push(coll.subscribe('*', handler));
    } catch (err) {
      this.log.warn({ err: String(err), collection: name }, 'SSE subscription failed');
    }
  }

  private onTelemetryEvent(event: unknown): void {
    this.lastEventTime = Date.now();
    const record = extractRecord(event);
    if (record) this.applyTelemetryRow(record);
  }

  private onMachineEvent(event: unknown): void {
    this.lastEventTime = Date.now();
    const record = extractRecord(event);
    if (record) this.applyMachineRow(record, true);
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
    const at = String(row.updated ?? row.created ?? new Date().toISOString());

    // Slot ticker: keep the most recent entry per slot id (fall back to bucket).
    const slotKey = slot || `${provider}:${model}`;
    const existing = this.slots.find((s) => s.slotKey === slotKey);
    const startedAt =
      status === 'active' && existing?.status !== 'active'
        ? at
        : (existing?.startedAt ?? null);
    const nextSlot: InternalSlot = {
      provider,
      model,
      step,
      status,
      batonPass: batonPass ?? null,
      slotKey,
      agent: existing?.agent || slot,
      startedAt,
      lastEventAt: at,
      currentTool: existing?.currentTool ?? '',
      detail,
    };
    const without = this.slots.filter((s) => s.slotKey !== slotKey);
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

  /**
   * Add one machine event to the rolling tail and enrich the matching slot.
   * `pending` rows are also queued for the next SSE delta; hydration rows are
   * not (the page has already fetched history over /api/machine/events).
   */
  private applyMachineRow(row: PbRecord, pending: boolean): void {
    const event = toMachineEventDto(row);
    const key =
      event.id ||
      `${event.created}|${event.agent}|${event.tool}|${event.status}|${event.trace_id}`;
    if (
      this.machineEvents.some(
        (existing) =>
          (existing.id && existing.id === event.id) ||
          `${existing.created}|${existing.agent}|${existing.tool}|${existing.status}|${existing.trace_id}` ===
            key,
      )
    ) {
      return;
    }

    this.machineEvents = [event, ...this.machineEvents].slice(0, 200);
    if (pending) {
      this.pendingEvents = [event, ...this.pendingEvents].slice(0, 100);
    }

    this.enrichSlotFromEvent(event);
  }

  private enrichSlotFromEvent(event: MachineEventDto): void {
    let index = this.slots.findIndex((slot) => event.agent && slot.slotKey === event.agent);
    if (index < 0 && !event.agent && event.provider && event.model) {
      index = this.slots.findIndex(
        (slot) => slot.provider === event.provider && slot.model === event.model,
      );
    }

    const status = machineStatusToSlot(event.status);
    if (index < 0) {
      if (!SLOT_EVENT_TYPES.has(event.event_type)) return;
      const slotKey = event.agent || `${event.provider}:${event.model}`;
      if (!slotKey || slotKey === ':') return;
      this.slots = [
        ...this.slots,
        {
          provider: event.provider,
          model: event.model,
          step: event.step,
          status,
          batonPass: batonPassFromEvent(event),
          slotKey,
          agent: event.agent,
          startedAt: status === 'active' ? event.created : null,
          lastEventAt: event.created,
          currentTool: event.tool,
          detail: event.detail || event.output_summary,
        },
      ].slice(-20);
      return;
    }

    const slot = this.slots[index];
    const nextStatus = status;
    slot.provider = slot.provider || event.provider;
    slot.model = slot.model || event.model;
    slot.step = event.step || slot.step;
    slot.status = nextStatus;
    slot.agent = slot.agent || event.agent;
    slot.currentTool = event.tool;
    slot.lastEventAt = event.created;
    slot.detail = event.detail || event.output_summary || slot.detail;
    if (nextStatus === 'active' && slot.startedAt == null) slot.startedAt = event.created;
    if (event.baton_to) slot.batonPass = batonPassFromEvent(event);
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
        agent: s.agent || s.slotKey,
        startedAt: s.startedAt ?? null,
        lastEventAt: s.lastEventAt ?? null,
        currentTool: s.currentTool ?? '',
        detail: s.detail ?? '',
      })),
      events: this.pendingEvents,
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
    // Rows are delivered once per coalesced push; new subscribers get history
    // from /api/machine/events rather than replaying the pending buffer.
    this.pendingEvents = [];
  }

  private pushHeartbeat(): void {
    const payload = `data: ${JSON.stringify({ type: 'heartbeat', ts: Date.now() })}\n\n`;
    for (const client of this.clients) this.sendTo(client, payload);
  }
}

// Event types that represent worker activity worth showing in the slot reel.
// Scheduler/GC/system/db rows stay in the rolling event feed only.
const SLOT_EVENT_TYPES = new Set([
  'scout',
  'dedup',
  'fetch',
  'sanitize',
  'scratchpad',
  'llm',
  'orchestrator',
  'discord',
]);

function extractRecord(event: unknown): PbRecord | null {
  const envelope = event as { record?: PbRecord; data?: PbRecord } | PbRecord | null;
  if (!envelope || typeof envelope !== 'object') return null;
  if ('record' in envelope && envelope.record && typeof envelope.record === 'object') {
    return envelope.record as PbRecord;
  }
  if ('data' in envelope && envelope.data && typeof envelope.data === 'object') {
    return envelope.data as PbRecord;
  }
  return envelope as PbRecord;
}

function toInternalSlot(slot: SseSlot): InternalSlot {
  const slotKey = slot.agent || `${slot.provider}:${slot.model}`;
  return {
    ...slot,
    slotKey,
    agent: slot.agent || slotKey,
    startedAt: slot.startedAt ?? null,
    lastEventAt: slot.lastEventAt ?? null,
    currentTool: slot.currentTool ?? '',
    detail: slot.detail ?? '',
  };
}

function machineStatusToSlot(status: string): string {
  if (status === 'start') return 'active';
  if (status === 'error') return 'error';
  if (status === 'cooldown') return 'cooldown';
  return 'done';
}

function batonPassFromEvent(event: MachineEventDto): SseSlot['batonPass'] {
  if (!event.baton_to) return null;
  const from = event.provider && event.model ? `${event.provider}:${event.model}` : event.provider;
  const reason =
    event.meta && typeof event.meta['reason'] === 'string'
      ? event.meta['reason']
      : event.status;
  return { from: from || event.agent, to: event.baton_to, reason };
}
