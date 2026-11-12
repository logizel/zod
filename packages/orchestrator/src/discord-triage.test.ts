import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('@zod/db-hot/machine-events', () => ({
  recordMachineEvent: vi.fn(),
}));

import type { DiscordInboxRow } from '@zod/db-hot/schema';
import {
  TRIAGE_CHANNELS,
  classifyByKeywords,
  detectEventKind,
  hasSysCpSec,
  mapTargetChannel,
  parseTriageVerdict,
  prefilterReason,
  triageDiscordInbox,
} from './discord-triage.js';

const log = { info: vi.fn(), warn: vi.fn() };

function makeRow(overrides: Partial<DiscordInboxRow> = {}): DiscordInboxRow {
  return {
    id: 'inbox-1',
    message_id: '1234567890',
    source_channel_id: 'source-1',
    source_server: 'Original Server',
    source_channel_name: 'announcements',
    guild_id: 'guild-1',
    message_url: 'https://discord.com/channels/guild-1/source-1/1234567890',
    content: '',
    embed_json: [],
    links: [],
    images: [],
    dedup_key: 'abc',
    status: 'pending',
    pipeline: '',
    target_channel: '',
    classification: {},
    posted_message_id: '',
    attempts: 0,
    last_error: '',
    created: '2026-11-01T00:00:00.000Z',
    updated: '2026-11-01T00:00:00.000Z',
    ...overrides,
  } as DiscordInboxRow;
}

function makePb(rows: DiscordInboxRow[]): {
  pb: any;
  inbox: { getList: ReturnType<typeof vi.fn>; update: ReturnType<typeof vi.fn> };
} {
  const inbox = {
    getList: vi.fn().mockResolvedValue({ items: rows }),
    update: vi.fn().mockResolvedValue({}),
  };
  return { pb: { collection: vi.fn(() => inbox) }, inbox };
}

beforeEach(() => {
  log.info.mockReset();
  log.warn.mockReset();
});

describe('channel mapping', () => {
  it('maps every pipeline/flag combination to an existing topic channel', () => {
    expect(mapTargetChannel('events', { eventKind: 'local' })).toBe(TRIAGE_CHANNELS.eventsLocal);
    expect(mapTargetChannel('events', { eventKind: 'travel' })).toBe(TRIAGE_CHANNELS.eventsTravel);
    expect(mapTargetChannel('events', { eventKind: 'online', sysCpSec: true })).toBe(
      TRIAGE_CHANNELS.eventsPriority,
    );
    expect(mapTargetChannel('events', { eventKind: 'tba' })).toBe(TRIAGE_CHANNELS.eventsTba);
    expect(mapTargetChannel('events', { eventKind: 'online' })).toBe(
      TRIAGE_CHANNELS.eventsOnline,
    );
    expect(mapTargetChannel('jobs', { jobKind: 'sys_cp_sec' })).toBe(
      TRIAGE_CHANNELS.jobsSysCloud,
    );
    expect(mapTargetChannel('jobs', { jobKind: 'general' })).toBe(TRIAGE_CHANNELS.jobsGeneral);
    expect(mapTargetChannel('loot')).toBe(TRIAGE_CHANNELS.loot);
  });
});

