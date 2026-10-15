import { describe, it, expect } from 'vitest';
import { EmbedBuilder } from 'discord.js';
import { buildAuditCard } from './embed.js';
import type { Opportunity } from '@zod/db-hot/schema';

const fixture: Opportunity = {
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

describe('buildAuditCard (UI-01)', () => {
  it('returns EmbedBuilder with all 6 UI-01 fields', () => {
    const embed = buildAuditCard(fixture);
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
    const embed = buildAuditCard(fixture);
    const organizerField = embed.data.fields?.find((f) => f.name === 'Organizer');
    expect(organizerField?.value).toBe('CyberSec India');
  });

  it('includes prize field', () => {
    const embed = buildAuditCard(fixture);
    const prizeField = embed.data.fields?.find((f) => f.name === 'Prize (liquid cash)');
    expect(prizeField?.value).toContain('₹1,50,000');
  });

  it('includes merged links [official] and [aggregator]', () => {
    const embed = buildAuditCard(fixture);
    const linksField = embed.data.fields?.find((f) => f.name === 'Links');
    expect(linksField?.value).toContain('[Official]');
    expect(linksField?.value).toContain('[Aggregator]');
    expect(linksField?.value).toContain(fixture.links.official);
    expect(linksField?.value).toContain(fixture.links.aggregator);
  });

  it('includes audit_summary in audit field', () => {
    const embed = buildAuditCard(fixture);
    const auditField = embed.data.fields?.find((f) => f.name === 'Audit');
    expect(auditField?.value).toBe(fixture.audit_summary);
  });

  it('handles missing aggregator link gracefully', () => {
    const opp: Opportunity = { ...fixture, links: { official: 'https://official.example.com' } };
    const embed = buildAuditCard(opp);
    const linksField = embed.data.fields?.find((f) => f.name === 'Links');
    expect(linksField?.value).toContain('[Aggregator](—)');
  });
});
