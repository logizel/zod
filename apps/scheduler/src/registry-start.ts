// Scheduler entry -> registry wiring (contract-fixed @zod/* import).
//
// Boot order stays: env parse -> logger -> registry start. Production runs the
// compiled emit (node dist); dev-only watch mode is `pnpm dev` (tsx watch).
// The registry keeps the event loop alive, so this process runs 24/7.
import { startRegistry, type RegistryHandle, type TickLogger } from '@zod/scheduler-registry';

export function startSchedulerRegistry(log: TickLogger): RegistryHandle {
  return startRegistry(log);
}

export type { RegistryHandle };
