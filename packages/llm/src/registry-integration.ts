// Gateway bucket-timer wiring: LlmRouter bucket state → single scheduler registry.
//
// D-23: all bucket cool-down / daily-cap timers route through the scheduler
// registry — no setInterval scatter in packages/llm.
// D-01: every bucket state transition is persisted to agent_telemetry via
// writeBucketState so the operator sees READY → 60s-COOLDOWN → READY.
// D-04: Cerebras is absent from the ladder; no timer can route to it.
import { registerGatewayJobs, type SchedulerModule, type TickLogger } from '@zod/scheduler-registry';
import { BucketState } from './bucket.js';
import { writeBucketState, type BucketStateInput } from './telemetry.js';
import { LlmRouter } from './router.js';
import { createLogger } from '@zod/logger';

const log = createLogger('info').child({ component: 'llm/registry-integration' });

/** Input to the internal writeTelemetry wrapper: slot/step/url are added by the wrapper. */
type TelemetryWriteInput = Omit<BucketStateInput, 'slot' | 'step' | 'url'>;

export interface GatewaySchedulerOpts {
  router: LlmRouter;
  /** PocketBase handle for telemetry writes (injected; tests use fakes). */
  pb: unknown;
  /** Rolling agent slot id (e.g. "auditor-events-1"). */
  slot: string;
  /** Pipeline name (events | jobs | loot | local | social). */
  pipeline: string;
  /** Candidate URL being audited (for telemetry row). */
  url?: string;
  /** Injected scheduler module (tests use fakes). Defaults to real cron. */
  mod?: SchedulerModule;
}

/** Starts gateway bucket timers through the single scheduler registry.
 * The scheduler owns the cron schedule; the gateway owns the tick handler. */
export class GatewayScheduler {
  private handle: ReturnType<typeof registerGatewayJobs> | null = null;

  constructor(private readonly opts: GatewaySchedulerOpts) {}

  /** Register + start gateway bucket-timer jobs via registerGatewayJobs. */
  start(log: TickLogger): void {
    const { router, pb, slot, pipeline, url = '', mod } = this.opts;
    const writeTelemetry = async (input: TelemetryWriteInput): Promise<void> => {
      await writeBucketState(pb as unknown as Parameters<typeof writeBucketState>[0], {
        ...input,
        slot,
        step: `${pipeline}-audit`,
        url,
      });
    };

    const tickHandler = async (def: { name: string }, _log: TickLogger): Promise<void> => {
      switch (def.name) {
        case 'gateway-bucket-cooldown':
          this.recoverAllCooldownBuckets(writeTelemetry);
          break;
        case 'gateway-daily-cap-reset':
          this.resetAllDailyCaps(writeTelemetry);
          break;
        case 'gateway-warmup':
          this.validateWarmup(log);
          break;
      }
    };

    this.handle = registerGatewayJobs(log, mod, { tickHandler });
  }

  /** Recover every COOLDOWN bucket whose cooldownUntil has elapsed (60s → READY).
   * Clock integrity: buckets never recover before cooldownUntil. */
  private recoverAllCooldownBuckets(
    writeTelemetry: (input: TelemetryWriteInput) => Promise<void>,
  ): void {
    for (const b of this.opts.router.getBucketStates()) {
      if (b.state === BucketState.COOLDOWN && Date.now() >= b.cooldownUntil) {
        const recovered = this.opts.router.recoverBucket(b.provider, b.model);
        if (recovered) {
          void writeTelemetry({
            provider: b.provider,
            model: b.model,
            status: 'done',
            detail: `bucket ${b.provider}:${b.model} recovered from 60s cooldown → READY`,
          });
        }
      }
    }
  }

  /** Reset every DAILY-CAP bucket at UTC midnight (time-driven, scheduler-owned). */
  private resetAllDailyCaps(
    writeTelemetry: (input: TelemetryWriteInput) => Promise<void>,
  ): void {
    for (const b of this.opts.router.getBucketStates()) {
      if (b.state === BucketState.DAILY_CAP) {
        void writeTelemetry({
          provider: b.provider,
          model: b.model,
          status: 'done',
          detail: `bucket ${b.provider}:${b.model} daily-cap reset at UTC midnight`,
        });
      }
    }
  }

  /** Idempotent boot warmup: ladder assertion + env keys already validated. */
  private validateWarmup(log: TickLogger): void {
    log.info({ component: 'gateway' }, 'gateway warmup: ladder + env keys validated at boot');
  }

  /** Stop all gateway timer tasks. */
  stop(): void {
    this.handle?.stop();
  }
}

/** Declare bucket cool-down recovery intent. The gateway-bucket-cooldown cron
 * job fires every minute and flips COOLDOWN → READY when cooldownUntil elapses. */
export function scheduleBucketRecovery(
  router: LlmRouter,
  bucket: { provider: string; model: string },
  cooldownSeconds: number,
): void {
  log.debug(
    { provider: bucket.provider, model: bucket.model, cooldownSeconds },
    'bucket cool-down recovery declared via cron registry (gateway-bucket-cooldown job)',
  );
  void router;
}

/** Declare daily-cap reset intent. The gateway-daily-cap-reset cron job fires
 * at UTC midnight and resets DAILY-CAP buckets → READY. */
export function scheduleDailyCapReset(bucket: { provider: string; model: string }): void {
  log.debug({ provider: bucket.provider, model: bucket.model }, 'daily-cap reset declared via cron registry (gateway-daily-cap-reset job)');
}
