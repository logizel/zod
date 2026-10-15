import { EmbedBuilder } from 'discord.js';
import type { Opportunity } from '@zod/db-hot/schema';

/** Build a UI-01 Discord audit card embed from an audited opportunity. */
export function buildAuditCard(opp: Opportunity): EmbedBuilder {
  return new EmbedBuilder()
    .setTitle(opp.title)
    .addFields(
      { name: 'Organizer', value: opp.organizer, inline: true },
      { name: 'Dates', value: fmtDeadlines(opp.deadlines), inline: true },
      { name: 'Prize (liquid cash)', value: opp.prize_text || '—', inline: false },
      {
        name: 'Links',
        value: `[Official](${opp.links.official}) • [Aggregator](${opp.links.aggregator ?? '—'})`,
        inline: false,
      },
      { name: 'Audit', value: opp.audit_summary || '—', inline: false },
    )
    .setColor(0x00aa00)
    .setTimestamp();
}

function fmtDeadlines(d: {
  tba?: boolean;
  apply_by?: string;
  event_start?: string;
  event_end?: string;
}): string {
  const parts: string[] = [];
  if (d.event_start) parts.push(`starts ${new Date(d.event_start).toISOString().slice(0, 10)}`);
  if (d.event_end) parts.push(`ends ${new Date(d.event_end).toISOString().slice(0, 10)}`);
  if (d.apply_by) parts.push(`apply by ${new Date(d.apply_by).toISOString().slice(0, 10)}`);
  if (d.tba) parts.push('TBA');
  return parts.length ? parts.join(' • ') : '—';
}
