// OrchestratorScheduler — registers the audit-drain job through the single
// scheduler registry via an injected tickHandler.
//
// GatewayScheduler precedent (packages/llm/src/registry-integration.ts):
//   scheduler owns cron; orchestrator owns the handler.
//   No @zod/orchestrator import inside packages/scheduler — cycle-free.
//   packages/llm already depends on @zod/scheduler-registry, so orchestrator
//   importing it too creates no cycle (scheduler never imports orchestrator).

import {
  type SchedulerModule,
  type TickLogger,
  registerAuditDrain,
} from '@zod/scheduler-registry';
import { drainStep2Rows, type DrainOpts } from './orchestrator.js';
import { createLogger, type Logger } from '@zod/logger';

const log = createLogger('info').child({ component: 'orchestrator/integration' });

export interface OrchestratorSchedulerOpts {
  /** PocketBase-like handle for scratchpad/opportunities/tombstone writes. */
  pb: unknown;
  /** LlmRouter for audit completions. */
  router: DrainOpts['router'];
  /** Page size for bounded STEP_2 getList. Default 25. */
  pageSize?: number;
  /** Injected scheduler module (tests use fakes). Defaults to real cron. */
  mod?: SchedulerModule;
}

/** Starts the audit-drain job via registerAuditDrain (injected tickHandler). */
export class OrchestratorScheduler {
  private handle: { stop(): void } | null = null;
  private readonly opts: OrchestratorSchedulerOpts;

  constructor(opts: OrchestratorSchedulerOpts) {
    this.opts = opts;
  }

  /** Register + start the audit-drain job via the single scheduler registry. */
  start(log: TickLogger): void {
    const { pb, router, pageSize = 25, mod } = this.opts;
    const tickHandler = async (def: { name: string }, _log: TickLogger): Promise<void> => {
      switch (def.name) {
        case 'audit-drain':
          await drainStep2Rows({
            pb: pb as unknown as DrainOpts['pb'],
            router: router as unknown as DrainOpts['router'],
            log: log as unknown as Logger,
            pageSize,
          });
          break;
      }
    };
    this.handle = registerAuditDrain(log, mod, { tickHandler });
    log.info({ component: 'orchestrator' }, 'audit-drain job registered via registerAuditDrain');
  }

  /** Expose the drain tickHandler for external registration (cycle-free: scheduler never imports orchestrator). */
  getTickHandler(): (def: { name: string }, log: TickLogger) => Promise<void> | void {
    const { pb, router, pageSize = 25 } = this.opts;
    return async (def: { name: string }, _log: TickLogger): Promise<void> => {
      if (def.name !== 'audit-drain') return;
      await drainStep2Rows({
        pb: pb as unknown as DrainOpts['pb'],
        router: router as unknown as DrainOpts['router'],
        log: _log as unknown as Logger,
        pageSize,
      });
    };
  }

  /** Stop the audit-drain task. */
  stop(): void {
    this.handle?.stop();
  }
}
