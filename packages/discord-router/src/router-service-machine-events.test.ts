// Discord delivery machine events (the Glass feed's discord.post rows).
// Mock Discord client — nothing is sent to Discord.

import { describe, it, expect, vi } from 'vitest';
import { processOpportunity } from './router-service.js';
import type { OpportunityRow } from '@zod/db-hot/schema';
import type { Env } from '@zod/config';

vi.mock('@zod/db-hot/scratchpad', () => ({ recordFailure: vi.fn() }));

const testEnv = {
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
  DISCORD_CHANNEL_PRIORITY_SYS_CP_SEC: '444000000000000000',
  DISCORD_CHANNEL_ONLINE_1LAKH: '555000000000000000',
  FELLOWSHIP_ALLOWLIST_EXTRA: '',
} as unknown as Env;

const fixture = {
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
  links: { official: 'https://ctf.example.com/event/1' },
  prize_cash_inr: 150000,
  prize_text: '₹1,50,000 cash',
  deadlines: { tba: false },
  end_date: '2026-12-16T18:00:00Z',
  reminders: [],
  bookmark: false,
  audit_summary: 'Verified.',
  description_raw: '',
  experience_span: null,
  stack_tags: [],
  eligibility_summary: '',
  shipping_verified: null,
  card_required: null,
  claim_steps: [],
  registration_links: [],
  possible_dupe_of: '',
} as unknown as OpportunityRow;

const makeLog = () =>
  ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: vi.fn().mockReturnValue({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
  }) as any;

function makePb(machineEvents: any[]) {
  return {
    collection: (name: string) => ({
      getList: () => Promise.resolve({ items: [fixture] }),
      update: async () => undefined,
      create: async (data: any) => {
        if (name === 'machine_events') machineEvents.push(data);
        return data;
      },
    }),
  } as any;
}

function makeClient(send: (data: any) => Promise<any>) {
  return {
    channels: {
      fetch: async () => ({
        send,
        isTextBased: () => true,
        isDMBased: () => false,
      }),
    },
  } as any;
}

async function flush(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 120));
}

describe('discord delivery machine events', () => {
  it('emits start + ok events for a delivered card', async () => {
    const machineEvents: any[] = [];
    const pb = makePb(machineEvents);
    const client = makeClient(async () => ({ id: 'msg-1', react: async () => undefined }));

    const ok = await processOpportunity(pb, testEnv, client, fixture, makeLog());
    await flush();

    expect(ok).toBe(true);
    const posts = machineEvents.filter((e) => e.tool === 'discord.post');
    expect(posts.map((e) => e.status)).toEqual(['start', 'ok']);
    expect(posts[0].trace_id).toBe('def456');
    expect(posts[0].pipeline).toBe('events');
    expect(posts[1].detail).toContain('#🔥-priority-sys-cp-sec');
  });

  it('emits an error event when the Discord send fails', async () => {
    const machineEvents: any[] = [];
    const pb = makePb(machineEvents);
    const client = makeClient(async () => {
      throw new Error('discord down');
    });

    const ok = await processOpportunity(pb, testEnv, client, fixture, makeLog());
    await flush();

    expect(ok).toBe(false);
    const failed = machineEvents.find((e) => e.tool === 'discord.post' && e.status === 'error');
    expect(failed).toBeDefined();
    expect(failed.detail).toContain('discord down');
  });
});
