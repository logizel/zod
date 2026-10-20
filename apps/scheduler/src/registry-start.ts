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
//   candidateSources → events → getPortalCandidates, jobs → getJobCandidates
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
import type { TelemetryRow, OpportunityRow } from '@zod/db-hot/telemetry';
import { runMidnightGc } from '@zod/dashboard-server/gc';
import { createTursoClient, clientExecutor } from '@zod/db-cold';
import { LlmRouter, writeBucketState, type TelemetrySink } from '@zod/llm';
import { parseEnv } from '@zod/config';
import { getPortalCandidates } from '@zod/scheduler/jobs';
import { getJobCandidates } from '@zod/discord-router/portals/jobs/index';
import { fetchDetailText } from '@zod/discord-router/portals/jobs/greenhouse';
import { getLootCandidates } from '@zod/discord-router/portals/loot/vendors';
import { localSource } from '@zod/discord-router/portals/local';
import { socialSource } from '@zod/discord-router/portals/social';
import { OrchestratorScheduler } from '@zod/orchestrator';
import { createColdStore, createHotStore } from './live-stores.js';

type CandidateSource = {
  pipeline: string;
  list(): Promise<unknown[]>;
  fetch?: 'ats-json';
  detail?: (cand: unknown) => Promise<string | null>;
};

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
  };
  const router = new LlmRouter(telemetrySink);

  // Candidate sources (code-owned table — candidate-controlled data never sets pipeline).
  const candidateSources: Record<string, CandidateSource> = {
    events: { pipeline: 'events', list: getPortalCandidates },
    jobs: {
      pipeline: 'jobs',
      list: getJobCandidates,
      fetch: 'ats-json',
      detail: fetchDetailText as (cand: unknown) => Promise<string | null>,
    },
    loot: { pipeline: 'loot', list: getLootCandidates },
    local: { pipeline: 'local', list: localSource.list },
    social: { pipeline: 'social', list: socialSource.list },
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

  // MEM-05 midnight GC: purgeExpiredHeavyText via injected tickHandler.
  // Scheduler stays agnostic — the handler calls into @zod/dashboard-server/gc.
  const gcHandle = registerGcJob(log, undefined, {
    tickHandler: async (_def, jobLog) => {
      const [telemetryRows, oppRows] = await Promise.all([
        pb.collection('agent_telemetry').getFullList() as unknown as Promise<TelemetryRow[]>,
        pb.collection('opportunities').getFullList() as unknown as Promise<OpportunityRow[]>,
      ]);
      const sendAlert = async (text: string): Promise<boolean> => {
        jobLog.warn({ alert: 'gc-25h-missing', text }, 'GC 25h-missing alert');
        return false;
      };
      const result = await runMidnightGc(
        { agentTelemetry: telemetryRows, opportunities: oppRows },
        Date.now(),
        { env, log: jobLog, sendAlert },
      );
      jobLog.info({ job: 'gc-midnight-purge', ...result }, 'gc-midnight-purge tick');
    },
  });

  orchestrator.start(log);

  log.info({ component: 'scheduler/registry-start' }, 'scheduler registry started with live deps');

  const handles = [stubHandle, pollHandle, gcHandle];
  return {
    tasks: handles.flatMap((handle) => handle.tasks),
    stop: () => {
      for (const handle of handles) handle.stop();
      orchestrator.stop();
    },
  };
}

export type { RegistryHandle };
