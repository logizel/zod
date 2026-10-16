import { describe, expect, it } from 'vitest';
import { Opportunity, TaskScratchpad } from './schema.js';

describe('D-14 schema migration', () => {
  const phase4Opportunity = {
    fingerprint_hash: 'abc123',
    url_hash: 'def456',
    pipeline: 'events' as const,
    bucket_channel: '#🔥-priority-sys-cp-sec',
    status: 'audited' as const,
    title: 'National CTF 2026',
    organizer: 'CyberSec India',
    links: { official: 'https://ctf.example.com/event/1', aggregator: 'https://portal.example.com/ctf/1' },
    prize_cash_inr: 150000,
    prize_text: '₹1,50,000 cash',
    deadlines: { tba: false },
    end_date: null,
    reminders: [],
    bookmark: false,
    audit_summary: 'Verified: official domain resolved in 2 hops; cash prize confirmed.',
    description_raw: '',
  };

  it('parses a Phase 4-shaped opportunities row with all D-14 defaults applied', () => {
    const parsed = Opportunity.parse(phase4Opportunity);
    expect(parsed.experience_span).toBeNull();
    expect(parsed.stack_tags).toEqual([]);
    expect(parsed.eligibility_summary).toBe('');
    expect(parsed.shipping_verified).toBeNull();
    expect(parsed.card_required).toBeNull();
    expect(parsed.claim_steps).toEqual([]);
    expect(parsed.registration_links).toEqual([]);
    expect(parsed.possible_dupe_of).toBe('');
    // Original fields carried through unchanged
    expect(parsed.pipeline).toBe('events');
    expect(parsed.title).toBe('National CTF 2026');
  });

  it('parses a pipeline-less task_scratchpad row defaulting pipeline to events and candidate_title to empty', () => {
    const parsed = TaskScratchpad.parse({
      candidate_url: 'https://example.com/job/1',
      step_position: 'STEP_1',
      partial_buffer: '',
      attempts: 0,
      last_error: null,
    });
    expect(parsed.pipeline).toBe('events');
    expect(parsed.candidate_title).toBe('');
  });

  it('round-trips a jobs verdict-shaped payload with all extended fields', () => {
    const jobsPayload = {
      ...phase4Opportunity,
      pipeline: 'jobs' as const,
      bucket_channel: '#⚙️-jobs-sys-cloud-devops',
      experience_span: '0–2 years',
      stack_tags: ['Node.js', 'TypeScript', 'AWS'],
      eligibility_summary: 'New-grad internship, India-eligible, 0–1yr',
      registration_links: ['https://boards.greenhouse.io/acme/jobs/123'],
      possible_dupe_of: '',
    };
    const parsed = Opportunity.parse(jobsPayload);
    expect(parsed.experience_span).toBe('0–2 years');
    expect(parsed.stack_tags).toEqual(['Node.js', 'TypeScript', 'AWS']);
    expect(parsed.eligibility_summary).toBe('New-grad internship, India-eligible, 0–1yr');
    expect(parsed.shipping_verified).toBeNull();
    expect(parsed.card_required).toBeNull();
    expect(parsed.claim_steps).toEqual([]);
    expect(parsed.registration_links).toEqual(['https://boards.greenhouse.io/acme/jobs/123']);
    expect(parsed.possible_dupe_of).toBe('');
    expect(parsed.pipeline).toBe('jobs');
  });

  it('round-trips a loot verdict-shaped payload with all extended fields', () => {
    const lootPayload = {
      ...phase4Opportunity,
      pipeline: 'loot' as const,
      bucket_channel: '#🎁-free-swag-and-credits',
      experience_span: null,
      stack_tags: [],
      eligibility_summary: '',
      shipping_verified: true,
      card_required: false,
      claim_steps: [
        { step: 'Visit CNCF training page', quote: 'Free exam voucher for CNCF members' },
        { step: 'Claim via portal', quote: 'Redeem code at checkout' },
      ],
      registration_links: ['https://training.cncf.io/courses/cka'],
      possible_dupe_of: '',
    };
    const parsed = Opportunity.parse(lootPayload);
    expect(parsed.experience_span).toBeNull();
    expect(parsed.stack_tags).toEqual([]);
    expect(parsed.eligibility_summary).toBe('');
    expect(parsed.shipping_verified).toBe(true);
    expect(parsed.card_required).toBe(false);
    expect(parsed.claim_steps).toEqual([
      { step: 'Visit CNCF training page', quote: 'Free exam voucher for CNCF members' },
      { step: 'Claim via portal', quote: 'Redeem code at checkout' },
    ]);
    expect(parsed.registration_links).toEqual(['https://training.cncf.io/courses/cka']);
    expect(parsed.pipeline).toBe('loot');
  });

  it('re-parse of a row carrying explicit values never overwrites them with defaults', () => {
    const withExplicit = {
      ...phase4Opportunity,
      pipeline: 'jobs' as const,
      experience_span: '1 year',
      stack_tags: ['Rust', 'Go'],
      eligibility_summary: 'Entry-level SWE',
      shipping_verified: false,
      card_required: true,
      claim_steps: [{ step: 'Register', quote: 'Sign up at the official portal' }],
      registration_links: ['https://example.com/register'],
      possible_dupe_of: 'fingerprint-abc',
    };
    const parsed = Opportunity.parse(withExplicit);
    expect(parsed.experience_span).toBe('1 year');
    expect(parsed.stack_tags).toEqual(['Rust', 'Go']);
    expect(parsed.eligibility_summary).toBe('Entry-level SWE');
    expect(parsed.shipping_verified).toBe(false);
    expect(parsed.card_required).toBe(true);
    expect(parsed.claim_steps).toEqual([{ step: 'Register', quote: 'Sign up at the official portal' }]);
    expect(parsed.registration_links).toEqual(['https://example.com/register']);
    expect(parsed.possible_dupe_of).toBe('fingerprint-abc');
  });
});
