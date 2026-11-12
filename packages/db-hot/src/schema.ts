// Hot-memory collection schemas (D-09, D-15).
//
// Six collections ship NOW even though writers land in later phases — this
// module is the contract every Phase 2+ pipeline depends on. One-way lock:
// once data exists, changes need a migration (see 01-02 SUMMARY Task 1).
//
// Parsing policy (plan prohibition): boundary failures stay LOUD. Schemas
// reject missing/wrong-typed known fields via Schema.parse(); Row variants
// carry `.catchall(z.unknown())` so PocketBase system fields (expand, etc.)
// are preserved, never silently dropped.
//
// Index notes: PocketBase applies indexes via the admin dashboard /
// migrations (owned by the infra plan). INDEX_NOTES records the intended
// index per collection so the infra plan and Phase 7 GC build the right ones.

import * as z from 'zod';

// ---------------------------------------------------------------------------
// Shared field shapes
// ---------------------------------------------------------------------------

/** Canonical pipeline vocabulary (Phase 1 contract; extend only by migration). */
export const PIPELINES = ['events', 'jobs', 'loot', 'local', 'social'] as const;
export const Pipeline = z.enum(PIPELINES);
export type Pipeline = z.infer<typeof Pipeline>;

/** Opportunity lifecycle states. */
export const OPPORTUNITY_STATUSES = [
  'candidate',
  'audited',
  'routed',
  'rejected',
  'tombstoned',
  'expired',
] as const;
export const OpportunityStatus = z.enum(OPPORTUNITY_STATUSES);
export type OpportunityStatus = z.infer<typeof OpportunityStatus>;

/** Telemetry lifecycle states. */
export const TELEMETRY_STATUSES = ['active', 'done', 'cooldown', 'error'] as const;
export const TelemetryStatus = z.enum(TELEMETRY_STATUSES);
export type TelemetryStatus = z.infer<typeof TelemetryStatus>;

/** Discord inbox row lifecycle (capture -> triage -> repost). */
export const DISCORD_INBOX_STATUSES = [
  'pending',
  'classified',
  'posted',
  'skipped',
  'error',
] as const;
export const DiscordInboxStatus = z.enum(DISCORD_INBOX_STATUSES);
export type DiscordInboxStatus = z.infer<typeof DiscordInboxStatus>;

/** Fine-grained machine event classes for the local glass feed. */
export const MACHINE_EVENT_TYPES = [
  'scheduler',
  'scout',
  'dedup',
  'fetch',
  'sanitize',
  'scratchpad',
  'llm',
  'orchestrator',
  'discord',
  'gc',
  'db',
  'system',
] as const;
export const MachineEventType = z.enum(MACHINE_EVENT_TYPES);
export type MachineEventType = z.infer<typeof MachineEventType>;

/** Machine event lifecycle states. */
export const MACHINE_EVENT_STATUSES = ['start', 'ok', 'error', 'skip', 'cooldown'] as const;
export const MachineEventStatus = z.enum(MACHINE_EVENT_STATUSES);
export type MachineEventStatus = z.infer<typeof MachineEventStatus>;

// ---------------------------------------------------------------------------
// opportunities (MEM-01)
// ---------------------------------------------------------------------------

export const OpportunityLinks = z.object({
  official: z.url(),
  aggregator: z.url().optional(),
  apply: z.url().optional(),
});
export type OpportunityLinks = z.infer<typeof OpportunityLinks>;

export const OpportunityDeadlines = z.object({
  /** True while the prize/date is still TBA (two-ping 48h loop owns these). */
  tba: z.boolean().default(false),
  apply_by: z.iso.datetime().optional(),
  event_start: z.iso.datetime().optional(),
  event_end: z.iso.datetime().optional(),
});
export type OpportunityDeadlines = z.infer<typeof OpportunityDeadlines>;

export const OpportunityReminder = z.object({
  at: z.iso.datetime(),
  channel: z.string().min(1),
  sent: z.boolean().default(false),
});
export type OpportunityReminder = z.infer<typeof OpportunityReminder>;

