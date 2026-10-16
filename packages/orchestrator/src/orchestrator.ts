// Audit orchestrator: drain STEP_2 task_scratchpad rows → rule pack →
// LlmRouter.complete → deterministic gates → opportunities create or tombstone
// → advanceToStep3, with per-row error isolation.
//
// T-05-04: bounded getList (page size 25, step_position = 'STEP_2' filter).
// T-05-05: url_hash pre-check before opportunities create; tombstones terminal.
// T-05-06: pipeline comes from the code-owned scratchpad row, never candidate data.
// T-05-07: structural PbLike port (no global PocketBase type), explicit rows.

import { hashUrl, normalizeUrl } from '@zod/dedup';
import { attemptMerge, createMergeStore } from '@zod/dedup/merger';
import type { TaskScratchpadRow } from '@zod/db-hot/schema';
import { LlmRouter } from '@zod/llm';
import { createLogger, type Logger } from '@zod/logger';
import { buildJobsMessages, parseJobsVerdict, type JobsVerdict } from './rule-packs/jobs.js';
import { evaluateJobsGates, BUCKET_JOBS_GENERAL, type JobsGateResult } from './gates/jobs.js';
import {
  buildLootMessages,
  parseLootVerdict,
  type LootVerdict,
} from './rule-packs/loot.js';
import {
  buildEventsMessages,
  parseEventsVerdict,
  type EventsVerdict,
} from './rule-packs/events.js';
import {
  buildLocalMessages,
  parseLocalVerdict,
  type LocalVerdict,
} from './rule-packs/local.js';
import { evaluateLootGates, BUCKET_LOOT, type LootGateResult } from './gates/loot.js';
import { readLootRules } from './loot-faq.js';
import { passesPrizeGate } from '@zod/discord-router/prize-gate';
import { resolveOfficialDomain } from '@zod/discord-router/link-hop';
import { prefilter as domainPrefilter } from '@zod/discord-router/domain-filter';

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
  // Dispatch by pipeline. The scratchpad row's pipeline field is authoritative
  // (never candidate data) — T-05-06.
  switch (row.pipeline) {
    case 'loot':
      return await drainLootRow(pb, router, rowLog, row);
    case 'events':
      return await processEventsRow(pb, router, rowLog, row);
    case 'local':
      return await drainLocalRow(pb, router, rowLog, row);
    case 'jobs':
    default:
      return await processJobsRow(pb, router, rowLog, row);
  }
}

/** Jobs audit flow: rule pack → router → jobs gates → write/tombstone. */
async function processJobsRow(
  pb: PbLike,
  router: LlmRouter,
  rowLog: Logger,
  row: TaskScratchpadRow,
): Promise<void> {
  const pipeline = row.pipeline;
  const candidateUrl = row.candidate_url;
  const candidateTitle = row.candidate_title ?? '';
  const fetchedText = row.partial_buffer ?? '';

  // Build rule-pack messages (jobs pipeline).
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

  // D-10: drain backstop — merge before opportunities create.
  // A same-batch duplicate folds into the master (append links + tombstone, no create).
  // A possible dupe carries possible_dupe_of on the created row.
  let possibleDupeOf = '';
  if (pb !== undefined) {
    const store = createMergeStore({ pb: pb as any });
    const pipeline = row.pipeline as 'events' | 'jobs';
    const mergeResult = await attemptMerge(
      {
        pipeline,
        title: row.candidate_title ?? '',
        url: row.candidate_url,
        organizer: (row.organizer as string | undefined) ?? undefined,
        dateMs: undefined,
        location: undefined,
      },
      store,
    );

    if (mergeResult.merged) {
      await writeTombstone(pb, row.candidate_url, 'merged', 'merger');
      await scratchpadColl(pb).update(row.id, { step_position: 'STEP_3' });
      rowLog.info(
        { stage: 'backstop', masterId: mergeResult.masterId },
        'merged at drain — no opportunity create',
      );
      return;
    }
    if (mergeResult.possibleDupe && mergeResult.masterId) {
      possibleDupeOf = mergeResult.masterId;
    }
  }

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
    possible_dupe_of: possibleDupeOf,
  });
  await scratchpadColl(pb).update(row.id, { step_position: 'STEP_3' });
  rowLog.info({ bucketChannel }, 'opportunity written (audited)');
}

