// Per-bucket state writer to agent_telemetry (D-01, MEM-02).
//
// Upserts an agent_telemetry row on every bucket state transition so the
// operator sees READY → 60s-COOLDOWN → READY via the dashboard SSE stream.
// PocketBase collection shape comes from packages/db-hot/src/schema.ts.

import type { AgentTelemetryRow } from '@zod/db-hot/schema';

interface TelemetryCollection {
  getFirstListItem(filter: string, options?: unknown): Promise<AgentTelemetryRow>;
  /** Paginated list for bucket status history (operator visibility). */
  getList(page: number, perPage: number, options?: unknown): Promise<{ items: AgentTelemetryRow[]; totalItems: number }>;
  create(data: Record<string, unknown>): Promise<AgentTelemetryRow>;
  update(id: string, data: Record<string, unknown>): Promise<AgentTelemetryRow | void>;
}

/** Minimal structural PocketBase surface — decouples from the pocketbase package type. */
interface PbLike {
  collection(name: string): TelemetryCollection;
}

function telemetry(pb: PbLike): TelemetryCollection {
  return pb.collection('agent_telemetry') as unknown as TelemetryCollection;
}

export interface BucketStateInput {
  slot: string;        // rolling agent slot id (e.g. "auditor-events-1")
  provider: string;    // e.g. "groq"
  model: string;       // e.g. "llama-3.1-8b-instant"
  step: string;        // pipeline micro-step (e.g. "STEP_3-audit")
  url: string;         // candidate URL being audited
  status: 'active' | 'done' | 'cooldown' | 'error';
  detail: string;      // micro-step detail ticker
}

/**
 * Upsert an agent_telemetry row for a bucket state transition.
 * Existing row (matched by slot + provider + model + step) is updated;
 * otherwise a new row is created.
 */
export async function writeBucketState(
  pb: PbLike,
  input: BucketStateInput,
): Promise<void> {
  const { slot, provider, model, step, url, status, detail } = input;
  const escapedSlot = slot.replace(/'/g, "''");
  const escapedProvider = provider.replace(/'/g, "''");
  const escapedModel = model.replace(/'/g, "''");
  const escapedStep = step.replace(/'/g, "''");

  const filter = `slot = '${escapedSlot}' && provider = '${escapedProvider}' && model = '${escapedModel}' && step = '${escapedStep}'`;

  let row: AgentTelemetryRow;
  try {
    row = await telemetry(pb).getFirstListItem(filter);
  } catch {
    // No existing row — create one.
    await telemetry(pb).create({
      slot,
      provider,
      model,
      step,
      url,
      status,
      detail,
    });
    return;
  }

  // Row exists — update it.
  await telemetry(pb).update(row.id, {
    status,
    detail,
    url,
    updated: new Date().toISOString(),
  });
}

/** Read the latest agent_telemetry row status for a bucket (operator display).
 * Returns the most recently updated row's status, or null when no row exists. */
export async function readBucketState(
  pb: PbLike,
  provider: string,
  model: string,
): Promise<BucketStateInput['status'] | null> {
  const escapedProvider = provider.replace(/'/g, "''");
  const escapedModel = model.replace(/'/g, "''");
  const filter = `provider = '${escapedProvider}' && model = '${escapedModel}'`;
  try {
    const row = await telemetry(pb).getFirstListItem(filter, { sort: '-updated' });
    return row.status;
  } catch {
    return null;
  }
}

/** Return the bucket status transition history for operator visibility.
 * Most recent first, up to `limit` rows (default 50). */
export async function bucketStatusHistory(
  pb: PbLike,
  provider: string,
  model: string,
  limit = 50,
): Promise<Array<{ status: string; updated: string; detail: string }>> {
  const escapedProvider = provider.replace(/'/g, "''");
  const escapedModel = model.replace(/'/g, "''");
  const filter = `provider = '${escapedProvider}' && model = '${escapedModel}'`;
  try {
    const result = await telemetry(pb).getList(1, limit, { filter, sort: '-updated' });
    return result.items.map((row) => ({
      status: row.status,
      updated: row.updated,
      detail: row.detail,
    }));
  } catch {
    return [];
  }
}
