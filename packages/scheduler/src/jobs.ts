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
import { attemptMerge, createMergeStore } from '@zod/dedup/merger';
import { prefilter } from '@zod/scout';
import { screenListing } from '@zod/scout/jobs-screen';
import { resumeByUrl, advanceToStep2, recordFailure } from '@zod/db-hot/scratchpad';
import type { Pipeline } from '@zod/db-hot/schema';
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
import { getJobCandidates } from '@zod/discord-router/portals/jobs/index';

export const SCHEDULER_TIMEZONE = 'Asia/Kolkata';

/** Minimal logger shape a job tick needs: info/warn/debug plus child bindings. */
export interface TickLogger {
  info(obj: Record<string, unknown>, msg: string): void;
  info(msg: string): void;
  warn(obj: Record<string, unknown>, msg: string): void;
  warn(msg: string): void;
  debug(obj: Record<string, unknown>, msg: string): void;
  debug(msg: string): void;
  child(bindings: Record<string, unknown>): TickLogger;
}

export interface StubJobDef {
  /** Stable job name, also used as the node-cron task name + log binding. */
  name: string;
  /** Cron expression (node-cron v4 syntax). */
  expression: string;
  /** Per-job jitter in milliseconds -> node-cron maxRandomDelay. */
  maxRandomDelayMs: number;
  /** Candidate source key resolved via TickOptions.candidateSources (live path). */
  candidateSource?: string;
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
    candidateSource: 'local',
    description: 'local DK/Udupi domain + bio-link poll (ING-02)',
  },
  {
    name: 'social-stub',
    expression: '0 * * * *',
    maxRandomDelayMs: 25 * 60_000,
    candidateSource: 'social',
    description: 'social X/LI cadence stub (real polling lands Phase 2+)',
  },
  // 7 portal-poll jobs (D-01, D-02): staggered across 15-30m window with
  // 5-minute offsets in Asia/Kolkata timezone, noOverlap + jitter per job.
  {
    name: 'portal-ctftime',
    expression: '*/15 * * * *',
    maxRandomDelayMs: 5 * 60_000,
    candidateSource: 'events',
    description: 'CTFtime portal poll — api mode, every 15m + 5m jitter',
  },
  {
    name: 'portal-clist',
    expression: '*/20 * * * *',
    maxRandomDelayMs: 5 * 60_000,
    candidateSource: 'events',
    description: 'CLIST.by portal poll — api mode, every 20m + 5m jitter',
  },
  {
    name: 'portal-unstop',
    expression: '*/25 * * * *',
    maxRandomDelayMs: 5 * 60_000,
    candidateSource: 'events',
    description: 'Unstop portal poll — scrape mode, every 25m + 5m jitter',
  },
  {
    name: 'portal-devfolio',
    expression: '*/15 * * * *',
    maxRandomDelayMs: 5 * 60_000,
    candidateSource: 'events',
    description: 'Devfolio portal poll — scrape mode, every 15m + 5m jitter',
  },
  {
    name: 'portal-devpost',
    expression: '*/20 * * * *',
    maxRandomDelayMs: 5 * 60_000,
    candidateSource: 'events',
    description: 'Devpost portal poll — scrape mode, every 20m + 5m jitter',
  },
  {
    name: 'portal-luma',
    expression: '*/25 * * * *',
    maxRandomDelayMs: 5 * 60_000,
    candidateSource: 'events',
    description: 'Luma portal poll — scrape mode, every 25m + 5m jitter',
  },
  {
    name: 'portal-meetup',
    expression: '*/30 * * * *',
    maxRandomDelayMs: 5 * 60_000,
    candidateSource: 'events',
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
  {
    name: 'gateway-relay-poll',
    expression: '*/15 * * * *',
    maxRandomDelayMs: 5 * 60_000,
    description: 'Discord #announcements relay poll (ING-04)',
  },
  {
    name: 'gateway-reminder-tick',
    expression: '*/15 * * * *',
    maxRandomDelayMs: 5 * 60_000,
    description: 'bookmark deadline reminder scan (UI-02)',
  },
];

/** Job pipeline poll + audit-drain jobs (Phase 5, D-01 / D-14).
 *
 * - jobs-poll: every 40m + 10m jitter, candidateSource 'jobs' → getJobCandidates()
 * - loot-watchlist: every 5h + 15m jitter, candidateSource 'loot' → getLootCandidates() (plan 05-04)
 * - audit-drain: every 5m + 60s jitter, orchestrator drain via tickHandler (registerAuditDrain)
 */