/**
 * Loot audit flow (D-13): readLootRules → loot rule pack → router → loot gates
 * → opportunities write (loot fields) | tombstone (loot reason verbatim).
 *
 * This is a named export reused by the events divert (plan 05-04 Task 2) — no
 * duplicated logic between the direct loot branch and the divert path.
 */
export async function drainLootRow(
  pb: PbLike,
  router: LlmRouter,
  rowLog: Logger,
  row: TaskScratchpadRow,
): Promise<void> {
  const candidateUrl = row.candidate_url;
  const candidateTitle = row.candidate_title ?? '';

  // Step 1: read the official FAQ/rules page (2-hop cap, SSRF-guarded).
  // Hop failure → tombstone link_hop_failed, no audit on unfetched content.
  const faqText = await readLootRules(candidateUrl);
  if (faqText === null) {
    rowLog.info({ stage: 'readLootRules' }, 'FAQ read failed; tombstoning link_hop_failed');
    await writeTombstone(pb, candidateUrl, 'link_hop_failed', 'auditor');
    await scratchpadColl(pb).update(row.id, { step_position: 'STEP_3' });
    rowLog.info({ reasonCode: 'link_hop_failed' }, 'tombstone written (hop failure)');
    return;
  }

  // Step 2: build loot audit messages (FAQ text framed as untrusted data).
  const messages = buildLootMessages({
    pipeline: 'loot',
    candidateUrl,
    candidateTitle,
    fetchedText: faqText,
  });

  // Call LlmRouter.complete — auditor-loot-1 lane, priority 2 per plan.
  const result = await router.complete({
    messages,
    step1: '',
    step2: faqText.slice(0, 8000),
    slot: 'auditor-loot-1',
    pipeline: 'loot',
    url: candidateUrl,
    priority: 2,
  });

  // UNVERIFIED / POOL_SATURATED: leave at STEP_2, never write, never crash.
  if (result.verdict === 'UNVERIFIED' || result.verdict === 'POOL_SATURATED') {
    rowLog.info({ verdict: result.verdict, reason: result.reason }, 'no verdict; leaving at STEP_2');
    return;
  }

  // Parse the verdict through the zod boundary.
  const verdict = parseLootVerdict(result.verdict);
  if (!verdict) {
    rowLog.warn({ stage: 'verdict_parse' }, 'verdict parse failed; tombstoning');
    await writeTombstone(pb, candidateUrl, 'verdict_parse_failed', 'auditor');
    await scratchpadColl(pb).update(row.id, { step_position: 'STEP_3' });
    rowLog.info({ reasonCode: 'verdict_parse_failed' }, 'tombstone written (parse failure)');
    return;
  }

  // Evaluate deterministic loot gates (final authority).
  const gate: LootGateResult = evaluateLootGates(verdict);

  if (!gate.admitted) {
    // Reject → tombstone with the loot reason verbatim (logged-not-alerted).
    const reasonCode = gate.reasonCode ?? 'rejected';
    await writeTombstone(pb, candidateUrl, reasonCode, 'auditor');
    await scratchpadColl(pb).update(row.id, { step_position: 'STEP_3' });
    rowLog.info({ reasonCode }, 'tombstone written (rejected)');
    return;
  }

  // Admit → create opportunities row with loot fields + bucket (idempotent drain).
  const bucketChannel = gate.bucketChannel ?? BUCKET_LOOT;

  const urlHash = hashUrl(normalizeUrl(candidateUrl));
  await createOpportunityIfAbsent(pb, {
    url_hash: urlHash,
    fingerprint_hash: urlHash,
    pipeline: 'loot',
    bucket_channel: bucketChannel,
    status: 'audited',
    title: candidateTitle,
    organizer: '',
    links: { official: candidateUrl },
    shipping_verified: verdict.shipping_verified,
    card_required: verdict.card_required,
    claim_steps: verdict.claim_steps,
    audit_summary: verdict.audit_summary,
    description_raw: faqText.slice(0, 8000),
  });
  await scratchpadColl(pb).update(row.id, { step_position: 'STEP_3' });
  rowLog.info({ bucketChannel }, 'loot opportunity written (audited)');
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

/**
 * Events audit flow: rule pack → router → resolveOfficialDomain (2-hop) →
 * 80/20 domain filter → prize gate → admit (category bucket) | divert
 * (perk_hint → loot branch on same row) | prize_below_threshold tombstone.
 *
 * The divert calls drainLootRow — exactly one terminal outcome (loot row or
 * loot tombstone), never an events opportunity and never a prize_below_threshold
 * tombstone in the divert flow (LOT-01).
 */
async function processEventsRow(
  pb: PbLike,
  router: LlmRouter,
  rowLog: Logger,
  row: TaskScratchpadRow,
): Promise<void> {
  const candidateUrl = row.candidate_url;
  const candidateTitle = row.candidate_title ?? '';
  const fetchedText = row.partial_buffer ?? '';

  // Step 1: build events audit messages + call LlmRouter (auditor-events-1).
  const messages = buildEventsMessages({
    pipeline: 'events',
    candidateUrl,
    candidateTitle,
    fetchedText,
  });

  const result = await router.complete({
    messages,
    step1: '',
    step2: fetchedText,
    slot: 'auditor-events-1',
    pipeline: 'events',
    url: candidateUrl,
    priority: 2,
  });

  // UNVERIFIED / POOL_SATURATED: leave at STEP_2, never write, never crash.
  if (result.verdict === 'UNVERIFIED' || result.verdict === 'POOL_SATURATED') {
    rowLog.info({ verdict: result.verdict, reason: result.reason }, 'no verdict; leaving at STEP_2');
    return;
  }

  // Step 2: parse the verdict through the zod boundary.
  const verdict = parseEventsVerdict(result.verdict);
  if (!verdict) {
    rowLog.warn({ stage: 'verdict_parse' }, 'verdict parse failed; tombstoning');
    await writeTombstone(pb, candidateUrl, 'verdict_parse_failed', 'auditor');
    await scratchpadColl(pb).update(row.id, { step_position: 'STEP_3' });
    return;
  }

  // Step 3: resolve official domain within the 2-hop cap (SSRF-guarded).
  const hop = await resolveOfficialDomain(candidateUrl, 2);
  if (!hop.ok) {
    rowLog.info({ stage: 'resolveOfficialDomain' }, 'domain resolution failed; tombstoning link_hop_failed');
    await writeTombstone(pb, candidateUrl, 'link_hop_failed', 'auditor');
    await scratchpadColl(pb).update(row.id, { step_position: 'STEP_3' });
    return;
  }

  // Step 4: 80/20 domain filter with organizer/agenda scores from the verdict.
  const domainVerdict = domainPrefilter(
    { title: verdict.title, snippet: verdict.audit_summary },
    { organizerScore: verdict.organizer_score, agendaScore: verdict.agenda_score },
  );
  if (domainVerdict.verdict === 'reject') {
    rowLog.info({ stage: 'domain-filter', reason: domainVerdict.reason }, 'domain filter rejected; tombstoning');
    await writeTombstone(pb, candidateUrl, domainVerdict.reason, 'auditor');
    await scratchpadColl(pb).update(row.id, { step_position: 'STEP_3' });
    return;
  }

  // Step 5: prize gate — explicit liquid cash >= ₹1L, credits stripped.
  const prizeGatePasses = passesPrizeGate(verdict.prize_text, verdict.prize_cash_inr);

  if (prizeGatePasses) {
    // Admit → opportunities row with Phase 4 bucket for the verdict category.
    const bucketChannel =
      verdict.category === 'sys-cp-sec' ? '#🔥-priority-sys-cp-sec' : '#-online-1lakh-plus';

    // D-10: drain backstop — merge before opportunities create (events).
    let possibleDupeOf = '';
    if (pb !== undefined) {
      const store = createMergeStore({ pb: pb as any });
      const mergeResult = await attemptMerge(
        {
          pipeline: 'events',
          title: candidateTitle,
          url: candidateUrl,
          organizer: (verdict.organizer as string | undefined) ?? undefined,
          dateMs: undefined,
          location: undefined,
        },
        store,
      );

      if (mergeResult.merged) {
        await writeTombstone(pb, candidateUrl, 'merged', 'merger');
        await scratchpadColl(pb).update(row.id, { step_position: 'STEP_3' });
        rowLog.info(
          { stage: 'backstop', masterId: mergeResult.masterId },
          'merged at drain — no opportunity create',
        );
        return;
      }
      if (mergeResult.possibleDupe && mergeResult.masterId) {
        possibleDupeOf = mergeResult.masterId;
      }
    }

    const urlHash = hashUrl(normalizeUrl(candidateUrl));
    await createOpportunityIfAbsent(pb, {
      url_hash: urlHash,
      fingerprint_hash: urlHash,
      pipeline: 'events',
      bucket_channel: bucketChannel,
      status: 'audited',
      title: candidateTitle,
      organizer: verdict.organizer,
      links: { official: candidateUrl },
      prize_cash_inr: verdict.prize_cash_inr ?? null,
      prize_text: verdict.prize_text,
      audit_summary: verdict.audit_summary,
      description_raw: fetchedText.slice(0, 8000),
      possible_dupe_of: possibleDupeOf,
    });
    await scratchpadColl(pb).update(row.id, { step_position: 'STEP_3' });
    rowLog.info({ bucketChannel }, 'events opportunity written (audited)');
    return;
  }

  // Prize gate failed.
  if (verdict.perk_hint) {
    // LOT-01 divert: perk-carrying event → loot branch on the same row.
    // drainLootRow is the single terminal outcome (loot row or loot tombstone).
    await drainLootRow(pb, router, rowLog, row);
    return;
  }

  // No perk → tombstone prize_below_threshold only.
  await writeTombstone(pb, candidateUrl, 'prize_below_threshold', 'auditor');
  await scratchpadColl(pb).update(row.id, { step_position: 'STEP_3' });
  rowLog.info({ reasonCode: 'prize_below_threshold' }, 'tombstone written (prize below threshold)');
}

/**
 * Local audit flow (D-02): rule pack → router → geo classification → bucket
 * routing → opportunities write | tombstone.
 *
 * Geo classification is location-primary: event location text / venue city is
 * the primary signal; organizer city is secondary. "Selection round" /
 * "registration" keyword distinguishes travel-curated (has selection) from
 * walk-in-reject (no selection round).
 *
 *   - DK/Udupi offline → #📍-local-dk-udupi regardless of prize size
 *   - Out-of-town offline + hasSelectionRound → #✈️-travel-curated
 *   - Out-of-town offline + !hasSelectionRound → tombstone walk_in_rejected
 *   - Online → standard prize gate (>= ₹1L), else perk divert / tombstone
 *
 * Follows the same buildMessages → router.complete → parseVerdict → gates →
 * write/tombstone pattern as processEventsRow.
 */
async function drainLocalRow(
  pb: PbLike,
  router: LlmRouter,
  rowLog: Logger,
  row: TaskScratchpadRow,
): Promise<void> {
  const candidateUrl = row.candidate_url;
  const candidateTitle = row.candidate_title ?? '';
  const fetchedText = row.partial_buffer ?? '';

  // Step 1: build local messages + call LlmRouter (auditor-local-1).
  const messages = buildLocalMessages({
    pipeline: 'local',
    candidateUrl,
    candidateTitle,
    fetchedText,
  });

  const result = await router.complete({
    messages,
    step1: '',
    step2: fetchedText,
    slot: 'auditor-local-1',
    pipeline: 'local',
    url: candidateUrl,
    priority: 2,
  });

  // UNVERIFIED / POOL_SATURATED: leave at STEP_2, never write, never crash.
  if (result.verdict === 'UNVERIFIED' || result.verdict === 'POOL_SATURATED') {
    rowLog.info({ verdict: result.verdict, reason: result.reason }, 'no verdict; leaving at STEP_2');
    return;
  }

  // Step 2: parse the verdict through the zod boundary.
  const verdict = parseLocalVerdict(result.verdict);
  if (!verdict) {
    rowLog.warn({ stage: 'verdict_parse' }, 'verdict parse failed; tombstoning');
    await writeTombstone(pb, candidateUrl, 'verdict_parse_failed', 'auditor');
    await scratchpadColl(pb).update(row.id, { step_position: 'STEP_3' });
    return;
  }

  // Geo classification (D-02): location-primary.
  const isDkUdupi = /DK|Udupi/i.test(verdict.location);

  let bucketChannel: string;
  if (verdict.isOffline && isDkUdupi) {
    // DK/Udupi offline → #📍-local-dk-udupi regardless of prize size.
    bucketChannel = '#📍-local-dk-udupi';
  } else if (verdict.isOffline && verdict.hasSelectionRound) {
    // Out-of-town offline + verified selection round → #✈️-travel-curated.
    // Quality gate: organizer_score >= 5 required for travel-curated admission.
    if (verdict.organizer_score < 5) {
      await writeTombstone(pb, candidateUrl, 'quality_below_threshold', 'auditor');
      await scratchpadColl(pb).update(row.id, { step_position: 'STEP_3' });
      rowLog.info({ reasonCode: 'quality_below_threshold' }, 'tombstone written (quality below threshold)');
      return;
    }
    bucketChannel = '#✈️-travel-curated';
  } else if (verdict.isOffline && !verdict.hasSelectionRound) {
    // Walk-in low-effort out-of-town → tombstone walk_in_rejected.
    await writeTombstone(pb, candidateUrl, 'walk_in_rejected', 'auditor');
    await scratchpadColl(pb).update(row.id, { step_position: 'STEP_3' });
    rowLog.info({ reasonCode: 'walk_in_rejected' }, 'tombstone written (walk-in rejected)');
    return;
  } else {
    // Online events → standard prize gate (>= ₹1L liquid cash).
    const prizeGatePasses = passesPrizeGate(verdict.prize_text, verdict.prize_cash_inr);
    if (prizeGatePasses) {
      bucketChannel = verdict.category === 'sys-cp-sec' ? '#🔥-priority-sys-cp-sec' : '#-online-1lakh-plus';
    } else if (verdict.perk_hint) {
      // Perk-carrying online event → divert to loot branch on the same row.
      await drainLootRow(pb, router, rowLog, row);
      return;
    } else {
      await writeTombstone(pb, candidateUrl, 'prize_below_threshold', 'auditor');
      await scratchpadColl(pb).update(row.id, { step_position: 'STEP_3' });
      rowLog.info({ reasonCode: 'prize_below_threshold' }, 'tombstone written (prize below threshold)');
      return;
    }
  }

  // Admit → createOpportunityIfAbsent with pipeline: 'local' (idempotent drain).
  const urlHash = hashUrl(normalizeUrl(candidateUrl));
  await createOpportunityIfAbsent(pb, {
    url_hash: urlHash,
    fingerprint_hash: urlHash,
    pipeline: 'local',
    bucket_channel: bucketChannel,
    status: 'audited',
    title: candidateTitle,
    organizer: verdict.organizer,
    links: { official: candidateUrl },
    prize_cash_inr: verdict.prize_cash_inr ?? null,
    prize_text: verdict.prize_text,
    audit_summary: verdict.audit_summary,
    deadlines: { tba: verdict.prize_cash_inr === null || verdict.dates === null },
    description_raw: fetchedText.slice(0, 8000),
  });
  await scratchpadColl(pb).update(row.id, { step_position: 'STEP_3' });
  rowLog.info({ bucketChannel }, 'local opportunity written (audited)');
}