describe('keyword classification', () => {
  it('classifies an online hackathon without an LLM', () => {
    const decision = classifyByKeywords(
      makeRow({
        content: 'National Hackathon 2026 — registrations open. Prize ₹1,00,000. Online event.',
      }),
    );
    expect(decision?.pipeline).toBe('events');
    expect(decision?.eventKind).toBe('online');
    expect(decision?.targetChannel).toBe(TRIAGE_CHANNELS.eventsOnline);
    expect(decision?.method).toBe('keyword');
  });

  it('routes a DK/Udupi offline event to local', () => {
    const decision = classifyByKeywords(
      makeRow({ content: 'Hackathon in Udupi, offline at MIT Manipal. Register now.' }),
    );
    expect(decision?.eventKind).toBe('local');
    expect(decision?.targetChannel).toBe(TRIAGE_CHANNELS.eventsLocal);
  });

  it('routes an offline event outside DK to travel', () => {
    const decision = classifyByKeywords(
      makeRow({ content: 'Hackathon in Bangalore. Offline venue announced. Registration open.' }),
    );
    expect(decision?.eventKind).toBe('travel');
    expect(decision?.targetChannel).toBe(TRIAGE_CHANNELS.eventsTravel);
  });

  it('routes an explicitly TBA event to the TBA radar', () => {
    const decision = classifyByKeywords(
      makeRow({ content: 'Hackathon 2026 announced. Dates TBA. Registration coming soon.' }),
    );
    expect(decision?.eventKind).toBe('tba');
    expect(decision?.targetChannel).toBe(TRIAGE_CHANNELS.eventsTba);
  });

  it('routes a sys/cp/sec online event to priority', () => {
    const decision = classifyByKeywords(
      makeRow({ content: 'Cybersecurity CTF online with cash prize. Register your team.' }),
    );
    expect(decision?.pipeline).toBe('events');
    expect(decision?.sysCpSec).toBe(true);
    expect(decision?.targetChannel).toBe(TRIAGE_CHANNELS.eventsPriority);
  });

  it('classifies a general software job', () => {
    const decision = classifyByKeywords(
      makeRow({ content: 'We are hiring a backend engineer (0-1 years experience). Apply now.' }),
    );
    expect(decision?.pipeline).toBe('jobs');
    expect(decision?.jobKind).toBe('general');
    expect(decision?.targetChannel).toBe(TRIAGE_CHANNELS.jobsGeneral);
  });

  it('classifies a sys/cloud/devops/security job', () => {
    const decision = classifyByKeywords(
      makeRow({ content: 'Hiring DevOps engineer with cloud experience. Apply here.' }),
    );
    expect(decision?.pipeline).toBe('jobs');
    expect(decision?.jobKind).toBe('sys_cp_sec');
    expect(decision?.targetChannel).toBe(TRIAGE_CHANNELS.jobsSysCloud);
  });

  it('classifies a loot post', () => {
    const decision = classifyByKeywords(
      makeRow({ content: 'Free GitHub Student Developer Pack with cloud credits. Redeem now.' }),
    );
    expect(decision?.pipeline).toBe('loot');
    expect(decision?.targetChannel).toBe(TRIAGE_CHANNELS.loot);
  });

  it('returns null for an ambiguous message', () => {
    expect(
      classifyByKeywords(makeRow({ content: 'Exciting news from our community today!' })),
    ).toBeNull();
  });

  it('detects sys/cp/sec terms and event kinds', () => {
    expect(hasSysCpSec(makeRow({ content: 'Linux kernel and distributed systems role' }))).toBe(true);
    expect(hasSysCpSec(makeRow({ content: 'Frontend React role' }))).toBe(false);
    expect(detectEventKind(makeRow({ content: 'Online webinar for students' }))).toBe('online');
    expect(detectEventKind(makeRow({ content: 'In-person meetup at the campus venue' }))).toBe(
      'travel',
    );
    expect(detectEventKind(makeRow({ content: 'Conference in Udupi' }))).toBe('local');
    expect(detectEventKind(makeRow({ content: 'Summit with dates TBA' }))).toBe('tba');
  });
});

describe('relevance prefilter', () => {
  it('skips empty and chatter messages', () => {
    expect(prefilterReason(makeRow({ content: '' }))).toBe('empty message');
    expect(prefilterReason(makeRow({ content: 'Congratulations to the winners!' }))).toBe(
      'chatter/noise',
    );
    expect(prefilterReason(makeRow({ content: 'hello everyone' }))).toBe('chatter/noise');
    expect(prefilterReason(makeRow({ content: 'Welcome to the server' }))).toBe('chatter/noise');
  });

  it('does not skip a short greeting that contains an opportunity keyword', () => {
    expect(
      prefilterReason(makeRow({ content: 'Hi all — we are hiring interns. Apply now.' })),
    ).toBeNull();
  });

  it('does not skip real announcements with no link or flyer', () => {
    expect(
      prefilterReason(makeRow({ content: 'Free swag giveaway for students, claim your voucher' })),
    ).toBeNull();
  });

  it('does not treat a link-only or button-only announcement as chatter', () => {
    expect(
      prefilterReason(
        makeRow({ content: 'https://unstop.com/hackathon/2026', links: ['https://unstop.com/hackathon/2026'] }),
      ),
    ).toBeNull();
    expect(
      prefilterReason(makeRow({ content: '', links: ['https://acme.example.com/jobs/1'] })),
    ).toBeNull();
  });

  it('skips a flyer-only message because it has no text to classify', () => {
    expect(
      prefilterReason(
        makeRow({
          content: '',
          images: [
            {
              url: 'https://cdn.example.com/flyer.png',
              name: 'flyer.png',
              contentType: 'image/png',
              size: 1,
              width: null,
              height: null,
            },
          ],
        }),
      ),
    ).toBe('image-only announcement (no text to classify)');
  });
});

describe('LLM verdict parsing', () => {
  it('parses a valid verdict', () => {
    const verdict = parseTriageVerdict(
      JSON.stringify({
        relevant: true,
        pipeline: 'events',
        event_kind: 'online',
        job_kind: null,
        confidence: 0.8,
        reason: 'hackathon',
      }),
    );
    expect(verdict).toEqual({
      relevant: true,
      pipeline: 'events',
      event_kind: 'online',
      job_kind: null,
      confidence: 0.8,
      reason: 'hackathon',
    });
  });

  it('normalizes synonyms and fenced JSON', () => {
    const verdict = parseTriageVerdict(
      '```json\n{"relevant":"true","pipeline":"job","event_kind":"offline","job_kind":"sys-cp-sec","confidence":"0.7","reason":"role"}\n```',
    );
    expect(verdict?.pipeline).toBe('jobs');
    expect(verdict?.event_kind).toBe('travel');
    expect(verdict?.job_kind).toBe('sys_cp_sec');
    expect(verdict?.confidence).toBe(0.7);
  });

  it('rejects invalid or non-JSON responses', () => {
    expect(parseTriageVerdict('not json')).toBeNull();
    expect(parseTriageVerdict(JSON.stringify({ pipeline: 'events' }))).toBeNull();
    expect(parseTriageVerdict('POOL_SATURATED')).toBeNull();
  });
});

