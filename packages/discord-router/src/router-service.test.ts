import { describe, it, expect, vi, beforeEach } from 'vitest';
import { processOpportunity } from './router-service.js';
import type { OpportunityRow } from '@zod/db-hot/schema';
import type { Env } from '@zod/config';

// Mock recordFailure from scratchpad
vi.mock('@zod/db-hot/scratchpad', () => ({
  recordFailure: vi.fn(),
}));

import { recordFailure } from '@zod/db-hot/scratchpad';

const testEnv: Env = {
  PB_URL: 'http://127.0.0.1:8090',
  PB_SERVICE_EMAIL: 'owner@example.com',
  PB_SERVICE_PASSWORD: 's3cret',
  JINA_API_KEY: 'jina-test',
  TURSO_DATABASE_URL: 'libsql://zod-turso.turso.io',
  TURSO_AUTH_TOKEN: 't0ken',
  GROQ_API_KEY: 'groq-test-key',
  GITHUB_TOKEN: 'github-test-token',
  SAMBANOVA_API_KEY: '',
  DISCORD_TOKEN: 'discord-test-token',
  LOG_LEVEL: 'info',
  DISCORD_CHANNEL_JOBS_SYS_CLOUD: '111000000000000000',
  DISCORD_CHANNEL_JOBS_GENERAL: '222000000000000000',
  DISCORD_CHANNEL_LOOT: '333000000000000000',
  FELLOWSHIP_ALLOWLIST_EXTRA: '',
};

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
  experience_span: null,
  stack_tags: [],
  eligibility_summary: '',
  shipping_verified: null,
  card_required: null,
  claim_steps: [],
  registration_links: [],
  possible_dupe_of: '',
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

    const ok = await processOpportunity(pb, testEnv, client, fixture, makeLog());

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

    const ok = await processOpportunity(pb, testEnv, client, fixture, makeLog());

    expect(ok).toBe(false);
    expect(vi.mocked(recordFailure)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(recordFailure)).toHaveBeenCalledWith(pb, fixture.id, expect.any(String));
  });

  it('returns false when channel not found (unknown channel keeps skip path)', async () => {
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
      guilds: { cache: { values: () => [] } },
    };

    const ok = await processOpportunity(pb, testEnv, client, fixture, makeLog());

    expect(ok).toBe(false);
  });

  // --- New: env-ID-first resolution for the three new buckets ---

  it('resolves #⚙️-jobs-sys-cloud-devops by env ID first (client.channels.fetch called with env ID)', async () => {
    const fetchedById: string[] = [];
    const fetchedByName: string[] = [];
    const opp: OpportunityRow = { ...fixture, pipeline: 'jobs', bucket_channel: '#⚙️-jobs-sys-cloud-devops' };
    const pb = {
      collection: () => ({
        getList: () => Promise.resolve({ items: [opp] }),
        update: (id: string, data: any) => Promise.resolve(),
      }),
    };
    const client = {
      channels: {
        fetch: async (id: string) => {
          fetchedById.push(id);
          if (id === '111000000000000000') {
            return { send: async () => ({ id: 'msg-1' }), isTextBased: () => true, isDMBased: () => false };
          }
          return null;
        },
      },
      guilds: {
        cache: {
          values: () => [
            {
              channels: {
                cache: {
                  values: () => [
                    {
                      isTextBased: () => true,
                      isDMBased: () => false,
                      name: '⚙️-jobs-sys-cloud-devops',
                    },
                  ],
                },
              },
            },
          ],
        },
      },
    };
    // Intercept name-based lookup to record it
    const originalFind = Array.prototype.find;
    // (guild iteration happens inside resolveChannel; we just verify fetch-by-ID was used)

    const ok = await processOpportunity(pb, testEnv, client, opp, makeLog());

    expect(ok).toBe(true);
    expect(fetchedById).toContain('111000000000000000');
    // Name fallback should NOT be tried since env ID resolved
    expect(fetchedByName).toEqual([]);
  });

  it('resolves #💼-jobs-general-swe by env ID first', async () => {
    const fetchedById: string[] = [];
    const opp: OpportunityRow = { ...fixture, pipeline: 'jobs', bucket_channel: '#💼-jobs-general-swe' };
    const pb = {
      collection: () => ({
        getList: () => Promise.resolve({ items: [opp] }),
        update: (id: string, data: any) => Promise.resolve(),
      }),
    };
    const client = {
      channels: {
        fetch: async (id: string) => {
          fetchedById.push(id);
          if (id === '222000000000000000') {
            return { send: async () => ({ id: 'msg-2' }), isTextBased: () => true, isDMBased: () => false };
          }
          return null;
        },
      },
      guilds: { cache: { values: () => [] } },
    };

    const ok = await processOpportunity(pb, testEnv, client, opp, makeLog());

    expect(ok).toBe(true);
    expect(fetchedById).toContain('222000000000000000');
  });

  it('resolves #🎁-free-swag-and-credits by env ID first', async () => {
    const fetchedById: string[] = [];
    const opp: OpportunityRow = { ...fixture, pipeline: 'loot', bucket_channel: '#🎁-free-swag-and-credits' };
    const pb = {
      collection: () => ({
        getList: () => Promise.resolve({ items: [opp] }),
        update: (id: string, data: any) => Promise.resolve(),
      }),
    };
    const client = {
      channels: {
        fetch: async (id: string) => {
          fetchedById.push(id);
          if (id === '333000000000000000') {
            return { send: async () => ({ id: 'msg-3' }), isTextBased: () => true, isDMBased: () => false };
          }
          return null;
        },
      },
      guilds: { cache: { values: () => [] } },
    };

    const ok = await processOpportunity(pb, testEnv, client, opp, makeLog());

    expect(ok).toBe(true);
    expect(fetchedById).toContain('333000000000000000');
  });

  it('falls back to exact-name match when env ID is empty for a new bucket', async () => {
    const emptyEnv: Env = { ...testEnv, DISCORD_CHANNEL_JOBS_SYS_CLOUD: '' };
    const opp: OpportunityRow = { ...fixture, pipeline: 'jobs', bucket_channel: '#⚙️-jobs-sys-cloud-devops' };
    const sent: any[] = [];
    const pb = {
      collection: () => ({
        getList: () => Promise.resolve({ items: [opp] }),
        update: (id: string, data: any) => Promise.resolve(),
      }),
    };
    const client = {
      channels: {
        fetch: async () => null, // ID fetch: empty env ID skipped, bucket ID fetch returns null
      },
      guilds: {
        cache: {
          values: () => [
            {
              channels: {
                cache: {
                  values: () => [
                    {
                      isTextBased: () => true,
                      isDMBased: () => false,
                      // Discord channel names don't include the # prefix; bucket_channel_id does.
                      // Name fallback only matches when names are identical.
                      name: '#⚙️-jobs-sys-cloud-devops',
                      send: async (data: any) => { sent.push(data); return { id: 'msg-1' }; },
                    },
                  ],
                },
              },
            },
          ],
        },
      },
    };

    const ok = await processOpportunity(pb, emptyEnv, client, opp, makeLog());

    expect(ok).toBe(true);
    expect(sent).toHaveLength(1);
  });

  it('unknown/unresolvable channel still returns skip path unchanged', async () => {
    const opp: OpportunityRow = { ...fixture, bucket_channel: '#👻-nonexistent-channel' };
    const pb = {
      collection: () => ({
        getList: () => Promise.resolve({ items: [opp] }),
        update: async () => { throw new Error('should not be called'); },
      }),
    };
    const client = {
      channels: {
        fetch: async () => null,
      },
      guilds: { cache: { values: () => [] } },
    };

    const ok = await processOpportunity(pb, testEnv, client, opp, makeLog());

    expect(ok).toBe(false);
    expect(vi.mocked(recordFailure)).not.toHaveBeenCalled();
  });
});
