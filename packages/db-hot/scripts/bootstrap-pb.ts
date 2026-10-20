// PocketBase hot-store bootstrap (261020-ke3).
//
// One-shot, idempotent, NON-DESTRUCTIVE schema + optional dev-seed step:
//   pnpm exec tsx packages/db-hot/scripts/bootstrap-pb.ts          # schema only
//   pnpm exec tsx packages/db-hot/scripts/bootstrap-pb.ts --seed   # schema + seed rows
//
// Safety contract:
// - Credentials come only from the shared env gate (parseEnv) and are handed to
//   createPbClient; this script never logs email, password, token, or auth state.
// - Existing collections are updated by MERGING managed fields by name over the
//   current field objects (so PocketBase field ids/system flags survive) and by
//   replacing only the index list this script owns. Unmanaged fields are kept.
// - It never calls collections.import(..., deleteMissing), never deletes a
//   collection, and never truncates records.
// - Collection definitions and INDEX_NOTES come from src/schema.ts — the single
//   contract shared with production code — instead of being duplicated here.

import { parseEnv } from '@zod/config';
import { createPbClient } from '../src/client.js';
import {
  AgentTelemetry,
  HOT_COLLECTIONS,
  INDEX_NOTES,
  OPPORTUNITY_STATUSES,
  Opportunity,
  PIPELINES,
  TELEMETRY_STATUSES,
  type HotCollection,
} from '../src/schema.js';

// ---------------------------------------------------------------------------
// Minimal structural types (types: [] in tsconfig.scripts.json — no @types/node)
// ---------------------------------------------------------------------------

type PbClient = Awaited<ReturnType<typeof createPbClient>>;

type FieldSpec = {
  name: string;
  type: string;
  required: boolean;
  hidden?: boolean;
  presentable?: boolean;
  system?: boolean;
  [extra: string]: unknown;
};

type IndexSpec = {
  name: string;
  columns: string;
  unique?: boolean;
};

type ExistingCollection = {
  id: string;
  name: string;
  fields: Array<Record<string, unknown>>;
};

type CollectionSpec = {
  name: HotCollection;
  fields: FieldSpec[];
};

type UpsertCounts = { created: number; updated: number };

// ---------------------------------------------------------------------------
// Field builders
// ---------------------------------------------------------------------------

function text(name: string, required = false): FieldSpec {
  return { name, type: 'text', required, hidden: false, presentable: false, system: false };
}

function numberField(name: string, required = false, onlyInt = false): FieldSpec {
  return {
    name,
    type: 'number',
    required,
    onlyInt,
    hidden: false,
    presentable: false,
    system: false,
  };
}

function bool(name: string, required = false): FieldSpec {
  return { name, type: 'bool', required, hidden: false, presentable: false, system: false };
}

function dateField(name: string, required = false): FieldSpec {
  return { name, type: 'date', required, hidden: false, presentable: false, system: false };
}

/**
 * PocketBase 0.40 base collections do not auto-add audit timestamps. The
 * schema contract's *Row types require `created`/`updated`, so every hot
 * collection declares them explicitly as autodate fields (the same shape PB
 * uses on its built-in auth collections).
 */
function autodateField(name: 'created' | 'updated'): FieldSpec {
  return {
    name,
    type: 'autodate',
    required: false,
    onCreate: true,
    onUpdate: name === 'updated',
    hidden: false,
    presentable: false,
    system: false,
  };
}

function jsonField(name: string, required = false): FieldSpec {
  return { name, type: 'json', required, hidden: false, presentable: false, system: false };
}

function urlField(name: string, required = false): FieldSpec {
  return { name, type: 'url', required, hidden: false, presentable: false, system: false };
}

function selectField(
  name: string,
  values: readonly string[],
  required = false,
): FieldSpec {
  return {
    name,
    type: 'select',
    required,
    maxSelect: 1,
    values: [...values],
    hidden: false,
    presentable: false,
    system: false,
  };
}

// ---------------------------------------------------------------------------
// Collection definitions (contract: packages/db-hot/src/schema.ts)
// ---------------------------------------------------------------------------

