import { describe, it, expect, vi, beforeEach } from 'vitest';
import { processOpportunity } from './router-service.js';
import type { OpportunityRow } from '@zod/db-hot/schema';

// Mock recordFailure from scratchpad
vi.mock('@zod/db-hot/scratchpad', () => ({
  recordFailure: vi.fn(),
}));

import { recordFailure } from '@zod/db-hot/scratchpad';

const fixture: OpportunityRow = {
  id: 'opp-1',
  created: '2026-10-15T10:00:00Z',
  updated: '2026-10-15T10:00:00Z',
  fingerprint_hash: 'abc123',
  url_hash: 'def456',
  pipeline: 'events',
  bucket_channel: '#🔥-priority-sys-cp-sec',
  status: 'audited',
  title: 'National CTF 2026',
  organizer: 'CyberSec India',
  links: { official: 'https://ctf.example.com/event/1', aggregator: 'https://portal.example.com/ctf/1' },
  prize_cash_inr: 150000,
  prize_text: '₹1,50,000 cash',
  deadlines: { tba: false, apply_by: '2026-12-01T23:59:59Z', event_start: '2026-12-15T09:00:00Z', event_end: '2026-12-16T18:00:00Z' },
  end_date: '2026-12-16T18:00:00Z',
  reminders: [],
  bookmark: false,
  audit_summary: 'Verified: official domain resolved in 2 hops; cash prize confirmed.',
  description_raw: '',
};

const makeLog = () => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  child: vi.fn().mockReturnValue({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}) as any;

describe('processOpportunity', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('sends embed to Discord channel and marks opportunity routed', async () => {
    const sent: any[] = [];
    const updated: any[] = [];
    const pb = {
      collection: () => ({
        getList: () => Promise.resolve({ items: [fixture] }),
        update: (id: string, data: any) => { updated.push([id, data]); return Promise.resolve(); },
      }),
    };
    const client = {
      channels: {
        fetch: async (id: string) => ({
          send: async (data: any) => { sent.push(data); return { id: 'msg-1' }; },
          isTextBased: () => true,
          isDMBased: () => false,
        }),
      },
    };

    const ok = await processOpportunity(pb, client, fixture, makeLog());

    expect(ok).toBe(true);
    expect(sent).toHaveLength(1);
    expect(sent[0].embeds).toHaveLength(1);
    expect(sent[0].embeds[0].data.title).toBe('National CTF 2026');
    expect(updated).toHaveLength(1);
    expect(updated[0][0]).toBe(fixture.id); // opportunity id
    expect(updated[0][1]).toMatchObject({ status: 'routed' });
  });

  it('invokes recordFailure on Discord send failure', async () => {
    const pb = {
      collection: () => ({
        getList: () => Promise.resolve({ items: [fixture] }),
        update: async () => { throw new Error('should not be called'); },
      }),
    };
    const client = {
      channels: {
        fetch: async () => ({
          send: async () => { throw new Error('Discord send failed'); },
          isTextBased: () => true,
          isDMBased: () => false,
        }),
      },
    };

    // recordFailure returns tombstoned=true on 5th call
    vi.mocked(recordFailure).mockImplementation(async () => ({ attempts: 5, tombstoned: true }));

    const ok = await processOpportunity(pb, client, fixture, makeLog());

    expect(ok).toBe(false);
    expect(vi.mocked(recordFailure)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(recordFailure)).toHaveBeenCalledWith(pb, fixture.id, expect.any(String));
  });

  it('returns false when channel not found', async () => {
    const pb = {
      collection: () => ({
        getList: () => Promise.resolve({ items: [fixture] }),
        update: async () => { throw new Error('should not be called'); },
      }),
    };
    const client = {
      channels: {
        fetch: async () => null,
      },
    };

    const ok = await processOpportunity(pb, client, fixture, makeLog());

    expect(ok).toBe(false);
  });
});
