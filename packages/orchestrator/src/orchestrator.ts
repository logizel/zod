// Audit orchestrator: drain STEP_2 task_scratchpad rows → rule pack →
// LlmRouter.complete → deterministic gates → opportunities create or tombstone
// → advanceToStep3, with per-row error isolation.
//
// T-05-04: bounded getList (page size 25, step_position = 'STEP_2' filter).
// T-05-05: url_hash pre-check before opportunities create; tombstones terminal.
// T-05-06: pipeline comes from the code-owned scratchpad row, never candidate data.
// T-05-07: structural PbLike port (no global PocketBase type), explicit rows.

import { hashUrl, normalizeUrl } from '@zod/dedup';
import type { TaskScratchpadRow } from '@zod/db-hot/schema';
import { LlmRouter } from '@zod/llm';
import { createLogger, type Logger } from '@zod/logger';
import { buildJobsMessages, parseJobsVerdict, type JobsVerdict } from './rule-packs/jobs.js';
import { evaluateJobsGates, BUCKET_JOBS_GENERAL, type JobsGateResult } from './gates/jobs.js';

const log = createLogger('info').child({ component: 'orchestrator' });

// ---------------------------------------------------------------------------
// Structural PocketBase surface (decoupled from the pocketbase package type)
// ---------------------------------------------------------------------------

interface ScratchpadCollection {
  getList(
    page: number,
    perPage: number,
    options?: unknown,
  ): Promise<{ items: TaskScratchpadRow[]; totalItems: number }>;
  update(id: string, data: Record<string, unknown>): Promise<void>;
}

interface OpportunitiesCollection {
  create(data: Record<string, unknown>): Promise<unknown>;
  getList?(page: number, perPage: number, options?: unknown): Promise<{ items: unknown[]; totalItems: number }>;
}

interface TombstoneCollection {
  create(data: Record<string, unknown>): Promise<unknown>;
}

interface PbLike {
  collection(name: string): ScratchpadCollection | OpportunitiesCollection | TombstoneCollection;
}

function scratchpadColl(pb: PbLike): ScratchpadCollection {
  return pb.collection('task_scratchpad') as unknown as ScratchpadCollection;
}

function opportunitiesColl(pb: PbLike): OpportunitiesCollection {
  return pb.collection('opportunities') as unknown as OpportunitiesCollection;
}

function tombstonesColl(pb: PbLike): TombstoneCollection {
  return pb.collection('tombstone_ledger') as unknown as TombstoneCollection;
}

// ---------------------------------------------------------------------------
// Drain options
// ---------------------------------------------------------------------------

export interface DrainOpts {
  pb: PbLike;
  router: LlmRouter;
  log?: Logger;
  /** Page size for the bounded STEP_2 getList (T-05-04). Default 25. */
  pageSize?: number;
}

// ---------------------------------------------------------------------------
// drainStep2Rows — the missing middle
// ---------------------------------------------------------------------------

/**
 * Drain STEP_2 scratchpad rows through the audit pipeline.
 * Per-row isolation: a single bad row never aborts the batch.
 */
export async function drainStep2Rows(opts: DrainOpts): Promise<void> {
  const { pb, router, pageSize = 25 } = opts;
  const drainLog = (opts.log ?? log).child({ component: 'orchestrator/drain', pageSize });
  drainLog.info('drain start');

  const page = await scratchpadColl(pb).getList(1, pageSize, {
    filter: "step_position = 'STEP_2'",
    sort: '-created',
  });

  const rows = page.items ?? [];
  drainLog.info({ count: rows.length }, 'STEP_2 rows fetched');

  for (const row of rows) {
    const rowLog = drainLog.child({ rowId: row.id, pipeline: row.pipeline, url: row.candidate_url });
    try {
      await processRow(pb, router, rowLog, row);
    } catch (err) {
      rowLog.warn({ stage: 'row', error: String(err) }, 'row failed, continuing');
    }
  }

  drainLog.info({ processed: rows.length }, 'drain done');
}