export const Opportunity = z.object({
  fingerprint_hash: z.string().min(1),
  /** Join key into the cold tombstone_ledger (hot-then-cold precheck). */
  url_hash: z.string().min(1),
  pipeline: Pipeline,
  /** Discord channel this opportunity routes to (e.g. "#-online-1lakh-plus"). */
  bucket_channel: z.string().min(1),
  status: OpportunityStatus,
  title: z.string().min(1),
  organizer: z.string().min(1),
  links: OpportunityLinks,
  /** Liquid-cash prize in INR; null while TBA/unverified (credits stripped). */
  prize_cash_inr: z.number().min(0).nullable().default(null),
  /** Human-readable prize line as audited (kept verbatim for the audit card). */
  prize_text: z.string().default(''),
  deadlines: OpportunityDeadlines,
  /** GC-ready: rows past end_date are purge-eligible (Phase 7 midnight GC). */
  end_date: z.iso.datetime().nullable().default(null),
  reminders: z.array(OpportunityReminder).default([]),
  bookmark: z.boolean().default(false),
  /** One-line auditor verdict rendered on the Discord audit card. */
  audit_summary: z.string().default(''),
  /** Heavy-text column: raw fetched copy, FIRST purge target under GC. */
  description_raw: z.string().default(''),
  // ---------------------------------------------------------------------------
  // D-14: nullable/defaulted Phase 5 extension fields (one-way migration)
  // Jobs fields (experience span, stack tags, eligibility summary)
  experience_span: z.string().nullable().default(null),
  stack_tags: z.array(z.string()).default([]),
  eligibility_summary: z.string().default(''),
  // Loot fields (shipping verified, card required, claim steps)
  shipping_verified: z.boolean().nullable().default(null),
  card_required: z.boolean().nullable().default(null),
  claim_steps: z.array(z.object({ step: z.string(), quote: z.string() })).default([]),
  // Shared fields (registration links, possible dupe of)
  registration_links: z.array(z.string()).default([]),
  possible_dupe_of: z.string().default(''),
  // D-05/D-06: Discord message ID of the audit card this opportunity was posted as.
  // One-way migration: nullable default, no new collection. Enables bookmark lookup
  // by reaction message ID (UI-02).
  discord_message_id: z.string().default(''),
});
export type Opportunity = z.infer<typeof Opportunity>;

export const OpportunityRow = Opportunity.extend({
  id: z.string().min(1),
  created: z.iso.datetime(),
  updated: z.iso.datetime(),
}).catchall(z.unknown());
export type OpportunityRow = z.infer<typeof OpportunityRow>;

// ---------------------------------------------------------------------------
// agent_telemetry (MEM-02) — 24h ring, trimmed by isTelemetryExpired
// ---------------------------------------------------------------------------

export const AgentTelemetry = z.object({
  /** Rolling agent slot id (e.g. "scout-events-2"). */
  slot: z.string().min(1),
  provider: z.string().min(1),
  model: z.string().min(1),
  /** Pipeline micro-step (e.g. "STEP_3-audit"). */
  step: z.string().min(1),
  url: z.string().default(''),
  status: TelemetryStatus,
  duration_ms: z.number().min(0).optional(),
  /** Heavy-text column: micro-step detail ticker, GC-purged after 24h. */
  detail: z.string().default(''),
});
export type AgentTelemetry = z.infer<typeof AgentTelemetry>;

export const AgentTelemetryRow = AgentTelemetry.extend({
  id: z.string().min(1),
  created: z.iso.datetime(),
  updated: z.iso.datetime(),
}).catchall(z.unknown());
export type AgentTelemetryRow = z.infer<typeof AgentTelemetryRow>;

// ---------------------------------------------------------------------------
// discord_inbox — raw announcement capture queue (D-04 repost router)
// ---------------------------------------------------------------------------
//
// The bot owns capture (gateway) and the scheduler owns triage (LlmRouter).
// This collection is the durable handoff between them. Nothing here is an
// opportunity row: these messages are reposted without verification.

export const DiscordInboxImage = z.object({
  url: z.url(),
  name: z.string().default(''),
  contentType: z.string().default(''),
  size: z.number().min(0).default(0),
  width: z.number().min(0).nullable().default(null),
  height: z.number().min(0).nullable().default(null),
});
export type DiscordInboxImage = z.infer<typeof DiscordInboxImage>;