const OPPORTUNITY_FIELDS: FieldSpec[] = [
  // Required by Opportunity.parse.
  text('fingerprint_hash', true),
  text('url_hash', true),
  selectField('pipeline', PIPELINES, true),
  text('bucket_channel', true),
  selectField('status', OPPORTUNITY_STATUSES, true),
  text('title', true),
  text('organizer', true),
  jsonField('links', true),
  jsonField('deadlines', true),
  // Optional / nullable / defaulted.
  numberField('prize_cash_inr'),
  text('prize_text'),
  dateField('end_date'),
  jsonField('reminders'),
  bool('bookmark'),
  text('audit_summary'),
  text('description_raw'),
  text('experience_span'),
  jsonField('stack_tags'),
  text('eligibility_summary'),
  bool('shipping_verified'),
  bool('card_required'),
  jsonField('claim_steps'),
  jsonField('registration_links'),
  text('possible_dupe_of'),
  text('discord_message_id'),
  autodateField('created'),
  autodateField('updated'),
];

const AGENT_TELEMETRY_FIELDS: FieldSpec[] = [
  text('slot', true),
  text('provider', true),
  text('model', true),
  text('step', true),
  text('url'),
  selectField('status', TELEMETRY_STATUSES, true),
  numberField('duration_ms'),
  text('detail'),
  autodateField('created'),
  autodateField('updated'),
];

const TASK_SCRATCHPAD_FIELDS: FieldSpec[] = [
  urlField('candidate_url', true),
  text('step_position', true),
  selectField('pipeline', PIPELINES),
  text('candidate_title'),
  text('partial_buffer'),
  numberField('attempts', false, true),
  text('last_error'),
  autodateField('created'),
  autodateField('updated'),
];

const TOMBSTONE_LEDGER_FIELDS: FieldSpec[] = [
  text('url_hash', true),
  text('fingerprint', true),
  text('terminal_status', true),
  text('source'),
  dateField('decided_at', true),
  autodateField('created'),
  autodateField('updated'),
];

const TASTE_RULES_FIELDS: FieldSpec[] = [
  text('kind', true),
  text('rule', true),
  numberField('weight'),
  text('source'),
  dateField('created_at'),
  autodateField('created'),
  autodateField('updated'),
];

const COLLECTION_SPECS: Record<HotCollection, CollectionSpec> = {
  opportunities: { name: 'opportunities', fields: OPPORTUNITY_FIELDS },
  agent_telemetry: { name: 'agent_telemetry', fields: AGENT_TELEMETRY_FIELDS },
  task_scratchpad: { name: 'task_scratchpad', fields: TASK_SCRATCHPAD_FIELDS },
  tombstone_ledger: { name: 'tombstone_ledger', fields: TOMBSTONE_LEDGER_FIELDS },
  taste_rules: { name: 'taste_rules', fields: TASTE_RULES_FIELDS },
};

// ---------------------------------------------------------------------------
// INDEX_NOTES -> PocketBase index SQL (one mapping, keyed by the note itself)
// ---------------------------------------------------------------------------

const INDEX_SPECS: Record<HotCollection, Record<string, IndexSpec>> = {
  opportunities: {
    'fingerprint_hash (unique)': {
      name: 'idx_opportunities_fingerprint_hash',
      columns: '`fingerprint_hash`',
      unique: true,
    },
    'url_hash': { name: 'idx_opportunities_url_hash', columns: '`url_hash`' },
    'status': { name: 'idx_opportunities_status', columns: '`status`' },
    'end_date': { name: 'idx_opportunities_end_date', columns: '`end_date`' },
    'pipeline + status': {
      name: 'idx_opportunities_pipeline_status',
      columns: '`pipeline`, `status`',
    },
  },
  agent_telemetry: {
    'created': { name: 'idx_agent_telemetry_created', columns: '`created`' },
    'slot + created': {
      name: 'idx_agent_telemetry_slot_created',
      columns: '`slot`, `created`',
    },
  },
  task_scratchpad: {
    'candidate_url (unique)': {
      name: 'idx_task_scratchpad_candidate_url',
      columns: '`candidate_url`',
      unique: true,
    },
    'step_position': {
      name: 'idx_task_scratchpad_step_position',
      columns: '`step_position`',
    },
  },
  tombstone_ledger: {
    'url_hash (unique)': {
      name: 'idx_tombstone_ledger_url_hash',
      columns: '`url_hash`',
      unique: true,
    },
    'fingerprint': {
      name: 'idx_tombstone_ledger_fingerprint',
      columns: '`fingerprint`',
    },
  },
  taste_rules: {
    'kind': { name: 'idx_taste_rules_kind', columns: '`kind`' },
  },
};

