// TBA re-audit loop: scans deadlines.tba=true rows, re-audits every 48h,
// fires Ping #1 (TBA detected) and Ping #2 (confirmed/expired).
// Reuses the existing audit-drain tick (every 5m + 60s jitter) — no new
// scheduler job (D-10).
//
// Ping #1 is fired by the orchestrator (processEventsRow / drainLocalRow)
// when TBA is first detected. Ping #2 is fired here when prize/date is
// confirmed or the event date passes. The loop terminates on either condition.

import { hashUrl, normalizeUrl } from '@zod/dedup';
import { LlmRouter, type ChatMessage } from '@zod/llm';
import { createLogger, type Logger } from '@zod/logger';
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

export interface TBAOpts {
  pb: any;
  router: LlmRouter;
  log?: Logger;
}

const TBA_RADAR_CHANNEL = '#⏳-early-tba-radar';
const TBA_SCAN_PAGE_SIZE = 50;

function fortyEightHoursAgoISO(): string {
  return new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
}

/** Scan TBA opportunities due for re-audit (>48h since last update). */
export async function tbaReauditScan(opts: TBAOpts): Promise<void> {
  const { pb, router, log = createLogger('info').child({ component: 'orchestrator/tba' }) } = opts;
  const tbaLog = log.child({ component: 'tba-reaudit-scan' });

  const coll = pb.collection('opportunities');
  const page = await coll.getList(1, TBA_SCAN_PAGE_SIZE, {
    filter: `deadlines.tba = true && updated < '${fortyEightHoursAgoISO()}'`,
    sort: 'updated',
  });

  const rows = page.items ?? [];
  tbaLog.info({ count: rows.length }, 'TBA rows due for re-audit');

  for (const row of rows) {
    try {
      await reauditTbaRow(pb, router, tbaLog, row as any);
    } catch (err) {
      tbaLog.warn({ rowId: (row as any).id, error: String(err) }, 'TBA re-audit row failed, continuing');
    }
  }
}

/** Re-audit a single TBA row and resolve to Ping #2 or keep on the 48h loop. */
async function reauditTbaRow(
  pb: any,
  router: LlmRouter,
  rowLog: Logger,
  row: any,
): Promise<void> {
  const pipeline = row.pipeline;
  const fetchedText = row.description_raw ?? '';
  const candidateUrl = row.links?.official ?? '';

  // Build messages based on pipeline (events or local).
  let messages: ChatMessage[];
  if (pipeline === 'local') {
    messages = buildLocalMessages({
      pipeline: 'local',
      candidateUrl,
      candidateTitle: row.title,
      fetchedText,
    });
  } else {
    messages = buildEventsMessages({
      pipeline: 'events',
      candidateUrl,
      candidateTitle: row.title,
      fetchedText,
    });
  }

  const result = await router.complete({
    messages,
    step1: '',
    step2: fetchedText,
    slot: 'auditor-tba-1',
    pipeline,
    url: candidateUrl,
    priority: 2,
  });

  // UNVERIFIED / POOL_SATURATED: keep TBA, refresh timestamp for next 48h scan.
  if (result.verdict === 'UNVERIFIED' || result.verdict === 'POOL_SATURATED') {
    rowLog.info({ verdict: result.verdict }, 'TBA re-audit no verdict; keeping TBA');
    await pb.collection('opportunities').update(row.id, {
      updated: new Date().toISOString(),
      deadlines: { tba: true },
    });
    return;
  }

  // Parse verdict based on pipeline.
  let verdict: EventsVerdict | LocalVerdict | null;
  if (pipeline === 'local') {
    verdict = parseLocalVerdict(result.verdict);
  } else {
    verdict = parseEventsVerdict(result.verdict);
  }

  if (!verdict) {
    rowLog.warn({ stage: 'verdict_parse' }, 'TBA re-audit parse failed; keeping TBA');
    await pb.collection('opportunities').update(row.id, {
      updated: new Date().toISOString(),
      deadlines: { tba: true },
    });
    return;
  }

  const now = new Date();

  // Terminal condition 2 (checked first): event date has passed → Ping #2 (expired).
  // An expired event is never "confirmed" even if prize/dates are now known.
  if (verdict.dates) {
    const eventEnd = new Date(verdict.dates.end);
    if (!isNaN(eventEnd.getTime()) && eventEnd < now) {
      await pb.collection('opportunities').update(row.id, {
        deadlines: { tba: false },
        status: 'expired',
        updated: new Date().toISOString(),
      });
      const urlHash = hashUrl(normalizeUrl(candidateUrl));
      await pb.collection('tombstone_ledger').create({
        url_hash: urlHash,
        fingerprint: urlHash,
        terminal_status: 'event_expired',
        source: 'tba-loop',
        decided_at: new Date().toISOString(),
      });
      rowLog.info({ rowId: row.id }, 'Ping #2: TBA expired, event date passed');
      return;
    }
  }

  // Terminal condition 1: prize/date now confirmed → Ping #2 (confirmed).
  const prizeConfirmed = verdict.prize_cash_inr !== null && verdict.prize_cash_inr !== undefined;
  const datesConfirmed = verdict.dates !== null && verdict.dates !== undefined;

  if (prizeConfirmed || datesConfirmed) {
    const updateData: Record<string, unknown> = {
      deadlines: { tba: false },
      prize_cash_inr: verdict.prize_cash_inr ?? null,
      prize_text: verdict.prize_text,
      status: 'audited',
      updated: new Date().toISOString(),
    };
    if (verdict.dates) {
      (updateData.deadlines as Record<string, unknown>).event_start = verdict.dates.start;
      (updateData.deadlines as Record<string, unknown>).event_end = verdict.dates.end;
    }
    // Route to TBA radar channel (Ping #2 confirmed post)
    await pb.collection('opportunities').update(row.id, {
      ...updateData,
      bucket_channel: TBA_RADAR_CHANNEL,
    });
    rowLog.info(
      { rowId: row.id, prize_cash_inr: verdict.prize_cash_inr, dates: verdict.dates },
      'Ping #2: TBA confirmed, prize/date resolved',
    );
    return;
  }

  // Still TBA — keep tba=true, refresh timestamp so next scan is 48h later.
  // Do NOT re-ping — Ping #1 already fired when TBA was first detected.
  await pb.collection('opportunities').update(row.id, {
    updated: new Date().toISOString(),
    deadlines: { tba: true },
  });
  rowLog.info({ rowId: row.id }, 'Still TBA after re-audit; keeping on 48h loop');
}
