// Scheduler entry -> registry wiring (Phase 5 live deps).
//
// Boot order stays: env parse -> logger -> resolved clients -> registry start.
// Production runs the compiled emit (node dist); local runs use
// `pnpm dev:scheduler` (tsx). The registry keeps the event loop alive,
// so this process runs 24/7.
//
// Live deps injected into the registry:
//   pb / hot / cold → PocketBase + Turso dedup ports (live-stores.ts)
//   router          → LlmRouter with telemetry sink (writeBucketState)
//   candidateSources → per-portal sources, jobs → getJobCandidates, etc.
//
// OrchestratorScheduler registers the audit-drain job via its own tickHandler
// — scheduler never imports @zod/orchestrator internals (cycle-free).
import {
  startRegistry,
  registerPollJobs,
  registerGcJob,
  type RegistryHandle,
  type TickLogger,
} from '@zod/scheduler-registry';
import { createPbClient } from '@zod/db-hot';
import { recordMachineEvent } from '@zod/db-hot/machine-events';
import { runPersistentGc } from '@zod/dashboard-server/gc';
import { createOpsAlertSender } from '@zod/dashboard-server/alerts';
import { createTursoClient, clientExecutor } from '@zod/db-cold';
import { LlmRouter, writeBucketState, GatewayScheduler, type TelemetrySink } from '@zod/llm';
import { parseEnv } from '@zod/config';
import {
  getPortalCandidates,
  PORTAL_SOURCES,
  type CandidateSource,
} from '@zod/scheduler-registry/jobs';
import { getJobCandidates } from '@zod/discord-router/portals/jobs/index';
import { fetchDetailText } from '@zod/discord-router/portals/jobs/greenhouse';
import { getLootCandidates } from '@zod/discord-router/portals/loot/vendors';
import { localSource } from '@zod/discord-router/portals/local';
import { createSocialSource } from '@zod/discord-router/portals/social';
import { OrchestratorScheduler } from '@zod/orchestrator';
import { createColdStore, createHotStore } from './live-stores.js';