export const JOB_POLL_JOBS: readonly StubJobDef[] = [
  {
    name: 'jobs-poll',
    expression: '*/40 * * * *',
    maxRandomDelayMs: 10 * 60_000,
    candidateSource: 'jobs',
    description: 'jobs sources poll — ATS JSON + aggregators + HN, every 40m + 10m jitter (ING-03)',
  },
  {
    name: 'loot-watchlist',
    expression: '0 */5 * * *',
    maxRandomDelayMs: 15 * 60_000,
    candidateSource: 'loot',
    description: 'vendor watchlist poll — low cadence (D-12)',
  },
];

export const AUDIT_JOBS: readonly StubJobDef[] = [
  {
    name: 'audit-drain',
    expression: '*/5 * * * *',
    maxRandomDelayMs: 60 * 1000,
    description: 'orchestrator STEP_2 audit drain — registered via tickHandler (registerAuditDrain)',
  },
];

/** MEM-05 midnight GC job registered through the single scheduler registry.
 *
 * Runs at IST midnight (+ jitter) with noOverlap single-flight semantics.
 * tickHandler calls purgeExpiredHeavyText in @zod/db-hot (telemetry.ts).
 * The 25h-missing alert and Discord #🛠-ops-health wiring are deferred to
 * Wave 3 (D-14).
 */
export const GC_JOBS: readonly StubJobDef[] = [
  {
    name: 'gc-midnight-purge',
    expression: '0 0 * * *',
    maxRandomDelayMs: 15 * 60_000,
    description: 'midnight GC purge heavy-text columns (description_raw/detail); retain tombstones + taste rules',
  },
];

export interface PollCandidate {
  url: string;
  title: string;
  snippet: string;
  /** Location metadata from the listing (used by geo gate at audit time). */
  location?: string;
  /** Organizer/company from the listing (used by merger evidence gate). */
  organizer?: string;
  /** Epoch-ms date of the listing (used by merger ±3-day window gate). */
  dateMs?: number;
}

/** A candidate source: pipeline name + list() + optional ATS-JSON detail fetch. */
export interface CandidateSource {
  /** Pipeline this source feeds (events | jobs | loot | local | social). */
  pipeline: string;
  /** List candidates from this source (listing-first: title+snippet only). */
  list(): Promise<PollCandidate[]>;
  /** Fetch mode hint: 'ats-json' means the source has a detail() text fetch. */
  fetch?: 'ats-json';
  /** Detail text fetch for ATS-JSON sources; null → tick falls back to facade. */
  detail?: (cand: PollCandidate) => Promise<string | null>;
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
  /** Injected candidate sources keyed by source name (live path). */
  candidateSources?: Record<string, CandidateSource>;
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

  // --- Candidate source resolution (D-01, Phase 5) ---
  // Order:
  //  (1) def.candidateSource declared + source exists in bag → source.list() (live path)
  //  (2) opts.candidates / bag.candidates override (tests)
  //  (3) def.candidateSource declared but source missing → warn + skip (never static list)
  //  (4) pb/hot/cold all injected (live mode) but no source → warn + skip (never static fallback in live mode)
  //  (5) legacy stub mode (no deps, no source) → static POLL_CANDIDATES fallback
  const bagSources = (bag.candidateSources ?? (opts as any).candidateSources) as
    | Record<string, CandidateSource>
    | undefined;

  let candidates: readonly PollCandidate[];

  if (def.candidateSource && bagSources?.[def.candidateSource]) {
    candidates = await bagSources[def.candidateSource].list();
  } else if (opts.candidates ?? bag.candidates) {
    candidates = (opts.candidates ?? bag.candidates) as readonly PollCandidate[];
  } else if (def.candidateSource) {
    jobLog.warn(
      { job: def.name, candidateSource: def.candidateSource },
      'declared candidate source missing; skipping candidate processing',
    );
    candidates = [];
  } else if (pb !== undefined && hot !== undefined && cold !== undefined) {
    jobLog.warn({ job: def.name }, 'no candidate source; skipping');
    candidates = [];
  } else {
    candidates = POLL_CANDIDATES;
  }

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