/** Translate one collection's INDEX_NOTES entries into PocketBase DDL. */
function buildIndexStatements(collection: HotCollection): string[] {
  return INDEX_NOTES[collection].map((note) => {
    const spec = INDEX_SPECS[collection][note];
    if (!spec) {
      throw new Error(
        `Unmapped INDEX_NOTES entry for ${collection}: "${note}" — update INDEX_SPECS`,
      );
    }
    const unique = spec.unique ? 'UNIQUE ' : '';
    return `CREATE ${unique}INDEX \`${spec.name}\` ON \`${collection}\` (${spec.columns})`;
  });
}

/** Fail loudly when the schema registry, desired collections, and index map drift. */
function assertSchemaRegistryConsistent(): void {
  const desired = [...HOT_COLLECTIONS].sort();
  const noted = Object.keys(INDEX_NOTES).sort();
  if (desired.join('|') !== noted.join('|')) {
    throw new Error(
      `HOT_COLLECTIONS and INDEX_NOTES diverge: [${desired.join(', ')}] vs [${noted.join(', ')}]`,
    );
  }
  for (const collection of HOT_COLLECTIONS) {
    if (!COLLECTION_SPECS[collection]) {
      throw new Error(`Missing collection definition for ${collection}`);
    }
    // Throws if an INDEX_NOTES entry has no SQL mapping.
    buildIndexStatements(collection);
  }
}

// ---------------------------------------------------------------------------
// Schema application (idempotent, non-destructive)
// ---------------------------------------------------------------------------

async function applyCollections(
  pb: PbClient,
): Promise<{ created: string[]; updated: string[]; indexCount: number }> {
  const existing = await pb.collections.getFullList<ExistingCollection>();
  const byName = new Map(existing.map((collection) => [collection.name, collection]));

  const created: string[] = [];
  const updated: string[] = [];
  let indexCount = 0;

  for (const collection of HOT_COLLECTIONS) {
    const spec = COLLECTION_SPECS[collection];
    const indexes = buildIndexStatements(collection);
    indexCount += indexes.length;

    const current = byName.get(collection);
    if (!current) {
      await pb.collections.create({
        name: spec.name,
        type: 'base',
        fields: spec.fields,
        indexes,
        // Superuser-only defaults (null = no API rule; admin API only).
        listRule: null,
        viewRule: null,
        createRule: null,
        updateRule: null,
        deleteRule: null,
      });
      created.push(collection);
      continue;
    }

    const currentFields = Array.isArray(current.fields) ? current.fields : [];
    const currentByName = new Map(
      currentFields.map((field) => [String(field['name'] ?? ''), field]),
    );
    const managed = new Set(spec.fields.map((field) => field.name));

    // Spreading the existing field first preserves its `id`/`system` attributes;
    // the desired definition then wins for every managed attribute.
    const mergedFields: Array<Record<string, unknown>> = spec.fields.map((field) => {
      const existingField = currentByName.get(field.name);
      return existingField ? { ...existingField, ...field } : { ...field };
    });
    for (const field of currentFields) {
      if (!managed.has(String(field['name'] ?? ''))) mergedFields.push(field);
    }

    await pb.collections.update(current.id, { fields: mergedFields, indexes });
    updated.push(collection);
  }

  return { created, updated, indexCount };
}

// ---------------------------------------------------------------------------
// Seed data (--seed only): one opportunity per dashboard board tab + telemetry
// ---------------------------------------------------------------------------

const DAY_MS = 24 * 60 * 60 * 1000;

/** Relative dates keep seeds inside the board window on every run date. */
function isoOffsetDays(days: number): string {
  return new Date(Date.now() + days * DAY_MS).toISOString();
}

