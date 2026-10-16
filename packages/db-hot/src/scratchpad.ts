import * as z from 'zod';
import type PocketBase from 'pocketbase';
import { Pipeline, TaskScratchpadRow } from './schema.js';
import { hashUrl, normalizeUrl } from '@zod/dedup';

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

interface TombstoneCollection {
  create(data: Record<string, unknown>): Promise<unknown>;
}

function scratchpad(pb: PocketBase): ScratchpadCollection {
  return pb.collection('task_scratchpad') as unknown as ScratchpadCollection;
}

function tombstones(pb: PocketBase): TombstoneCollection {
  return pb.collection('tombstone_ledger') as unknown as TombstoneCollection;
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
): Promise<void> {
  await scratchpad(pb).update(id, {
    step_position: 'STEP_2',
    partial_buffer: markdown.slice(0, 8000),
  });
}

export async function advanceToStep3(
  pb: PocketBase,
  id: string,
): Promise<void> {
  await scratchpad(pb).update(id, {
    step_position: 'STEP_3',
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
    last_error: error,
  });
  let tombstoned = false;
  if (attempts >= 5) {
    const url = row.candidate_url;
    const urlHash = hashUrl(normalizeUrl(url));
    await tombstones(pb).create({
      url_hash: urlHash,
      fingerprint: urlHash,
      terminal_status: 'fetch_failed',
      source: 'scratchpad',
      decided_at: new Date().toISOString(),
    });
    tombstoned = true;
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
