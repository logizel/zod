// machine_events writer — append-only fine-grained machinery log.
//
// The local Machine Glass page needs history, not just the latest bucket state.
// `agent_telemetry` is an upsert-per-slot snapshot; this module writes one row
// per machine operation (scheduler tick, fetch, sanitize, LLM attempt,
// orchestrator verdict, Discord post, ...) for the glass feed and trace view.
//
// Reliability contract:
// - Best-effort: a failed telemetry write must never fail a pipeline step.
// - Bounded: truncation caps + queue cap + in-flight cap keep bursts flat.
// - Buffered: rows flush after a short delay (or immediately under load), so a
//   single tick does not issue one HTTP request per event synchronously.

import * as z from 'zod';
import { MachineEvent } from './schema.js';

export interface MachineEventCollection {
  create(data: Record<string, unknown>): Promise<unknown>;
}

export interface MachineEventPb {
  collection(name: string): MachineEventCollection;
}

export interface MachineEventWriterOptions {
  /** Maximum concurrent PocketBase create requests. Default 5. */
  maxInFlight?: number;
  /** Delay before the buffered queue flushes. Default 40ms. */
  flushDelayMs?: number;
  /** Cap on input_summary/output_summary characters. Default 500. */
  maxSummaryChars?: number;
  /** Cap on detail characters. Default 2000. */
  maxDetailChars?: number;
  /** Cap on URL characters. Default 1000. */
  maxUrlChars?: number;
  /** Cap on queued rows before the oldest are dropped. Default 2000. */
  maxQueue?: number;
  /** Failure sink; telemetry errors are swallowed by default. */
  onError?: (error: unknown) => void;
}

export type MachineEventInput = z.input<typeof MachineEvent>;

const DEFAULT_OPTIONS: Required<
  Omit<MachineEventWriterOptions, 'onError'>
> = {
  maxInFlight: 5,
  flushDelayMs: 40,
  maxSummaryChars: 500,
  maxDetailChars: 2000,
  maxUrlChars: 1000,
  maxQueue: 2000,
};

/** Truncate with a visible marker so the UI can tell a value was capped. */
export function truncate(value: string, max: number): string {
  if (value.length <= max) return value;
  if (max <= 16) return value.slice(0, max);
  return `${value.slice(0, max - 12)}…[truncated]`;
}

function safeStringify(value: unknown): string {
  if (value === undefined || value === null) return '';
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value, (_key, inner) => {
      if (typeof inner === 'bigint') return String(inner);
      if (inner instanceof Error) return inner.message;
      return inner;
    });
  } catch {
    return String(value);
  }
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : safeStringify(error);
}

/**
 * Buffered writer bound to one PocketBase client. Use one per process; the
 * module-level `recordMachineEvent` keeps a WeakMap of default writers.
 */
export class MachineEventWriter {
  private readonly options: Required<Omit<MachineEventWriterOptions, 'onError'>>;
  private readonly onError: ((error: unknown) => void) | undefined;
  private readonly queue: Array<Record<string, unknown>> = [];
  private readonly active = new Set<Promise<unknown>>();
  private timer: ReturnType<typeof setTimeout> | null = null;
  private inFlight = 0;
  private stopped = false;