export const SEED_OPPORTUNITIES: unknown[] = [
  // events-local: pipeline events + local channel predicate.
  {
    fingerprint_hash: 'seed-opportunity-01',
    url_hash: 'seed-url-01',
    pipeline: 'events',
    bucket_channel: '#local-dk-udupi',
    status: 'audited',
    title: 'Udupi Dev Meetup 2026',
    organizer: 'Udupi Devs',
    links: { official: 'https://example.com/seed/udupi-dev-meetup-2026' },
    prize_cash_inr: null,
    prize_text: 'Community meetup — no cash prize',
    deadlines: { tba: false, apply_by: isoOffsetDays(10), event_start: isoOffsetDays(14) },
    end_date: isoOffsetDays(14),
    audit_summary: 'Seed row: audited local meetup for dashboard verification',
  },
  // events-travel: pipeline events + travel channel predicate.
  {
    fingerprint_hash: 'seed-opportunity-02',
    url_hash: 'seed-url-02',
    pipeline: 'events',
    bucket_channel: '#travel-bengaluru',
    status: 'routed',
    title: 'Bengaluru Hackathon 2026',
    organizer: 'Bengaluru Tech Collective',
    links: { official: 'https://example.com/seed/bengaluru-hackathon-2026' },
    prize_cash_inr: null,
    prize_text: 'Travel event — prize pending audit',
    deadlines: { tba: false, apply_by: isoOffsetDays(16), event_start: isoOffsetDays(21) },
    end_date: isoOffsetDays(21),
    audit_summary: 'Seed row: routed travel hackathon for dashboard verification',
  },
  // events-online: pipeline events + online/1-lakh channel predicate.
  {
    fingerprint_hash: 'seed-opportunity-03',
    url_hash: 'seed-url-03',
    pipeline: 'events',
    bucket_channel: '#-online-1lakh-plus',
    status: 'audited',
    title: 'National CTF Online 2026',
    organizer: 'National Cyber League',
    links: { official: 'https://example.com/seed/national-ctf-online-2026' },
    prize_cash_inr: 150000,
    prize_text: '₹1,50,000 verified cash prize',
    deadlines: { tba: false, apply_by: isoOffsetDays(25), event_start: isoOffsetDays(30) },
    end_date: isoOffsetDays(30),
    audit_summary: 'Seed row: online event with audited cash prize',
  },
  // tba-queue: deadlines.tba predicate; pipeline local so the events tabs do
  // not double-count it.
  {
    fingerprint_hash: 'seed-opportunity-04',
    url_hash: 'seed-url-04',
    pipeline: 'local',
    bucket_channel: '#-tba-queue',
    status: 'candidate',
    title: 'Mystery Prize Hackathon (TBA)',
    organizer: 'TBA Collective',
    links: { official: 'https://example.com/seed/mystery-prize-hackathon-tba' },
    prize_cash_inr: null,
    prize_text: 'Prize to be announced',
    deadlines: { tba: true },
    end_date: null,
    audit_summary: 'Seed row: TBA queue entry awaiting prize confirmation',
  },
  // jobs-sys: pipeline jobs + sys/cp/sec channel predicate.
  {
    fingerprint_hash: 'seed-opportunity-05',
    url_hash: 'seed-url-05',
    pipeline: 'jobs',
    bucket_channel: '#🔥-priority-sys-cp-sec',
    status: 'audited',
    title: 'Cloud DevOps Intern',
    organizer: 'Acme Cloud',
    links: { official: 'https://example.com/seed/cloud-devops-intern' },
    prize_cash_inr: null,
    prize_text: '',
    deadlines: { tba: false, apply_by: isoOffsetDays(18) },
    end_date: isoOffsetDays(18),
    experience_span: '0-1 yr',
    stack_tags: ['AWS', 'Linux', 'CI/CD'],
    eligibility_summary: 'Fresher-friendly; 0-1 yr experience',
    audit_summary: 'Seed row: audited sys/cp/sec internship',
  },
  // jobs-general: pipeline jobs + general channel predicate.
  {
    fingerprint_hash: 'seed-opportunity-06',
    url_hash: 'seed-url-06',
    pipeline: 'jobs',
    bucket_channel: '#-jobs-general',
    status: 'routed',
    title: 'Backend Engineer (0-1 yr)',
    organizer: 'Nimbus Systems',
    links: { official: 'https://example.com/seed/backend-engineer-0-1' },
    prize_cash_inr: null,
    prize_text: '',
    deadlines: { tba: false, apply_by: isoOffsetDays(20) },
    end_date: isoOffsetDays(20),
    experience_span: '0-1 yr',
    eligibility_summary: '0-1 yr backend role',
    audit_summary: 'Seed row: routed general backend role',
  },
  // loot: pipeline loot predicate.
  {
    fingerprint_hash: 'seed-opportunity-07',
    url_hash: 'seed-url-07',
    pipeline: 'loot',
    bucket_channel: '#loot-perks',
    status: 'audited',
    title: 'GitHub Copilot Student Pack',
    organizer: 'GitHub',
    links: { official: 'https://example.com/seed/github-copilot-student-pack' },
    prize_cash_inr: null,
    prize_text: 'Free developer perk',
    deadlines: { tba: false, apply_by: isoOffsetDays(45) },
    end_date: isoOffsetDays(45),
    shipping_verified: true,
    card_required: false,
    claim_steps: [{ step: 'Verify student status', quote: 'Free for verified students' }],
    audit_summary: 'Seed row: audited no-card developer perk',
  },
];