export async function startSchedulerRegistry(log: TickLogger): Promise<RegistryHandle> {
  const env = parseEnv();

  // --- Live deps (resolve once at boot) ---
  // Hot: PocketBase (scratchpad, opportunities, tombstone_ledger)
  const pb = await createPbClient(env);
  // Cold: Turso tombstone ledger.
  const turso = createTursoClient(env);
  const cold = createColdStore(clientExecutor(turso), pb, (err) => {
    log.warn(
      { component: 'scheduler/cold', error: String((err as { message?: unknown })?.message ?? err) },
      'Turso cold ledger unavailable; using PocketBase tombstone mirror',
    );
  });
  const hot = createHotStore(pb);

  // LlmRouter with telemetry sink (auditor lane).
  const telemetrySink: TelemetrySink = {
    writeBucketState: async (input) => {
      await writeBucketState(
        pb as unknown as Parameters<typeof writeBucketState>[0],
        input,
      );
    },
    recordMachineEvent: (event) => {
      const label = String(event.pipeline ?? '');
      const pipeline = (['local', 'events', 'jobs', 'loot', 'social'] as const).includes(label as never)
        ? (label as 'local' | 'events' | 'jobs' | 'loot' | 'social')
        : '';
      recordMachineEvent(pb, { ...event, event_type: 'llm', pipeline });
    },
  };
  const router = new LlmRouter(telemetrySink);

  // Candidate sources (code-owned table — candidate-controlled data never sets pipeline).
  // Each portal job owns one source; `events` remains an aggregate fallback.
  const portalSources = Object.fromEntries(
    Object.entries(PORTAL_SOURCES).map(([name, list]) => [
      name,
      { pipeline: 'events', list } satisfies CandidateSource,
    ]),
  );
  // Social listener-to-glass wiring: every cookie read + listing fetch is
  // recorded as a machine_event so the dashboard can show the exact X/LinkedIn
  // URL being polled, the renderer, HTTP status, bytes, and post count.
  const social = createSocialSource({
    onEvent: (event) => {
      try {
        recordMachineEvent(pb, {
          trace_id: `social:${event.source}`,
          agent: 'scheduler:social-stub',
          pipeline: 'social',
          event_type: event.tool === 'social.cookies' ? 'system' : 'fetch',
          tool: event.tool,
          status: event.status,
          duration_ms: event.duration_ms,
          url: event.url,
          input_summary: event.input_summary ?? '',
          output_summary: event.output_summary ?? '',
          detail: event.detail ?? '',
          meta: {
            source: event.source,
            httpStatus: event.httpStatus ?? 0,
            bytes: event.bytes ?? 0,
            candidates: event.candidates ?? 0,
            renderer: event.renderer ?? '',
          },
        });
      } catch {
        // Telemetry must never break the poll.
      }
    },
  });
  const candidateSources: Record<string, CandidateSource> = {
    events: { pipeline: 'events', list: getPortalCandidates },
    ...portalSources,
    jobs: {
      pipeline: 'jobs',
      list: getJobCandidates,
      fetch: 'ats-json',
      detail: fetchDetailText as (cand: unknown) => Promise<string | null>,
    },
    loot: { pipeline: 'loot', list: getLootCandidates },
    local: { pipeline: 'local', list: localSource.list },
    social: { pipeline: 'social', list: social.list },
  };

  // --- Register jobs through the single registry ---
  // startRegistry registers stub + portal jobs; registerPollJobs adds
  // jobs/loot polls; OrchestratorScheduler owns the audit-drain registration.
  const registerOpts = {
    candidateSources: candidateSources as any,
    pb,
    hot,
    cold,
  } as const;

  const stubHandle = startRegistry(log, undefined, registerOpts);
  const pollHandle = registerPollJobs(log, undefined, registerOpts);

  // Orchestrator provides the drain tickHandler; scheduler stays agnostic.
  const orchestrator = new OrchestratorScheduler({
    pb,
    router,
    pageSize: 25,
  });

  // MEM-05 midnight GC: persistent purge + 24h telemetry delete + 48h
  // rejection compaction, persisted last-success marker, and real REST ops
  // alerts (#🛠-ops-health). Scheduler never opens a second Discord gateway.
  const sendOpsAlert = createOpsAlertSender({ env, log });
  const gcHandle = registerGcJob(log, undefined, {
    pb,
    tickHandler: async (_def, jobLog) => {
      const startedAt = Date.now();
      const result = await runPersistentGc({
        pb,
        env,
        log: jobLog,
        nowMs: Date.now(),
        sendAlert: sendOpsAlert,
      });
      try {
        recordMachineEvent(pb, {
          trace_id: 'job:gc-midnight-purge',
          agent: 'scheduler:gc-midnight-purge',
          pipeline: '',
          event_type: 'gc',
          tool: 'gc.midnight',
          status: 'ok',
          duration_ms: Date.now() - startedAt,
          detail: `purged ${result.purged}, compacted ${result.compacted}, errors ${result.errors}`,
          meta: { ...result },
        });
      } catch {
        // Best-effort observability.
      }
      jobLog.info({ job: 'gc-midnight-purge', ...result }, 'gc-midnight-purge tick');
    },
  });

  orchestrator.start(log);

  // Headless bucket timers (cooldown recovery, daily-cap reset, warmup) live
  // in the scheduler process. Delivery jobs (relay/reminders) live in the bot.
  const gatewayScheduler = new GatewayScheduler({
    router,
    pb,
    slot: 'gateway-timers',
    pipeline: 'events',
  });
  gatewayScheduler.start(log);

  log.info({ component: 'scheduler/registry-start' }, 'scheduler registry started with live deps');

  const handles = [stubHandle, pollHandle, gcHandle];
  return {
    tasks: handles.flatMap((handle) => handle.tasks),
    stop: () => {
      for (const handle of handles) handle.stop();
      orchestrator.stop();
      gatewayScheduler.stop();
    },
  };
}

export type { RegistryHandle };