async function processRow(
  pb: PbLike,
  router: LlmRouter,
  rowLog: Logger,
  row: TaskScratchpadRow,
): Promise<void> {
  const pipeline = row.pipeline;
  const candidateUrl = row.candidate_url;
  const candidateTitle = row.candidate_title ?? '';
  const fetchedText = row.partial_buffer ?? '';

  // Build rule-pack messages (jobs pipeline in this tracer slice).
  const messages = buildJobsMessages({
    pipeline,
    candidateUrl,
    candidateTitle,
    fetchedText,
  });

  // Call LlmRouter.complete — auditor lane, priority 2 per plan.
  const result = await router.complete({
    messages,
    step1: '',
    step2: fetchedText,
    slot: 'auditor-jobs-1',
    pipeline,
    url: candidateUrl,
    priority: 2,
  });

  // UNVERIFIED / POOL_SATURATED: leave at STEP_2, never write, never crash.
  if (result.verdict === 'UNVERIFIED' || result.verdict === 'POOL_SATURATED') {
    rowLog.info({ verdict: result.verdict, reason: result.reason }, 'no verdict; leaving at STEP_2');
    return;
  }

  // Parse the verdict through the zod boundary.
  const verdict = parseJobsVerdict(result.verdict);
  if (!verdict) {
    rowLog.warn({ stage: 'verdict_parse' }, 'verdict parse failed; tombstoning');
    await writeTombstone(pb, candidateUrl, 'verdict_parse_failed', 'auditor');
    await scratchpadColl(pb).update(row.id, { step_position: 'STEP_3' });
    rowLog.info({ reasonCode: 'verdict_parse_failed' }, 'tombstone written (parse failure)');
    return;
  }

  // Evaluate deterministic gates over the verdict + text.
  const gate: JobsGateResult = evaluateJobsGates(verdict, fetchedText);

  if (!gate.admitted) {
    // Reject → tombstone only, never an opportunities row (logged-not-alerted).
    const reasonCode = gate.reasonCode ?? 'rejected';
    await writeTombstone(pb, candidateUrl, reasonCode, 'auditor');
    await scratchpadColl(pb).update(row.id, { step_position: 'STEP_3' });
    rowLog.info({ reasonCode }, 'tombstone written (rejected)');
    return;
  }

  // Admit → create opportunities row with url_hash pre-check (idempotent drain).
  const bucketChannel = gate.bucketChannel ?? BUCKET_JOBS_GENERAL;

  const urlHash = hashUrl(normalizeUrl(candidateUrl));
  await createOpportunityIfAbsent(pb, {
    url_hash: urlHash,
    fingerprint_hash: urlHash,
    pipeline,
    bucket_channel: bucketChannel,
    status: 'audited',
    title: candidateTitle,
    organizer: '',
    links: { official: candidateUrl },
    experience_span: verdict.experience_span ?? null,
    stack_tags: verdict.stack_tags ?? [],
    eligibility_summary: verdict.eligibility_summary ?? '',
    audit_summary: verdict.audit_summary,
    description_raw: fetchedText.slice(0, 8000),
  });
  await scratchpadColl(pb).update(row.id, { step_position: 'STEP_3' });
  rowLog.info({ bucketChannel }, 'opportunity written (audited)');
}

/** Idempotent create: skip if an opportunities row already exists for url_hash. */
async function createOpportunityIfAbsent(
  pb: PbLike,
  data: Record<string, unknown>,
): Promise<void> {
  const urlHash = String(data.url_hash);
  const coll = opportunitiesColl(pb);

  // T-05-05: url_hash pre-check — bounded getList before create.
  const getList = (coll as any).getList;
  if (typeof getList === 'function') {
    try {
      const page = await getList.call(coll, 1, 1, {
        filter: `url_hash = '${urlHash.replace(/'/g, "''")}'`,
      });
      if ((page.items ?? []).length > 0) {
        // Already written — idempotent skip.
        return;
      }
    } catch {
      // getList not supported or failed — proceed to create (best effort)
    }
  }

  await coll.create(data);
}

async function writeTombstone(
  pb: PbLike,
  candidateUrl: string,
  terminalStatus: string,
  source: string,
): Promise<void> {
  const urlHash = hashUrl(normalizeUrl(candidateUrl));
  await tombstonesColl(pb).create({
    url_hash: urlHash,
    fingerprint: urlHash,
    terminal_status: terminalStatus,
    source,
    decided_at: new Date().toISOString(),
  });
}
