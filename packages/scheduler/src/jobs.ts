// Stub-job table + tick runner (D-23).
//
// One module owns every cadence definition; the registry (registry.ts) owns
// every cron.schedule() call. Real poll logic plugs into runStubTick Phase 2+
// without structural change.
//
// TickLogger is structural on purpose: the production pino Logger satisfies it,
// while unit tests inject an in-memory fake — no secrets, no singletons.

import { mkdirSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { precheck as runPrecheck, type HotStore, type ColdStore } from '@zod/dedup/precheck';
import { hashUrl, normalizeUrl } from '@zod/dedup';
import { prefilter } from '@zod/scout';
import { resumeByUrl, advanceToStep2, recordFailure } from '@zod/db-hot/scratchpad';
import { fetch as fetchFacade } from '@zod/sanitize';
import {
  list as listCtftime,
} from '@zod/discord-router/portals/ctftime';
import {
  list as listClist,
} from '@zod/discord-router/portals/clist';
import {
  list as listUnstop,
} from '@zod/discord-router/portals/unstop';
import {
  list as listDevfolio,
} from '@zod/discord-router/portals/devfolio';
import {
  list as listDevpost,
} from '@zod/discord-router/portals/devpost';
import {
  list as listLuma,
} from '@zod/discord-router/portals/luma';
import {
  list as listMeetup,
} from '@zod/discord-router/portals/meetup';

export const SCHEDULER_TIMEZONE = 'Asia/Kolkata';

/** Minimal logger shape a job tick needs: info/warn plus child bindings. */
export interface TickLogger {
  info(obj: Record<string, unknown>, msg: string): void;
  info(msg: string): void;
  warn(obj: Record<string, unknown>, msg: string): void;
  warn(msg: string): void;
  child(bindings: Record<string, unknown>): TickLogger;
}

export interface StubJobDef {
  /** Stable job name, also used as the node-cron task name + log binding. */
  name: string;
  /** Cron expression (node-cron v4 syntax). */
  expression: string;
  /** Per-job jitter in milliseconds -> node-cron maxRandomDelay. */
  maxRandomDelayMs: number;
  description: string;
}

/**
 * Exactly four stub jobs per D-23 (events 15-30m, jobs 30-60m, local 2-4h,
 * social 45-90m jitter):
 * - events-stub every 20m + 5m jitter
 * - jobs-stub every 45m (:00 + :45) + 10m jitter
 * - local-stub every 3h + 20m jitter
 * - social-stub hourly + 25m jitter
 */
export const STUB_JOBS: readonly StubJobDef[] = [
  {
    name: 'events-stub',
    expression: '*/20 * * * *',
    maxRandomDelayMs: 5 * 60_000,
    description: 'events pipeline cadence stub (real polling lands Phase 2+)',
  },
  {
    name: 'jobs-stub',
    expression: '*/45 * * * *',
    maxRandomDelayMs: 10 * 60_000,
    description: 'jobs pipeline cadence stub (real polling lands Phase 2+)',
  },
  {
    name: 'local-stub',
    expression: '0 */3 * * *',
    maxRandomDelayMs: 20 * 60_000,
    description: 'local DK/Udupi cadence stub (real polling lands Phase 2+)',
  },
  {
    name: 'social-stub',
    expression: '0 * * * *',
    maxRandomDelayMs: 25 * 60_000,
    description: 'social X/LI cadence stub (real polling lands Phase 2+)',
  },
  // 7 portal-poll jobs (D-01, D-02): staggered across 15-30m window with
  // 5-minute offsets in Asia/Kolkata timezone, noOverlap + jitter per job.
  {
    name: 'portal-ctftime',
    expression: '*/15 * * * *',
    maxRandomDelayMs: 5 * 60_000,
    description: 'CTFtime portal poll — api mode, every 15m + 5m jitter',
  },
  {
    name: 'portal-clist',
    expression: '*/20 * * * *',
    maxRandomDelayMs: 5 * 60_000,
    description: 'CLIST.by portal poll — api mode, every 20m + 5m jitter',
  },
  {
    name: 'portal-unstop',
    expression: '*/25 * * * *',
    maxRandomDelayMs: 5 * 60_000,
    description: 'Unstop portal poll — scrape mode, every 25m + 5m jitter',
  },
  {
    name: 'portal-devfolio',
    expression: '*/15 * * * *',
    maxRandomDelayMs: 5 * 60_000,
    description: 'Devfolio portal poll — scrape mode, every 15m + 5m jitter',
  },
  {
    name: 'portal-devpost',
    expression: '*/20 * * * *',
    maxRandomDelayMs: 5 * 60_000,
    description: 'Devpost portal poll — scrape mode, every 20m + 5m jitter',
  },
  {
    name: 'portal-luma',
    expression: '*/25 * * * *',
    maxRandomDelayMs: 5 * 60_000,
    description: 'Luma portal poll — scrape mode, every 25m + 5m jitter',
  },
  {
    name: 'portal-meetup',
    expression: '*/30 * * * *',
    maxRandomDelayMs: 5 * 60_000,
    description: 'Meetup portal poll — scrape mode, every 30m + 5m jitter',
  },
];

/** Gateway bucket-timer jobs registered through the single scheduler registry (D-23).
 *
 * These run alongside the stub jobs — one registry, no scattered setInterval.
 * - gateway-bucket-cooldown: every minute + 30s jitter, recovers COOLDOWN buckets → READY.
 * - gateway-daily-cap-reset: daily at UTC midnight + 5m jitter, resets DAILY-CAP buckets.
 * - gateway-warmup: every minute + 10s jitter, idempotent ladder + env key validation at boot.
 */
export const GATEWAY_JOBS: readonly StubJobDef[] = [
  {
    name: 'gateway-bucket-cooldown',
    expression: '* * * * *',
    maxRandomDelayMs: 30 * 1000,
    description: 'recovers 60s-COOLDOWN buckets → READY when cooldownUntil elapses',
  },
  {
    name: 'gateway-daily-cap-reset',
    expression: '0 0 * * *',
    maxRandomDelayMs: 5 * 60_000,
    description: 'resets DAILY-CAP buckets at UTC midnight',
  },
  {
    name: 'gateway-warmup',
    expression: '* * * * *',
    maxRandomDelayMs: 10 * 1000,
    description: 'validates ladder + env keys at gateway boot (idempotent)',
  },
];

export interface PollCandidate {
  url: string;
  title: string;
  snippet: string;
}

/** Portal adapter list functions (D-01: all 7 national portals wired).
 * Each adapter emits title+snippet from its listing (zero full fetch).
 */
export const PORTAL_LIST_FNS: readonly (() => Promise<PollCandidate[]>)[] = [
  listCtftime,
  listClist,
  listUnstop,
  listDevfolio,
  listDevpost,
  listLuma,
  listMeetup,
];

/** Static candidate list for Phase 2 (portal adapters land Phase 4+).
 * Kept for backward compatibility; real polling uses PORTAL_LIST_FNS.
 */
export const POLL_CANDIDATES: readonly PollCandidate[] = [
  { url: 'https://unstop.com/competitions/sample-hackathon', title: 'Sample Hackathon 2026', snippet: 'cash prize Rs 1,00,000' },
  { url: 'https://devfolio.co/hackathons/sample', title: 'Devfolio Hackathon', snippet: 'register now prizes' },
  { url: 'https://lu.ma/sample-event', title: 'Luma Community Event', snippet: 'free workshop online' },
];

/** Fetch candidates from all 7 portal adapters, merged and deduplicated by URL. */
export async function getPortalCandidates(): Promise<PollCandidate[]> {
  const results = await Promise.all(PORTAL_LIST_FNS.map((fn) => fn()));
  const merged = results.flat();
  const seen = new Set<string>();
  return merged.filter((c) => {
    if (seen.has(c.url)) return false;
    seen.add(c.url);
    return true;
  });
}

export interface TickOutcome {
  job: string;
  durationMs: number;
}

/** One tick lifecycle record. Phase 7 telemetry consumes these unchanged. */
export interface TickRecord {
  job: string;
  phase: 'start' | 'done' | 'skip';
  /** Present on 'done' (and 'skip' never): wall-clock tick time in ms. */
  durationMs?: number;
  /** ISO-8601 timestamp of the record. */
  at: string;
}

/** Injected metrics destination: production wires telemetry, tests use memory. */
export interface MetricsSink {
  record(record: TickRecord): void;
}

export interface TickOptions {
  sink?: MetricsSink;
  /**
   * When set, tick done writes `<dir>/<job>.heartbeat` (`{job, at,
   * durationMs}`, atomic tmp+rename) for the external silence watchdog.
   * Best-effort: a failed write warns but never fails the tick.
   */
  heartbeatDir?: string;
  /** Injected hot store (PB fingerprint gate). */
  hot?: any;
  /** Injected cold store (Turso tombstone gate). */
  cold?: any;
  /** Injected PocketBase handle for scratchpad/tombstone writes. */
  pb?: any;
  /** Injected fetch facade override (tests). */
  fetch?: (url: string, opts?: unknown) => Promise<{ markdown: string; capped: boolean; source: 'jina' | 'browser' }>;
  /** Candidate list override. */
  candidates?: readonly PollCandidate[];
  /** Nested bag of stores/deps (convenience for tests). */
  stores?: Record<string, any>;
  deps?: Record<string, any>;
  context?: Record<string, any>;
  clients?: Record<string, any>;
}

function writeHeartbeat(
  dir: string,
  job: string,
  outcome: TickOutcome,
  log: TickLogger,
): void {
  try {
    mkdirSync(dir, { recursive: true });
    const finalPath = join(dir, `${job}.heartbeat`);
    const tmpPath = `${finalPath}.${Date.now()}.tmp`;
    writeFileSync(
      tmpPath,
      JSON.stringify({ job, at: new Date().toISOString(), durationMs: outcome.durationMs }),
    );
    renameSync(tmpPath, finalPath);
  } catch {
    // Fail-safe direction: the watchdog observes staleness and pages, so a
    // failed write must warn loudly but never kill the tick itself.
    log.warn({ job }, 'heartbeat write failed (watchdog will observe staleness)');
  }
}

/**
 * One stub tick: logs start on the per-job child logger, performs no polling,
 * records durationMs on done. Duration flows to the same child logger Phase 7
 * telemetry consumes unchanged.
 */
export async function runStubTick(
  def: StubJobDef,
  log: TickLogger,
  opts: TickOptions = {},
): Promise<TickOutcome> {
  const startedAt = Date.now();
  const jobLog = log.child({ job: def.name });
  jobLog.info('tick start');
  opts.sink?.record({ job: def.name, phase: 'start', at: new Date(startedAt).toISOString() });

  // Resolve injected dependencies (nested bags supported for test ergonomics).
  const bag: Record<string, any> = {
    ...(opts as any),
    ...(opts.stores ?? {}),
    ...(opts.deps ?? {}),
    ...(opts.context ?? {}),
    ...(opts.clients ?? {}),
  };
  const pb = bag.pb ?? bag.pocketbase ?? bag.hotClient?.pb ?? bag.db;
  const hot = bag.hot ?? bag.hotStore ?? bag.hotDb;
  const cold = bag.cold ?? bag.coldStore ?? bag.coldDb ?? bag.tombstoneStore;
  const fetchFn =
    (typeof bag.fetch === 'function' ? bag.fetch : undefined) ??
    (typeof opts.fetch === 'function' ? opts.fetch : undefined) ??
    fetchFacade;
  const candidates = (opts.candidates ?? bag.candidates ?? POLL_CANDIDATES) as readonly PollCandidate[];

  const runPrecheckSafe = async (cand: PollCandidate): Promise<string> => {
    if (typeof hot?.hasFingerprint !== 'function' && typeof cold?.findTombstone !== 'function') {
      return 'fresh';
    }
    const verdict = await runPrecheck(
      { url: cand.url, title: cand.title, snippet: cand.snippet } as any,
      hot as HotStore,
      cold as ColdStore,
    );
    return String(verdict);
  };

  if (pb === undefined || hot === undefined || cold === undefined) {
    jobLog.warn({ job: def.name }, 'poll deps not provided; skipping candidate processing');
  } else {
    for (const cand of candidates) {
      const cLog = jobLog.child({ candidate: cand.url });
      // 1. dedup gate first
      let verdict: string;
      try {
        verdict = await runPrecheckSafe(cand);
      } catch (err) {
        cLog.warn({ stage: 'precheck', error: String(err) }, 'precheck failed');
        continue;
      }
      cLog.info({ stage: 'precheck', verdict }, 'precheck result');
      if (verdict === 'hot-hit' || verdict === 'tombstoned') {
        cLog.info({ stage: 'precheck', verdict }, 'skip: candidate gated by dedup');
        continue;
      }

      // 2. scout prefilter (zero fetch)
      const pf = prefilter({ title: cand.title, snippet: cand.snippet } as any) as any;
      if (pf?.verdict === 'reject') {
        // write tombstone_ledger row terminal_status scout_rejected
        try {
          const urlHash = hashUrl(normalizeUrl(cand.url));
          const row = {
            url_hash: urlHash,
            fingerprint: urlHash,
            terminal_status: 'scout_rejected',
            source: 'scout',
            decided_at: new Date().toISOString(),
          };
          if (typeof cold?.create === 'function') {
            await cold.create(row);
          } else if (pb?.collection) {
            const coll = pb.collection('tombstone_ledger');
            if (typeof coll?.create === 'function') await coll.create(row);
          }
        } catch (err) {
          cLog.warn({ stage: 'scout', error: String(err) }, 'scout tombstone write failed');
        }
        cLog.info({ stage: 'scout', reason: pf.reason, detail: pf.detail }, 'skip: scout rejected');
        continue;
      }

      // 3. scratchpad resume
      let resume: { row: any; shouldFetch: boolean };
      try {
        resume = await resumeByUrl(pb, cand.url);
      } catch (err) {
        cLog.warn({ stage: 'scratchpad', error: String(err) }, 'scratchpad resume failed');
        continue;
      }
      if (!resume.shouldFetch) {
        cLog.info({ stage: 'scratchpad', step: resume.row?.step_position }, 'skip: already STEP_2');
        continue;
      }

      // 4. fetch -> STEP_2
      try {
        const result = await fetchFn(cand.url);
        await advanceToStep2(pb, resume.row.id, result.markdown);
        cLog.info(
          { stage: 'fetch', source: result.source, capped: result.capped },
          'candidate advanced to STEP_2',
        );
      } catch (err) {
        try {
          const { attempts, tombstoned } = await recordFailure(pb, resume.row.id, String(err));
          cLog.warn({ stage: 'fetch', attempts, tombstoned, error: String(err) }, 'fetch failed');
          if (tombstoned) {
            cLog.info({ stage: 'fetch' }, 'candidate tombstoned after retries');
          }
        } catch (inner) {
          cLog.warn({ stage: 'fetch', error: String(inner) }, 'recordFailure failed');
        }
      }
    }
  }

  const durationMs = Date.now() - startedAt;
  const outcome: TickOutcome = { job: def.name, durationMs };
  jobLog.info({ durationMs }, 'tick done');
  opts.sink?.record({ job: def.name, phase: 'done', durationMs, at: new Date().toISOString() });
  if (opts.heartbeatDir !== undefined) {
    writeHeartbeat(opts.heartbeatDir, def.name, outcome, log);
  }
  return outcome;
}

// --- Reclaim-defense sizing (D-25, A1; mirrored by infra/oracle/cache-buffer.sh)
//

/**
 * Idle-reclaim band: the VM must look 22-30% busy. The hold is the 2.5 GiB
 * wired cache by default, shrunk when free memory (minus a safety margin)
 * cannot afford it or when it would push usage past the 30% ceiling.
 */
export const RECLAIM_FLOOR = 0.22;
export const RECLAIM_CEILING = 0.3;
export const DEFAULT_HOLD_MIB = 2560; // 2.5 GiB
export const HOLD_MARGIN_MIB = 512; // never eat the last 512 MiB of free RAM

/**
 * Hold size in MiB from actual memory at provisioning. Throws on
 * non-positive totals (provisioning bug — fail loudly, never guess).
 */
export function computeBufferHoldMiB(totalMiB: number, freeMiB: number): number {
  if (!Number.isFinite(totalMiB) || totalMiB <= 0) {
    throw new Error(`[scheduler-guard] cannot size reclaim buffer: invalid totalMiB=${totalMiB}`);
  }
  const free = Math.min(Math.max(freeMiB, 0), totalMiB);
  const used = totalMiB - free;
  const affordable = Math.max(0, free - HOLD_MARGIN_MIB);
  const toCeiling = Math.max(0, RECLAIM_CEILING * totalMiB - used);
  return Math.floor(Math.min(DEFAULT_HOLD_MIB, affordable, toCeiling));
}

export const runPollTick = runStubTick;

/** Options for runGatewayTick: extends TickOptions with an injected tick handler. */
export interface GatewayTickOptions extends TickOptions {
  /** Injected by the gateway layer (registry-integration.ts); scheduler never imports llm. */
  tickHandler?: (def: StubJobDef, log: TickLogger) => Promise<void> | void;
}

/** One gateway bucket-timer tick: logs start/done, delegates real work to tickHandler.
 * The scheduler stays agnostic of gateway internals — all bucket logic lives in llm. */
export async function runGatewayTick(
  def: StubJobDef,
  log: TickLogger,
  opts: GatewayTickOptions = {},
): Promise<void> {
  const startedAt = Date.now();
  const jobLog = log.child({ job: def.name });
  jobLog.info('tick start');
  opts.sink?.record({ job: def.name, phase: 'start', at: new Date(startedAt).toISOString() });

  try {
    await opts.tickHandler?.(def, jobLog);
  } catch (err) {
    jobLog.warn({ job: def.name, error: String(err) }, 'gateway tick handler threw');
  }

  const durationMs = Date.now() - startedAt;
  jobLog.info({ durationMs }, 'tick done');
  opts.sink?.record({ job: def.name, phase: 'done', durationMs, at: new Date().toISOString() });
}