export const SEED_TELEMETRY: unknown[] = [
  {
    slot: 'seed-scout-events-1',
    provider: 'groq',
    model: 'llama-3.3-70b-versatile',
    step: 'STEP_1-scout',
    url: 'https://example.com/seed/udupi-dev-meetup-2026',
    status: 'active',
    duration_ms: 1200,
    detail: 'Seed row: events scout slot active',
  },
  {
    slot: 'seed-auditor-jobs-1',
    provider: 'cerebras',
    model: 'qwen-3-32b',
    step: 'STEP_3-audit',
    url: 'https://example.com/seed/cloud-devops-intern',
    status: 'done',
    duration_ms: 820,
    detail: 'Seed row: jobs audit completed',
  },
  {
    slot: 'seed-gc-1',
    provider: 'local',
    model: 'gc-engine',
    step: 'GC-midnight',
    status: 'cooldown',
    duration_ms: 42,
    detail: 'Seed row: GC slot in cooldown',
  },
];

// ---------------------------------------------------------------------------
// Upserts (filter lookup, never getFirstListItem)
// ---------------------------------------------------------------------------

function escapeFilterValue(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

async function upsertByFilter(
  pb: PbClient,
  collection: string,
  field: string,
  value: string,
  payload: Record<string, unknown>,
): Promise<'created' | 'updated'> {
  const matches = await pb.collection(collection).getFullList<{ id: string }>({
    filter: `${field} = "${escapeFilterValue(value)}"`,
  });
  if (matches.length > 0) {
    await pb.collection(collection).update(matches[0].id, payload);
    return 'updated';
  }
  await pb.collection(collection).create(payload);
  return 'created';
}

async function seedDevData(pb: PbClient): Promise<{
  opportunities: UpsertCounts;
  telemetry: UpsertCounts;
}> {
  const opportunities: UpsertCounts = { created: 0, updated: 0 };
  for (const raw of SEED_OPPORTUNITIES) {
    // Boundary failures stay loud — the same schema production writers use.
    const payload = Opportunity.parse(raw);
    const outcome = await upsertByFilter(
      pb,
      'opportunities',
      'url_hash',
      payload.url_hash,
      { ...payload },
    );
    opportunities[outcome] += 1;
  }

  const telemetry: UpsertCounts = { created: 0, updated: 0 };
  for (const raw of SEED_TELEMETRY) {
    const payload = AgentTelemetry.parse(raw);
    const outcome = await upsertByFilter(
      pb,
      'agent_telemetry',
      'slot',
      payload.slot,
      { ...payload },
    );
    telemetry[outcome] += 1;
  }

  return { opportunities, telemetry };
}

// ---------------------------------------------------------------------------
// Entrypoint
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const shouldSeed = process.argv.includes('--seed');

  assertSchemaRegistryConsistent();

  // Same fail-fast gate as every entrypoint. Credentials stay inside env/pb.
  const env = parseEnv();
  const pb = await createPbClient(env);

  const { created, updated, indexCount } = await applyCollections(pb);
  console.log(
    `collections created: ${created.length > 0 ? created.join(', ') : '(none)'}`,
  );
  console.log(
    `collections updated: ${updated.length > 0 ? updated.join(', ') : '(none)'}`,
  );
  console.log(`indexes applied: ${indexCount}`);

  if (!shouldSeed) {
    console.log('seed rows: skipped (pass --seed to insert/update dev seed data)');
    return;
  }

  const seeded = await seedDevData(pb);
  console.log(
    `seed opportunities: ${seeded.opportunities.created} created, ${seeded.opportunities.updated} updated`,
  );
  console.log(
    `seed agent_telemetry: ${seeded.telemetry.created} created, ${seeded.telemetry.updated} updated`,
  );
}

// Run only when this file is the entrypoint (keeps the seed arrays importable
// for smoke validation without attempting a PocketBase connection).
const invokedScript = process.argv[1] ?? '';
if (invokedScript.endsWith('bootstrap-pb.ts') || invokedScript.endsWith('bootstrap-pb.js')) {
  main().catch((err: unknown) => {
    // Message only — never the env, credentials, or auth payload.
    const message = err instanceof Error ? err.message : String(err);
    console.error('bootstrap-pb failed:', message);
    process.exitCode = 1;
  });
}