  constructor(
    private readonly pb: MachineEventPb,
    options: MachineEventWriterOptions = {},
  ) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
    this.onError = options.onError;
  }

  /** Queue one event. Invalid events are dropped (best-effort contract). */
  record(event: MachineEventInput): void {
    if (this.stopped) return;
    const prepared = this.prepare(event);
    if (!prepared) return;

    if (this.queue.length >= this.options.maxQueue) {
      this.queue.splice(0, this.queue.length - this.options.maxQueue + 1);
    }
    this.queue.push(prepared);

    // Under load, flush immediately instead of waiting for the timer.
    if (this.queue.length >= 100) {
      void this.flush();
      return;
    }
    this.scheduleFlush();
  }

  /**
   * Emit a `start` row, run `fn`, then emit `ok` or `error` with duration.
   * The original result/error is always returned/thrown unchanged.
   */
  async withToolCall<T>(
    meta: Omit<MachineEventInput, 'status' | 'duration_ms'>,
    fn: () => Promise<T> | T,
  ): Promise<T> {
    const startedAt = Date.now();
    this.record({ ...meta, status: 'start' });
    try {
      const result = await fn();
      this.record({
        ...meta,
        status: 'ok',
        duration_ms: Date.now() - startedAt,
        output_summary: meta.output_summary ?? safeStringify(result),
      });
      return result;
    } catch (error) {
      this.record({
        ...meta,
        status: 'error',
        duration_ms: Date.now() - startedAt,
        detail: meta.detail ? `${meta.detail}: ${errorText(error)}` : errorText(error),
      });
      throw error;
    }
  }

  /** Dispatch queued rows up to the in-flight cap and await those requests. */
  async flush(): Promise<void> {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    while (this.inFlight < this.options.maxInFlight && this.queue.length > 0) {
      const row = this.queue.shift();
      if (row) this.dispatch(row);
    }
    await Promise.allSettled([...this.active]);
  }

  /** Await the queue plus every in-flight request (tests / graceful shutdown). */
  async drain(): Promise<void> {
    while (this.queue.length > 0 || this.active.size > 0) {
      await this.flush();
      if (this.queue.length === 0 && this.active.size === 0) return;
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
  }

  /** Stop accepting new rows and flush what is already queued. */
  async stop(): Promise<void> {
    this.stopped = true;
    await this.drain();
  }

  get pending(): number {
    return this.queue.length + this.active.size;
  }

  private scheduleFlush(): void {
    if (this.timer) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.flush();
    }, this.options.flushDelayMs);
    // Do not keep the process alive just for telemetry.
    (this.timer as { unref?: () => void }).unref?.();
  }

  private dispatch(row: Record<string, unknown>): void {
    this.inFlight += 1;
    let pending: Promise<unknown>;
    try {
      pending = Promise.resolve(this.pb.collection('machine_events').create(row));
    } catch (error) {
      // Synchronous failure (e.g. a client without the collection).
      this.inFlight -= 1;
      this.onError?.(error);
      return;
    }
    const tracked = pending
      .catch((error: unknown) => {
        this.onError?.(error);
      })
      .finally(() => {
        this.inFlight -= 1;
        this.active.delete(tracked);
        if (this.queue.length > 0) this.scheduleFlush();
      });
    this.active.add(tracked);
  }

  private prepare(event: MachineEventInput): Record<string, unknown> | null {
    const parsed = MachineEvent.safeParse(event);
    if (!parsed.success) {
      this.onError?.(parsed.error);
      return null;
    }
    const row = parsed.data;
    return {
      ...row,
      url: truncate(row.url, this.options.maxUrlChars),
      input_summary: truncate(row.input_summary, this.options.maxSummaryChars),
      output_summary: truncate(row.output_summary, this.options.maxSummaryChars),
      detail: truncate(row.detail, this.options.maxDetailChars),
    };
  }
}

const defaultWriters = new WeakMap<MachineEventPb, MachineEventWriter>();

/** Shared writer for a PocketBase client (created on first use). */
export function getMachineEventWriter(
  pb: MachineEventPb,
  options: MachineEventWriterOptions = {},
): MachineEventWriter {
  let writer = defaultWriters.get(pb);
  if (!writer) {
    writer = new MachineEventWriter(pb, options);
    defaultWriters.set(pb, writer);
  }
  return writer;
}

/** Convenience: queue one event on the shared writer. Never throws. */
export function recordMachineEvent(pb: MachineEventPb, event: MachineEventInput): void {
  try {
    getMachineEventWriter(pb).record(event);
  } catch {
    // Telemetry must never break the machinery it observes.
  }
}

/** Flush the shared writer (tests / graceful shutdown). */
export async function flushMachineEvents(pb: MachineEventPb): Promise<void> {
  const writer = defaultWriters.get(pb);
  if (writer) await writer.drain();
}
