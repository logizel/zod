// Priority queue for shared-pool audit scheduling.
// Lanes: Curator(1) > Auditor(2) > Scout(3); per-lane in-flight caps + a global
// in-flight cap prevent shared-pool deadlock and Scout-burst starvation of
// Curator verdicts (SWM-04, T-03-08).
//
// All admission control is count-based; no timers, no setInterval.

export type Priority = 1 | 2 | 3;

export const PRIORITY_LABEL: Record<Priority, string> = {
  1: 'Curator',
  2: 'Auditor',
  3: 'Scout',
};

export interface Job<Payload = unknown> {
  id: string;
  payload: Payload;
  priority: Priority;
  enqueuedAt: number;
}

interface PriorityQueueOptions {
  /** Max (pending + in-flight) per lane. Defaults: Curator 10, Auditor 8, Scout 5. */
  perLaneCaps?: Partial<Record<Priority, number>>;
  /** Global in-flight cap (shared-pool deadlock prevention). Default 20. */
  globalCap?: number;
}

const DEFAULT_PER_LANE_CAPS: Record<Priority, number> = { 1: 10, 2: 8, 3: 5 };
const DEFAULT_GLOBAL_CAP = 20;

let counter = 0;
function nextId(): string {
  return `job-${Date.now()}-${counter += 1}`;
}

/**
 * Priority queue with per-lane and global in-flight caps.
 * dequeue() always returns the highest-priority lane's next job that fits under
 * both its per-lane cap and the global cap.
 */
export class PriorityQueue<Payload = unknown> {
  private lanes = new Map<Priority, Job<Payload>[]>([
    [1, []],
    [2, []],
    [3, []],
  ]);
  private inFlight = new Map<string, Job<Payload>>();
  private readonly perLaneCaps: Record<Priority, number>;
  private readonly globalCap: number;

  constructor(opts: PriorityQueueOptions = {}) {
    this.perLaneCaps = { ...DEFAULT_PER_LANE_CAPS, ...opts.perLaneCaps };
    this.globalCap = opts.globalCap ?? DEFAULT_GLOBAL_CAP;
  }

  /** Load of a lane = pending + in-flight jobs in that lane. */
  private laneLoad(priority: Priority): number {
    return (this.lanes.get(priority)!.length + this.inFlightLaneCount(priority));
  }

  private inFlightLaneCount(priority: Priority): number {
    let n = 0;
    for (const job of this.inFlight.values()) {
      if (job.priority === priority) n += 1;
    }
    return n;
  }

  /**
   * Enqueue a job. Returns the job id when admitted, or null when the lane or
   * global pool is at capacity (backpressure — caller retries later).
   * Admission checks both the per-lane cap and the global cap.
   */
  enqueue(payload: Payload, priority: Priority): string | null {
    if (this.laneLoad(priority) >= this.perLaneCaps[priority]) return null; // lane full
    if (this.inFlight.size >= this.globalCap) return null; // global pool full

    const job: Job<Payload> = { id: nextId(), payload, priority, enqueuedAt: Date.now() };
    this.lanes.get(priority)!.push(job);
    return job.id;
  }

  /**
   * Dequeue the next runnable job: highest-priority lane first, respecting the
   * global in-flight cap. Curator(1) always dequeues before Scout(3).
   */
  dequeue(): Job<Payload> | null {
    if (this.inFlight.size >= this.globalCap) return null;
    for (const priority of [1, 2, 3] as Priority[]) {
      const lane = this.lanes.get(priority)!;
      const job = lane.shift();
      if (job) {
        this.inFlight.set(job.id, job);
        return job;
      }
    }
    return null;
  }

  /** Release a completed job from the in-flight pool. */
  complete(jobId: string): void {
    this.inFlight.delete(jobId);
  }

  /** Pending (queued, not in-flight) count for a lane. */
  pending(priority: Priority): number {
    return this.lanes.get(priority)!.length;
  }

  /** In-flight count across the whole pool. */
  globalInFlight(): number {
    return this.inFlight.size;
  }

  /** True when a lane cannot accept more jobs (at per-lane cap). */
  isLaneFull(priority: Priority): boolean {
    return this.laneLoad(priority) >= this.perLaneCaps[priority];
  }

  /** True when the global pool is at capacity. */
  isGlobalFull(): boolean {
    return this.inFlight.size >= this.globalCap;
  }

  /** Snapshot for operator visibility / tests. */
  stats() {
    return {
      perLane: Object.fromEntries(
        ([1, 2, 3] as Priority[]).map((p) => [PRIORITY_LABEL[p], { pending: this.pending(p), inFlight: this.inFlightLaneCount(p) }]),
      ) as Record<string, { pending: number; inFlight: number }>,
      globalInFlight: this.globalInFlight(),
      globalCap: this.globalCap,
    };
  }
}