export const DiscordInbox = z.object({
  /** Discord message ID in the source channel. Unique index. */
  message_id: z.string().min(1),
  /** One of the configured DISCORD_RELAY_SOURCE_CHANNEL_ID_* values. */
  source_channel_id: z.string().min(1),
  /** Original server name resolved from the follower webhook. */
  source_server: z.string().default(''),
  /** Original channel name resolved from the follower webhook. */
  source_channel_name: z.string().default(''),
  /** Local guild ID, used to build the message URL. */
  guild_id: z.string().default(''),
  /** https://discord.com/channels/<guild>/<channel>/<message> (trace only). */
  message_url: z.string().default(''),
  /** Sanitized text: mentions stripped, length capped. */
  content: z.string().default(''),
  /** Normalized original embeds (title/description/url/fields/image). */
  embed_json: z.array(z.record(z.string(), z.unknown())).default([]),
  /** External URLs extracted from content/embeds/buttons. */
  links: z.array(z.string()).default([]),
  /** Flyer/image attachments. */
  images: z.array(DiscordInboxImage).default([]),
  /** sha256(normalized first link) or sha256(content|title) for cross-source dedup. */
  dedup_key: z.string().default(''),
  status: DiscordInboxStatus.default('pending'),
  /** Classified pipeline; empty while pending or skipped. */
  pipeline: Pipeline.or(z.literal('')).default(''),
  /** Bucket-channel name, e.g. "#💼-jobs-general-swe". */
  target_channel: z.string().default(''),
  /** { method, confidence, reason, event_kind, job_kind } */
  classification: z.record(z.string(), z.unknown()).default({}),
  /** ID of the reposted message in the destination channel. */
  posted_message_id: z.string().default(''),
  /** Triage + repost retry counter. */
  attempts: z.number().int().min(0).default(0),
  last_error: z.string().default(''),
});
export type DiscordInbox = z.infer<typeof DiscordInbox>;

export const DiscordInboxRow = DiscordInbox.extend({
  id: z.string().min(1),
  created: z.iso.datetime(),
  updated: z.iso.datetime(),
}).catchall(z.unknown());
export type DiscordInboxRow = z.infer<typeof DiscordInboxRow>;

// ---------------------------------------------------------------------------
// machine_events — append-only fine-grained machinery log (24h ring)
// ---------------------------------------------------------------------------
//
// Complements agent_telemetry: agent_telemetry is an upsert-per-slot snapshot,
// machine_events is history. One row per machine operation (fetch, sanitize,
// LLM attempt, orchestrator verdict, Discord post, scheduler tick, ...) so the
// local Machine Glass page can show every tool call for a candidate.

export const MachineEvent = z.object({
  /** Grouping key: url hash for candidate work, job name for scheduler work. */
  trace_id: z.string().default(''),
  /** Rolling agent/worker id (e.g. "auditor-events-1", "scheduler"). */
  agent: z.string().min(1),
  /** Pipeline label; empty for system-only events. */
  pipeline: Pipeline.or(z.literal('')).default(''),
  event_type: MachineEventType,
  /** Concrete tool: "groq.chat", "jina.reader", "playwright.fetch", "discord.post". */
  tool: z.string().min(1),
  provider: z.string().default(''),
  model: z.string().default(''),
  /** Pipeline micro-step (e.g. "STEP_3-audit"). */
  step: z.string().default(''),
  status: MachineEventStatus,
  duration_ms: z.number().min(0).optional(),
  url: z.string().default(''),
  /** Truncated request/input summary (GC-purged after 24h). */
  input_summary: z.string().default(''),
  /** Truncated response/output summary (GC-purged after 24h). */
  output_summary: z.string().default(''),
  /** Heavy-text detail ticker (GC-purged after 24h). */
  detail: z.string().default(''),
  /** Baton-pass target on 429/413 (e.g. "cerebras:qwen-3-32b"). */
  baton_to: z.string().default(''),
  /** Arbitrary structured metadata (counts, bytes, gate results). */
  meta: z.record(z.string(), z.unknown()).default({}),
});
export type MachineEvent = z.infer<typeof MachineEvent>;

export const MachineEventRow = MachineEvent.extend({
  id: z.string().min(1),
  created: z.iso.datetime(),
  updated: z.iso.datetime(),
}).catchall(z.unknown());
export type MachineEventRow = z.infer<typeof MachineEventRow>;

// ---------------------------------------------------------------------------
// task_scratchpad — atomic STEP_1..STEP_4 position + partial stream buffer
// ---------------------------------------------------------------------------

