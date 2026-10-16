// Scheduler entry -> registry wiring (Phase 5 live deps).
//
// Boot order stays: env parse -> logger -> registry start. Production runs the
// compiled emit (node dist); dev-only watch mode is `pnpm dev` (tsx watch).
// The registry keeps the event loop alive, so this process runs 24/7.
//
// Live deps injected into the registry:
//   pb / hot      → PocketBase client (createPbClient)
//   cold          → Turso executor (createTursoClient + clientExecutor)
//   router        → LlmRouter with telemetry sink (writeBucketState)
//   candidateSources → events → getPortalCandidates, jobs → getJobCandidates
//
// OrchestratorScheduler registers the audit-drain job via injected tickHandler
// — scheduler never imports @zod/orchestrator (cycle-free).
import {
  startRegistry,
  registerPollJobs,
  registerAuditDrain,
  registerGatewayJobs,
  type RegistryHandle,
  type TickLogger,
} from '@zod/scheduler-registry';
import { createPbClient } from '@zod/db-hot';
import { createTursoClient, clientExecutor } from '@zod/db-cold';
import { LlmRouter, writeBucketState, type TelemetrySink } from '@zod/llm';
import { createLogger } from '@zod/logger';
import { parseEnv } from '@zod/config';
import { getPortalCandidates } from '@zod/scheduler/jobs';
import { getJobCandidates } from '@zod/discord-router/portals/jobs/index';
import { getLootCandidates } from '@zod/discord-router/portals/loot/vendors';
import { localSource } from '@zod/discord-router/portals/local';
import { socialSource } from '@zod/discord-router/portals/social';
import { startRelayService } from '@zod/discord-router/relay';
import { OrchestratorScheduler } from '@zod/orchestrator';

type CandidateSource = {
  pipeline: string;
  list(): Promise<unknown[]>;
};

export function startSchedulerRegistry(log: TickLogger): RegistryHandle {
  const env = parseEnv();

  // --- Live deps ---
  // Hot: PocketBase (scratchpad, opportunities, tombstone_ledger)
  const pbPromise = createPbClient(env as unknown as { PB_URL: string; PB_SERVICE_EMAIL: string; PB_SERVICE_PASSWORD: string });

  // Cold: Turso executor (tombstone ledger)
  const turso = createTursoClient(env as unknown as { TURSO_DATABASE_URL: string; TURSO_AUTH_TOKEN: string });
  const cold = clientExecutor(turso);

  // LlmRouter with telemetry sink (auditor lane)
  const telemetrySink: TelemetrySink = {
    writeBucketState: async (input) => {
      await writeBucketState(pbPromise as unknown as Parameters<typeof writeBucketState>[0], input);
    },
  };
  const router = new LlmRouter(telemetrySink);

  // Candidate sources (code-owned table — candidate-controlled data never sets pipeline)
  const candidateSources: Record<string, CandidateSource> = {
    events: { pipeline: 'events', list: getPortalCandidates },
    jobs: { pipeline: 'jobs', list: getJobCandidates },
    loot: { pipeline: 'loot', list: getLootCandidates },
    local: { pipeline: 'local', list: localSource.list },
    social: { pipeline: 'social', list: socialSource.list },
  };

  // --- Register jobs through the single registry ---
  // startRegistry registers stub jobs; registerPollJobs adds poll jobs;
  // registerAuditDrain adds the audit-drain job via tickHandler.
  startRegistry(log, undefined, { sink: undefined, candidateSources: candidateSources as any });

  registerPollJobs(log, undefined, { candidateSources: candidateSources as any });

  // Orchestrator provides the drain tickHandler; scheduler stays agnostic.
  const orchestrator = new OrchestratorScheduler({
    pb: pbPromise as unknown,
    router: router as unknown as { complete: (opts: unknown) => Promise<unknown> },
    pageSize: 25,
  });
  registerAuditDrain(log, undefined, {
    tickHandler: orchestrator.getTickHandler(),
  });

  // Relay service: polls external #announcements and relays to #raw-incoming-feeds.
  // Registered via registerGatewayJobs with a tickHandler — no setInterval scatter.
  const relayService = startRelayService({
    env: env as any,
    log,
    pb: pbPromise as any,
    client: undefined, // gateway client injected at runtime via getClient()
  });
  registerGatewayJobs(log, undefined, {
    tickHandler: (def, jobLog) => {
      if (def.name === 'relay-poll') {
        return relayService.tick();
      }
    },
  });

  orchestrator.start(log);

  log.info({ component: 'scheduler/registry-start' }, 'scheduler registry started with live deps');

  // cold is intentionally unused in this tracer slice — wired for 05-05 merger.
  void cold;

  return {
    tasks: [],
    stop: () => {
      orchestrator.stop();
    },
  };
}

export type { RegistryHandle };