      // D-10: intake merge stage (pre-audit) — runs only on 'fresh' verdicts
      // (Pitfall 9: hot-hit/tombstoned never reach the merge stage).
      if (verdict === 'fresh' && pb !== undefined && cold !== undefined) {
        const store = createMergeStore({ pb, cold });
        const pipeline = (def.candidateSource ?? 'events') as 'events' | 'jobs';
        const mergeResult = await attemptMerge(
          {
            pipeline,
            title: cand.title,
            url: cand.url,
            organizer: undefined, // extractCompany runs inside attemptMerge
            dateMs: (cand as any).dateMs ?? undefined,
            location: cand.location,
          },
          store,
        );

        cLog.info({ stage: 'merge', verdict: mergeResult }, 'intake merge result');

        if (mergeResult.merged) {
          cLog.info(
            { stage: 'merge', masterId: mergeResult.masterId },
            'skip: merged at intake — no fetch/audit/scratchpad',
          );
          continue; // skip fetch/audit/scratchpad — the primary skip case
        }
        if (mergeResult.possibleDupe && mergeResult.masterId) {
          cLog.info(
            { stage: 'merge', masterId: mergeResult.masterId },
            'possible dupe flagged — proceeding to pipeline',
          );
        }
      } else if (verdict === 'fresh') {
        cLog.debug({ stage: 'merge' }, 'merge stage skipped: pb/cold not provided');
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

      // D-04 listing screen — zero-fetch senior reject, flag-only pre-detectors.
      // Runs only for the jobs pipeline (candidateSource === 'jobs'); other
      // pipelines are untouched. Flags never auto-reject — telemetry only.
      if (def.candidateSource === 'jobs') {
        const screen = screenListing({ title: cand.title, snippet: cand.snippet } as any) as any;
        if (screen?.reject?.reason === 'senior_role') {
          // write tombstone_ledger row terminal_status senior_role, source listing-screen
          try {
            const urlHash = hashUrl(normalizeUrl(cand.url));
            const row = {
              url_hash: urlHash,
              fingerprint: urlHash,
              terminal_status: 'senior_role',
              source: 'listing-screen',
              decided_at: new Date().toISOString(),
            };
            if (typeof cold?.create === 'function') {
              await cold.create(row);
            } else if (pb?.collection) {
              const coll = pb.collection('tombstone_ledger');
              if (typeof coll?.create === 'function') await coll.create(row);
            }
          } catch (err) {
            cLog.warn({ stage: 'listing-screen', error: String(err) }, 'listing-screen tombstone write failed');
          }
          cLog.info({ stage: 'listing-screen', reason: 'senior_role' }, 'skip: senior role rejected at listing stage');
          continue;
        }
        // flag-only: child-log warn with candidate URL + flag class names,
        // never values beyond title-stage text already logged, never a tombstone.
        if (screen?.flags?.length) {
          cLog.warn({ stage: 'listing-screen', flags: screen.flags }, 'listing flags raised (telemetry only)');
        }
      }

      // 3. scratchpad resume
      let resume: { row: any; shouldFetch: boolean };
      try {
        const sourceDef = bagSources?.[def.candidateSource ?? ''];
        resume = await resumeByUrl(
          pb,
          cand.url,
          (sourceDef?.pipeline ?? 'events') as Pipeline,
          cand.title,
        );
      } catch (err) {
        cLog.warn({ stage: 'scratchpad', error: String(err) }, 'scratchpad resume failed');
        continue;
      }
      if (!resume.shouldFetch) {
        cLog.info({ stage: 'scratchpad', step: resume.row?.step_position }, 'skip: already STEP_2');
        continue;
      }

      // 4. fetch -> STEP_2
      // ATS-JSON sources: call source.detail() first, fall back to the shared
      // fetch facade when it returns null. Pass source.pipeline + cand.title
      // into resumeByUrl so the scratchpad row carries pipeline + title.
      try {
        const sourceDef = bagSources?.[def.candidateSource ?? ''];
        let result: { markdown: string; capped: boolean; source: string };
        if (
          sourceDef?.fetch === 'ats-json' &&
          typeof sourceDef.detail === 'function'
        ) {
          const detailText = await sourceDef.detail(cand);
          if (detailText !== null && detailText !== undefined) {
            result = {
              markdown: detailText.slice(0, 8000),
              capped: true,
              source: 'ats-json',
            };
          } else {
            result = await fetchFn(cand.url);
          }
        } else {
          result = await fetchFn(cand.url);
        }
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
