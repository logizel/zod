import * as z from 'zod';
import type PocketBase from 'pocketbase';
import { Pipeline, TaskScratchpadRow } from './schema.js';
import { hashUrl, normalizeUrl } from '@zod/dedup';
import { createTombstoneIfAbsent } from './tombstone.js';
import { recordMachineEvent, type MachineEventInput } from './machine-events.js';

export const StepPosition = z.enum(['STEP_1', 'STEP_2', 'STEP_3', 'STEP_4']);
export type StepPosition = z.infer<typeof StepPosition>;

function isNotFound(err: unknown): boolean {
  const e = err as { status?: number; response?: { code?: number; status?: number } } | null;
  const status = e?.status ?? e?.response?.code ?? e?.response?.status;
  return status === 404;
}

interface ScratchpadCollection {
  getFirstListItem(filter: string, options?: unknown): Promise<TaskScratchpadRow>;
  create(data: Record<string, unknown>): Promise<TaskScratchpadRow>;
  update(id: string, data: Record<string, unknown>): Promise<TaskScratchpadRow | void>;
  getOne(id: string): Promise<TaskScratchpadRow>;
}

function scratchpad(pb: PocketBase): ScratchpadCollection {
  return pb.collection('task_scratchpad') as unknown as ScratchpadCollection;
}

type ScratchpadEvent = Omit<MachineEventInput, 'event_type'>;

/** Best-effort scratchpad machine event (never breaks a transition). */
function emitScratchpad(pb: PocketBase, event: ScratchpadEvent): void {
  try {
    recordMachineEvent(pb, { event_type: 'scratchpad', ...event });
  } catch {
    // Observability must never interfere with the pipeline.
  }
}

async function readRow(pb: PocketBase, id: string): Promise<TaskScratchpadRow> {
  const coll = scratchpad(pb);
  if (typeof coll.getOne === 'function') {
    try {
      return await coll.getOne(id);
    } catch (err) {
      // Fall through to filter-based lookup for PB mocks that only implement
      // getFirstListItem.
      if (!isNotFound(err)) {
        // continue anyway
      }
    }
  }
  const escaped = id.replace(/'/g, "''");
  return coll.getFirstListItem(`id = '${escaped}'`);
}

export async function getOrCreateScratchpad(
  pb: PocketBase,
  url: string,
  pipeline: Pipeline = 'events',
  title: string = '',
): Promise<TaskScratchpadRow> {
  const escaped = url.replace(/'/g, "''");
  try {
    return await scratchpad(pb).getFirstListItem(`candidate_url = '${escaped}'`);
  } catch (err) {
    if (!isNotFound(err)) {
      throw err;
    }
    return scratchpad(pb).create({
      candidate_url: url,
      step_position: 'STEP_1',
      pipeline,
      candidate_title: title,
      attempts: 0,
      partial_buffer: '',
      last_error: null,
    });
  }
}

export async function advanceToStep2(
  pb: PocketBase,
  id: string,
  markdown: string,
  candidateUrl = '',
): Promise<void> {
  await scratchpad(pb).update(id, {
    step_position: 'STEP_2',
    partial_buffer: markdown.slice(0, 8000),
    last_error: null,
  });
  emitScratchpad(pb, {
    trace_id: candidateUrl ? hashUrl(normalizeUrl(candidateUrl)) : '',
    agent: 'scratchpad',
    pipeline: '',
    tool: 'scratchpad.advance',
    step: 'STEP_2',
    status: 'ok',
    url: candidateUrl,
    output_summary: `${markdown.length} chars buffered`,
    detail: 'advanced STEP_1 → STEP_2',
  });
}

export async function advanceToStep3(
  pb: PocketBase,
  id: string,
): Promise<void> {
  await scratchpad(pb).update(id, {
    step_position: 'STEP_3',
    last_error: null,
  });
}

export async function recordFailure(
  pb: PocketBase,
  id: string,
  error: string,
): Promise<{ attempts: number; tombstoned: boolean }> {
  const row = await readRow(pb, id);
  const attempts = (row.attempts ?? 0) + 1;
  await scratchpad(pb).update(id, {
    attempts,
    last_error: error.slice(0, 8000),
  });
  const traceId = row.candidate_url ? hashUrl(normalizeUrl(row.candidate_url)) : '';
  emitScratchpad(pb, {
    trace_id: traceId,
    agent: 'scratchpad',
    pipeline: row.pipeline ?? '',
    tool: 'scratchpad.failure',
    step: row.step_position ?? 'STEP_1',
    status: 'error',
    url: row.candidate_url ?? '',
    detail: `attempt ${attempts}: ${error}`,
    meta: { attempts },
  });
  let tombstoned = false;
  if (attempts >= 5) {
    const url = row.candidate_url;
    const urlHash = hashUrl(normalizeUrl(url));
    await createTombstoneIfAbsent(pb, {
      url_hash: urlHash,
      fingerprint: urlHash,
      terminal_status: 'fetch_failed',
      source: 'scratchpad',
      decided_at: new Date().toISOString(),
    });
    tombstoned = true;
    emitScratchpad(pb, {
      trace_id: urlHash,
      agent: 'scratchpad',
      pipeline: row.pipeline ?? '',
      tool: 'scratchpad.tombstone',
      step: row.step_position ?? 'STEP_1',
      status: 'skip',
      url,
      detail: 'tombstoned after 5 fetch failures',
      meta: { attempts },
    });
  }
  return { attempts, tombstoned };
}


export async function resumeByUrl(
  pb: PocketBase,
  url: string,
  pipeline: Pipeline = 'events',
  title: string = '',
): Promise<{ row: TaskScratchpadRow; shouldFetch: boolean }> {
  const row = await getOrCreateScratchpad(pb, url, pipeline, title);
  // StepPosition schema validation — loud on drift.
  StepPosition.parse(row.step_position);
  return { row, shouldFetch: row.step_position === 'STEP_1' };
}
