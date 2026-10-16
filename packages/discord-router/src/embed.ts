import { EmbedBuilder } from 'discord.js';
import type { Opportunity } from '@zod/db-hot/schema';

/** Build a UI-01 Discord audit card embed from an audited opportunity. */
export function buildAuditCard(opp: Opportunity): EmbedBuilder {
  const fields: Array<{ name: string; value: string; inline?: boolean }> = [
    { name: 'Organizer', value: opp.organizer, inline: true },
    { name: 'Dates', value: fmtDeadlines(opp.deadlines), inline: true },
    { name: 'Prize (liquid cash)', value: opp.prize_text || '—', inline: false },
  ];

  // D-14: per-pipeline optional fields
  if (opp.pipeline === 'jobs') {
    fields.push(
      { name: 'Stack tags', value: fmtTags(opp.stack_tags), inline: true },
      { name: 'Eligibility', value: opp.eligibility_summary || '—', inline: true },
      { name: 'Apply link', value: opp.links.apply || '—', inline: false },
    );
  } else if (opp.pipeline === 'loot') {
    fields.push(
      { name: 'Shipping verified', value: fmtBool(opp.shipping_verified), inline: true },
      { name: 'Card required', value: fmtBool(opp.card_required), inline: true },
      { name: 'Claim steps', value: fmtClaimSteps(opp.claim_steps), inline: false },
    );
  }

  // Links field: official + aggregator + apply + registration_links union
  const linkParts: string[] = [`[Official](${opp.links.official})`];
  if (opp.links.aggregator) {
    linkParts.push(`[Aggregator](${opp.links.aggregator})`);
  } else {
    linkParts.push('[Aggregator](—)');
  }
  if (opp.links.apply) {
    linkParts.push(`[Apply](${opp.links.apply})`);
  }
  if (opp.registration_links?.length) {
    opp.registration_links.forEach((url, i) => {
      linkParts.push(`[Reg ${i + 1}](${url})`);
    });
  }
  fields.push({ name: 'Links', value: linkParts.join(' • '), inline: false });

  fields.push({ name: 'Audit', value: opp.audit_summary || '—', inline: false });

  return new EmbedBuilder()
    .setTitle(opp.title)
    .addFields(fields)
    .setColor(0x00aa00)
    .setTimestamp();
}

/** Render an array of tags as comma-separated, or '—' when empty. */
function fmtTags(tags: string[] | undefined): string {
  return tags && tags.length > 0 ? tags.join(', ') : '—';
}

/** Render a nullable boolean as Yes/No/—. */
function fmtBool(v: boolean | null | undefined): string {
  if (v === true) return 'Yes';
  if (v === false) return 'No';
  return '—';
}

/** Render claim steps as "step: \"quote\"; step: \"quote\"", or '—' when empty. */
function fmtClaimSteps(steps: Array<{ step: string; quote: string }> | undefined): string {
  if (!steps || steps.length === 0) return '—';
  return steps.map((s) => `${s.step}: "${s.quote}"`).join('; ');
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
