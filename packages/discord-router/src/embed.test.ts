import { describe, it, expect } from 'vitest';
import { EmbedBuilder } from 'discord.js';
import { buildAuditCard } from './embed.js';
import type { Opportunity } from '@zod/db-hot/schema';

const baseFixture: Opportunity = {
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

describe('buildAuditCard (UI-01)', () => {
  it('returns EmbedBuilder with all 6 UI-01 fields for events pipeline', () => {
    const embed = buildAuditCard(baseFixture);
    expect(embed).toBeInstanceOf(EmbedBuilder);

    const data = embed.data;
    expect(data.title).toBe('National CTF 2026');

    const fieldNames = data.fields?.map((f) => f.name) ?? [];
    expect(fieldNames).toContain('Organizer');
    expect(fieldNames).toContain('Dates');
    expect(fieldNames).toContain('Prize (liquid cash)');
    expect(fieldNames).toContain('Links');
    expect(fieldNames).toContain('Audit');
  });

  it('includes organizer field', () => {
    const embed = buildAuditCard(baseFixture);
    const organizerField = embed.data.fields?.find((f) => f.name === 'Organizer');
    expect(organizerField?.value).toBe('CyberSec India');
  });

  it('includes prize field', () => {
    const embed = buildAuditCard(baseFixture);
    const prizeField = embed.data.fields?.find((f) => f.name === 'Prize (liquid cash)');
    expect(prizeField?.value).toContain('₹1,50,000');
  });

  it('includes merged links [official] and [aggregator]', () => {
    const embed = buildAuditCard(baseFixture);
    const linksField = embed.data.fields?.find((f) => f.name === 'Links');
    expect(linksField?.value).toContain('[Official]');
    expect(linksField?.value).toContain('[Aggregator]');
    expect(linksField?.value).toContain(baseFixture.links.official);
    expect(linksField?.value).toContain(baseFixture.links.aggregator);
  });

  it('includes audit_summary in audit field', () => {
    const embed = buildAuditCard(baseFixture);
    const auditField = embed.data.fields?.find((f) => f.name === 'Audit');
    expect(auditField?.value).toBe(baseFixture.audit_summary);
  });

  it('handles missing aggregator link gracefully', () => {
    const opp: Opportunity = { ...baseFixture, links: { official: 'https://official.example.com' } };
    const embed = buildAuditCard(opp);
    const linksField = embed.data.fields?.find((f) => f.name === 'Links');
    expect(linksField?.value).toContain('[Aggregator](—)');
  });

  // --- New: per-pipeline fields (jobs) ---

  it('renders jobs stack tags, eligibility, and apply link when present', () => {
    const opp: Opportunity = {
      ...baseFixture,
      pipeline: 'jobs',
      stack_tags: ['Node.js', 'TypeScript', 'AWS'],
      eligibility_summary: 'New-grad internship, India-eligible',
      links: { ...baseFixture.links, apply: 'https://boards.greenhouse.io/acme/jobs/123' },
    };
    const embed = buildAuditCard(opp);
    const data = embed.data;

    const fieldNames = data.fields?.map((f) => f.name) ?? [];
    expect(fieldNames).toContain('Stack tags');
    expect(fieldNames).toContain('Eligibility');
    expect(fieldNames).toContain('Apply link');

    const stackField = data.fields?.find((f) => f.name === 'Stack tags');
    expect(stackField?.value).toContain('Node.js');
    expect(stackField?.value).toContain('TypeScript');
    expect(stackField?.value).toContain('AWS');

    const eligField = data.fields?.find((f) => f.name === 'Eligibility');
    expect(eligField?.value).toBe('New-grad internship, India-eligible');

    const applyField = data.fields?.find((f) => f.name === 'Apply link');
    expect(applyField?.value).toContain('https://boards.greenhouse.io/acme/jobs/123');
  });

  it('jobs empty optional fields render the — convention', () => {
    const opp: Opportunity = {
      ...baseFixture,
      pipeline: 'jobs',
      stack_tags: [],
      eligibility_summary: '',
      links: { ...baseFixture.links, apply: undefined },
    };
    const embed = buildAuditCard(opp);
    const data = embed.data;

    const stackField = data.fields?.find((f) => f.name === 'Stack tags');
    expect(stackField?.value).toBe('—');

    const eligField = data.fields?.find((f) => f.name === 'Eligibility');
    expect(eligField?.value).toBe('—');

    const applyField = data.fields?.find((f) => f.name === 'Apply link');
    expect(applyField?.value).toBe('—');
  });

  // --- New: per-pipeline fields (loot) ---

  it('renders loot shipping, card required, and claim steps when present', () => {
    const opp: Opportunity = {
      ...baseFixture,
      pipeline: 'loot',
      shipping_verified: true,
      card_required: false,
      claim_steps: [
        { step: 'Visit CNCF training page', quote: 'Free exam voucher for CNCF members' },
        { step: 'Claim via portal', quote: 'Redeem code at checkout' },
      ],
    };
    const embed = buildAuditCard(opp);
    const data = embed.data;

    const fieldNames = data.fields?.map((f) => f.name) ?? [];
    expect(fieldNames).toContain('Shipping verified');
    expect(fieldNames).toContain('Card required');
    expect(fieldNames).toContain('Claim steps');

    const shipField = data.fields?.find((f) => f.name === 'Shipping verified');
    expect(shipField?.value).toBe('Yes');

    const cardField = data.fields?.find((f) => f.name === 'Card required');
    expect(cardField?.value).toBe('No');

    const stepsField = data.fields?.find((f) => f.name === 'Claim steps');
    expect(stepsField?.value).toContain('Visit CNCF training page');
    expect(stepsField?.value).toContain('Free exam voucher for CNCF members');
    expect(stepsField?.value).toContain('Claim via portal');
    expect(stepsField?.value).toContain('Redeem code at checkout');
  });

  it('loot empty optional fields render the — convention', () => {
    const opp: Opportunity = {
      ...baseFixture,
      pipeline: 'loot',
      shipping_verified: null,
      card_required: null,
      claim_steps: [],
    };
    const embed = buildAuditCard(opp);
    const data = embed.data;

    const shipField = data.fields?.find((f) => f.name === 'Shipping verified');
    expect(shipField?.value).toBe('—');

    const cardField = data.fields?.find((f) => f.name === 'Card required');
    expect(cardField?.value).toBe('—');

    const stepsField = data.fields?.find((f) => f.name === 'Claim steps');
    expect(stepsField?.value).toBe('—');
  });

  // --- New: registration_links appended to Links field ---

  it('appends registration_links union to the Links field', () => {
    const opp: Opportunity = {
      ...baseFixture,
      pipeline: 'jobs',
      registration_links: [
        'https://boards.greenhouse.io/acme/jobs/123',
        'https://lever.co/acme/456',
      ],
    };
    const embed = buildAuditCard(opp);
    const linksField = embed.data.fields?.find((f) => f.name === 'Links');
    expect(linksField?.value).toContain('[Official]');
    expect(linksField?.value).toContain('[Aggregator]');
    expect(linksField?.value).toContain('[Reg 1]');
    expect(linksField?.value).toContain('[Reg 2]');
    expect(linksField?.value).toContain('https://boards.greenhouse.io/acme/jobs/123');
    expect(linksField?.value).toContain('https://lever.co/acme/456');
  });

  it('events pipeline with empty registration_links keeps — convention in Links', () => {
    const opp: Opportunity = {
      ...baseFixture,
      pipeline: 'events',
      registration_links: [],
    };
    const embed = buildAuditCard(opp);
    const linksField = embed.data.fields?.find((f) => f.name === 'Links');
    // Should still have [Official] and [Aggregator] but no [Reg N] entries
    expect(linksField?.value).toContain('[Official]');
    expect(linksField?.value).toContain('[Aggregator]');
    expect(linksField?.value).not.toContain('[Reg ');
  });

  // --- New: registration_links deduplication + stable order (D-10) ---

  it('deduplicates registration_links in Links field', () => {
    const opp: Opportunity = {
      ...baseFixture,
      pipeline: 'jobs',
      registration_links: [
        'https://lever.co/acme/456',
        'https://boards.greenhouse.io/acme/jobs/123',
        'https://lever.co/acme/456', // duplicate
      ],
    };
    const embed = buildAuditCard(opp);
    const linksField = embed.data.fields?.find((f) => f.name === 'Links');
    const value = linksField?.value ?? '';
    // Duplicate appears only once
    expect(value.match(/\[Reg 2\]\(https:\/\/lever\.co\/acme\/456\)/g)).toHaveLength(1);
    // Both unique links present
    expect(value).toContain('[Reg 1]');
    expect(value).toContain('[Reg 2]');
  });

  it('renders registration_links in stable sorted order', () => {
    const opp: Opportunity = {
      ...baseFixture,
      pipeline: 'jobs',
      registration_links: [
        'https://z.example.com/c',
        'https://a.example.com/a',
        'https://m.example.com/m',
      ],
    };
    const embed = buildAuditCard(opp);
    const linksField = embed.data.fields?.find((f) => f.name === 'Links');
    const value = linksField?.value ?? '';
    // Stable sorted order: a, m, c (by URL string)
    const reg1Match = value.match(/\[Reg 1\]\(([^)]+)\)/);
    const reg2Match = value.match(/\[Reg 2\]\(([^)]+)\)/);
    const reg3Match = value.match(/\[Reg 3\]\(([^)]+)\)/);
    expect(reg1Match?.[1]).toBe('https://a.example.com/a');
    expect(reg2Match?.[1]).toBe('https://m.example.com/m');
    expect(reg3Match?.[1]).toBe('https://z.example.com/c');
  });
});