export const TaskScratchpad = z.object({
  candidate_url: z.url(),
  /** Orchestrator STEP machine position (STEP_1..STEP_4). */
  step_position: z.string().min(1),
  /** Pipeline this scratchpad row belongs to (events | jobs | loot | local | social). */
  pipeline: Pipeline.default('events'),
  /** Candidate title captured at scratchpad creation for audit-card rendering. */
  candidate_title: z.string().default(''),
  /** Partial LLM stream buffered across 429/413 baton-passes. */
  partial_buffer: z.string().default(''),
  attempts: z.number().int().min(0).default(0),
  last_error: z.string().nullable().default(null),
});
export type TaskScratchpad = z.infer<typeof TaskScratchpad>;

export const TaskScratchpadRow = TaskScratchpad.extend({
  id: z.string().min(1),
  created: z.iso.datetime(),
  updated: z.iso.datetime(),
}).catchall(z.unknown());
export type TaskScratchpadRow = z.infer<typeof TaskScratchpadRow>;

// ---------------------------------------------------------------------------
// tombstone_ledger (hot mirror of the cold ledger — GC NEVER purges)
// ---------------------------------------------------------------------------

export const TombstoneMirror = z.object({
  url_hash: z.string().min(1),
  fingerprint: z.string().min(1),
  terminal_status: z.string().min(1),
  source: z.string().default(''),
  decided_at: z.iso.datetime(),
});
export type TombstoneMirror = z.infer<typeof TombstoneMirror>;

export const TombstoneMirrorRow = TombstoneMirror.extend({
  id: z.string().min(1),
  created: z.iso.datetime(),
  updated: z.iso.datetime(),
}).catchall(z.unknown());
export type TombstoneMirrorRow = z.infer<typeof TombstoneMirrorRow>;

// ---------------------------------------------------------------------------
// taste_rules — seeded EMPTY (D-11); Phase 6 training-chat writes arrive later
// ---------------------------------------------------------------------------

export const TasteRule = z.object({
  kind: z.string().min(1),
  rule: z.string().min(1),
  weight: z.number().min(0).default(1.0),
  source: z.string().default(''), // 'reaction' | 'keyword' | 'dm' — tracks rule origin (D-11)
  created_at: z.iso.datetime().default(() => new Date().toISOString()),
});
export type TasteRule = z.infer<typeof TasteRule>;

export const TasteRuleRow = TasteRule.extend({
  id: z.string().min(1),
  created: z.iso.datetime(),
  updated: z.iso.datetime(),
}).catchall(z.unknown());
export type TasteRuleRow = z.infer<typeof TasteRuleRow>;

// ---------------------------------------------------------------------------
// Collection registry + index notes (infra plan consumes INDEX_NOTES)
// ---------------------------------------------------------------------------

export const HOT_COLLECTIONS = [
  'opportunities',
  'agent_telemetry',
  'machine_events',
  'task_scratchpad',
  'tombstone_ledger',
  'taste_rules',
  'discord_inbox',
] as const;
export type HotCollection = (typeof HOT_COLLECTIONS)[number];

/** Intended PocketBase indexes per collection (applied by the infra plan). */
export const INDEX_NOTES: Record<HotCollection, readonly string[]> = {
  // Two-tier precheck reads hot by fingerprint equality first: single-row.
  opportunities: ['fingerprint_hash (unique)', 'url_hash', 'status', 'end_date', 'pipeline + status'],
  // Ring trim scans by age; slot boards filter by slot + recency.
  agent_telemetry: ['created', 'slot + created'],
  // Append-only glass feed: newest-first scans + per-agent/per-type/per-trace slices.
  machine_events: ['created', 'agent + created', 'event_type + created', 'trace_id + created'],
  // Resume-by-URL after a crash must be a point lookup; step_position is the
  // drain filter for the Phase 5 audit orchestrator (STEP_2 rows).
  task_scratchpad: ['candidate_url (unique)', 'step_position'],
  // Mirror point-lookup parity with the cold hash PK; tombstones are eternal.
  tombstone_ledger: ['url_hash (unique)', 'fingerprint'],
  // Training-chat weight tuning reads by kind.
  taste_rules: ['kind'],
  // Capture is idempotent by message ID; triage scans pending oldest-first;
  // dedup catches the same announcement followed into multiple source channels.
  discord_inbox: ['message_id (unique)', 'status + created', 'dedup_key'],
};

// D-14 coordination note: the PocketBase collection update (adding the new
// fields above to the `opportunities` and `task_scratchpad` collections) and
// the INDEX_NOTES index application must be applied together with the phase's
// infra step. HOT_COLLECTIONS is intentionally untouched — no new collection
// is added; this is a one-way field-only migration on existing collections.