describe('triageDiscordInbox', () => {
  it('classifies a clear keyword row without calling the LLM', async () => {
    const row = makeRow({
      content: 'National Hackathon 2026 — registrations open. Prize ₹1,00,000. Online.',
    });
    const { pb, inbox } = makePb([row]);
    const router = { complete: vi.fn() };

    const result = await triageDiscordInbox({ pb, router: router as any, log });

    expect(result).toMatchObject({ visited: 1, classified: 1, skipped: 0, errors: 0 });
    expect(router.complete).not.toHaveBeenCalled();
    expect(inbox.update).toHaveBeenCalledWith(
      'inbox-1',
      expect.objectContaining({
        status: 'classified',
        pipeline: 'events',
        target_channel: TRIAGE_CHANNELS.eventsOnline,
      }),
    );
  });

  it('calls the shared router for an ambiguous message and maps the result', async () => {
    const row = makeRow({ content: 'Exciting opportunity for final year students at Acme.' });
    const { pb, inbox } = makePb([row]);
    const router = {
      complete: vi.fn().mockResolvedValue({
        verdict: {
          relevant: true,
          pipeline: 'jobs',
          event_kind: null,
          job_kind: 'general',
          confidence: 0.82,
          reason: 'role with application path',
        },
        bucket: 'tier1/groq:test',
        path: [],
      }),
    };

    const result = await triageDiscordInbox({ pb, router: router as any, log });

    expect(result.classified).toBe(1);
    expect(router.complete).toHaveBeenCalledWith(
      expect.objectContaining({
        slot: 'discord-triage',
        priority: 3,
        pipeline: '',
        trace_id: 'triage:1234567890',
      }),
    );
    expect(inbox.update).toHaveBeenCalledWith(
      'inbox-1',
      expect.objectContaining({
        status: 'classified',
        pipeline: 'jobs',
        target_channel: TRIAGE_CHANNELS.jobsGeneral,
      }),
    );
  });

  it('marks a model-classified irrelevant message skipped', async () => {
    const row = makeRow({ content: 'Exciting news from our community today!' });
    const { pb, inbox } = makePb([row]);
    const router = {
      complete: vi.fn().mockResolvedValue({
        verdict: {
          relevant: false,
          pipeline: 'none',
          event_kind: null,
          job_kind: null,
          confidence: 0.9,
          reason: 'general chatter',
        },
        bucket: null,
        path: [],
      }),
    };

    const result = await triageDiscordInbox({ pb, router: router as any, log });

    expect(result.skipped).toBe(1);
    expect(inbox.update).toHaveBeenCalledWith(
      'inbox-1',
      expect.objectContaining({ status: 'skipped' }),
    );
  });

  it('stops the tick and leaves rows pending when the LLM pool is exhausted', async () => {
    const row = makeRow({ content: 'Exciting news from our community today!' });
    const { pb, inbox } = makePb([row]);
    const router = {
      complete: vi.fn().mockResolvedValue({
        verdict: 'UNVERIFIED',
        bucket: null,
        path: [],
        reason: 'all buckets exhausted',
      }),
    };

    const result = await triageDiscordInbox({ pb, router: router as any, log });

    expect(result.poolExhausted).toBe(true);
    expect(result.pending).toBe(1);
    expect(inbox.update).not.toHaveBeenCalled();
  });

  it('increments attempts on LLM failure and marks error after five attempts', async () => {
    const row = makeRow({
      content: 'Exciting news from our community today!',
      attempts: 4,
    });
    const { pb, inbox } = makePb([row]);
    const router = {
      complete: vi.fn().mockRejectedValue(new Error('bad verdict')),
    };

    const result = await triageDiscordInbox({ pb, router: router as any, log });

    expect(result.errors).toBe(1);
    expect(inbox.update).toHaveBeenCalledWith(
      'inbox-1',
      expect.objectContaining({ attempts: 5, status: 'error' }),
    );
  });

  it('skips chatter rows before any LLM call', async () => {
    const row = makeRow({ content: 'Congratulations to all the winners!' });
    const { pb, inbox } = makePb([row]);
    const router = { complete: vi.fn() };

    const result = await triageDiscordInbox({ pb, router: router as any, log });

    expect(result.skipped).toBe(1);
    expect(router.complete).not.toHaveBeenCalled();
    expect(inbox.update).toHaveBeenCalledWith(
      'inbox-1',
      expect.objectContaining({
        status: 'skipped',
        classification: expect.objectContaining({ method: 'skip' }),
      }),
    );
  });
});
