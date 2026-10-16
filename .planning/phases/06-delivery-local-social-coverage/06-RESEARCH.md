# Phase 6: Delivery + Local/Social Coverage - Research

**Researched:** 2026-10-16
**Domain:** Discord gateway events, local domain crawling, social session-cookie polling, TBA re-audit loop, taste-rule feedback injection
**Confidence:** HIGH

## Summary

Phase 6 delivers the remaining five ingestion/feedback pipelines and the full routing matrix. The codebase already has the structural foundation: `PIPELINES` includes `local` and `social`, `opportunities` has `reminders[]`, `bookmark`, and `deadlines.tba` fields, `taste_rules` collection is seeded empty, and the `CandidateSource` interface + `runStubTick` pipeline accepts new sources without structural change. The existing `audit-drain` job (every 5m + 60s jitter) is the reuse point for TBA re-audit (D-10).

The five capability areas are: (1) local DK/Udupi crawler with geo classification routing to #📍-local-dk-udupi / #✈️-travel-curated, (2) X/LinkedIn session-cookie polling with human pacing, (3) Discord #announcements relay via polling timer into #raw-incoming-feeds, (4) 📌 bookmark reaction + 48h/24h deadline reminder system anchored on event dates, and (5) taste-rules feedback loop from #🧠-bot-training-chat with three ingestion paths and hybrid application (BLOCK = pre-scoring, BOOST/WEIGHT/CUSTOM = system-prompt injection).

**Primary recommendation:** Build each capability as a focused module that plugs into existing integration points (scheduler registry, orchestrator audit-drain, router service, rule-pack message builders) — never scatter `setInterval`, never duplicate the candidate pipeline, and always `zod`-parse at boundaries.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** Domain inventory = **Hybrid** — code defaults (NITK, MIT Manipal, NMAMIT, SJEC, Sahyadri, MITE, AJIET, St. Aloysius, SOSC, GDG/FOSS domains) + `LOCAL_WATCHLIST_DOMAINS` env override (comma-separated). Operator can extend without redeploy.
- **D-02:** Geo classification = **Location-primary** — event location text / venue city is the primary signal; organizer city is secondary; "selection round" / "registration" keyword distinguishes travel-curated (has selection) from walk-in-reject (no selection round). Local DK/Udupi offline events route to `#📍-local-dk-udupi` regardless of prize size. Out-of-town offline with verified selection round routes to `#✈️-travel-curated`. Walk-in low-effort out-of-town rejected.
- **D-03:** Bio-link watcher = **Browser page poll** — poll full page via shared Playwright browser (bio-links are JS-rendered, need headless rendering). Reuses the existing `packages/browser` singleton + tab queue.
- **D-04:** Relay mechanism = **Polling timer** — poll external Discord #announcements on a timer (bounded latency, no cross-guild bot membership needed). Bot reads new posts and relays into private #raw-incoming-feeds.
- **D-05:** Bookmark emoji = **Custom server emoji** — avoids unicode 📌 rendering issues across Discord clients. Bot listens for `MessageReactionAdd` with the custom emoji on audit cards, sets `bookmark=true` on the opportunity row, arms deadline reminders.
- **D-06:** Reminder anchor = **Event date** — 48h/24h deadline reminders count down to `deadlines.event_start` / `deadlines.apply_by` (the actual deadline), not post time. Reminders stored in `opportunities.reminders[]` with `{ at, channel, sent }` shape.
- **D-07:** Cookie storage = **Exported cookies file on disk** — burner session cookies exported from a browser session to a JSON file on the VM.
- **D-08:** Human pacing = **30–90s jitter between requests, max 5 actions per tick** — conservative pacing to avoid rate-limit bans on X/LinkedIn.
- **D-09:** Search-index fallback = **None** — accept coverage gaps when direct polling is blocked/rate-limited.
- **D-10:** TBA re-audit = **Reuse existing audit-drain** (every 5m + 60s jitter) — scan `deadlines.tba=true` rows whose last audit was >48h ago, re-audit them, until the event date/time arrives. Ping #1 fires when TBA detected (routes to `#⏳-early-tba-radar` with `WATCHING_TBA` status). Ping #2 fires when prize/date is confirmed or event passes.
- **D-11:** Training-chat → taste rule = **All 3 paths supported** — (1) Reaction-based: 👍/👎 on an audit card → BOOST/BLOCK rule; (2) Keyword command: operator types a rule directly in #🧠-bot-training-chat; (3) DM to bot: operator DMs the bot a rule. All three create/update `taste_rules` rows in PocketBase. Confirmation reply posted in the channel.
- **D-12:** Taste rule application = **Hybrid** — BLOCK rules = pre-scoring filter (checked before LLM runs; auto-rejects + tombstones, never reaches the auditor — saves free-tier LLM quota). BOOST/WEIGHT/CUSTOM rules = system-prompt injection (appended to auditor's system prompt as advisory signals; LLM retains final judgment).
- **D-13:** Taste rule precedence = **Taste BLOCK overrides soft/personal gates but NOT hard compliance gates** — hard gates (2+yr roles, unpaid non-fellowships, pay-to-training, US/EU-only swag) are mission-non-negotiable per PROJECT.md out-of-scope and cannot be overridden by taste rules.

### the agent's Discretion
- Exact cron expressions for new poll jobs (within the already-decided cadence windows: local 2–4h, social 45–90m jitter)
- Internal data flow for relay (how polled announcements map to #raw-incoming-feeds posts)
- Reminder ticker implementation details (how `reminders[]` rows are scanned and fired)
- Taste rule schema extension beyond the existing `{ kind, rule, weight, created_at }` shape if needed
- Bio-link page change-detection heuristics (what constitutes a "new" bio-link opportunity)

### Deferred Ideas (OUT OF SCOPE)
None — discussion stayed within phase scope
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| ING-02 | System crawls DK & Udupi college/community watchlist domains and bio-link pages every 2–4 hours | Local CandidateSource via runStubTick pipeline; hybrid domain inventory (D-01); browser-based bio-link polling (D-03) |
| ING-04 | Bot relays external Discord #announcements into private #raw-incoming-feeds via official Bot Gateway | Polling timer pattern via discord.js v14 `channel.messages.fetch({ after })` [VERIFIED: Context7 /websites/discord_js_packages_discord_js_14_25_1] |
| ING-05 | System polls X/LinkedIn via exported session cookies on randomized 45–90 minute jitter | Cookie file on disk (D-07); human pacing 30–90s jitter, max 5 actions/tick (D-08) |
| EVT-03 | Local DK/Udupi offline events route to #📍-local-dk-udupi regardless of prize size | Location-primary geo classification (D-02); local pipeline routing |
| EVT-04 | Out-of-town offline events require verified selection round + quality to reach #✈️-travel-curated; walk-in low-effort rejected | Selection-round keyword detection (D-02); travel-curated bucket routing |
| EVT-06 | Legit TBA prize/agenda events fire Ping #1 to #⏳-early-tba-radar with WATCHING_TBA status and re-audit every 48h until Ping #2 | Reuse audit-drain scan (D-10); TBA two-ping loop design |
| UI-02 | 📌 reaction bookmarks an opportunity and arms its deadline reminders | Discord.js v14 `messageReactionAdd` + custom emoji (D-05); reminder anchoring on event dates (D-06) |
| MEM-04 | Cold `taste_rules` (BLOCK/BOOST/WEIGHT/CUSTOM) inject into Auditor/Curator prompts from #🧠-bot-training-chat feedback with confirmation reply | Three ingestion paths (D-11); hybrid application (D-12); precedence rules (D-13) |
</phase_requirements>

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Local domain crawling | API / Backend | Database / Storage | Scheduler-owned poll job fetches college/community pages; results stored as candidates in scratchpad |
| Bio-link watching | API / Backend | Browser / Client | Shared Playwright browser renders JS-heavy bio-link pages; results enter candidate pipeline |
| X/LinkedIn social polling | API / Backend | — | Cookie-based session polling via Node fetch; human pacing enforced in scheduler |
| Discord announcements relay | API / Backend | — | Bot Gateway client polls external channel; relays into private channel |
| Bookmark reaction handling | API / Backend | — | Gateway `messageReactionAdd` event → PB update → reminder arming |
| Reminder ticker | API / Backend | — | Periodic scan of bookmarked opportunities → Discord deadline posts |
| TBA re-audit | API / Backend | — | Extends existing audit-drain scan; no new scheduler job |
| Taste rule ingestion | API / Backend | — | Gateway message/reaction events → PB taste_rules writes → confirmation reply |
| Taste rule application | API / Backend | — | Pre-scoring filter + system-prompt injection in orchestrator |

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| discord.js | ^14.25.1 | Gateway client, reaction events, message polling, channel sending | Already in stack; Context7 confirms v14 API surface [VERIFIED: Context7 /websites/discord_js_packages_discord_js_14_25_1] |
| kelektiv/node-cron | ^4 | Poll scheduling (local 2–4h, social 45–90m, relay timer) | Already in stack; `noOverlap` + `maxRandomDelay` + `timezone` [VERIFIED: Context7 /node-cron/node-cron] |
| zod | ^4 | Runtime validation of taste rules, local candidates, social candidates | Already in stack; boundary parsing |
| pino | ^10 | Structured logging for all new services | Already in stack |
| playwright-core | ^1.55–1.63 | Bio-link page rendering (shared singleton) | Already in stack via `packages/browser` |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| p-limit | (existing) | Concurrency limit for browser tab queue | Already used in `packages/browser` |
| cheerio | ^1.1 | HTML parsing for local domain event extraction | Already in sanitize pipeline |
| turndown | ^7.2 | HTML→markdown for local/social content | Already in sanitize pipeline |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Polling timer for relay (D-04) | Gateway `messageCreate` listener on external guild | Requires bot to be member of external guild; polling avoids cross-guild invitation |
| Cookie file for social (D-07) | Headless browser session for X/LI | Cookie export is simpler, lighter, easier to rotate; browser session costs more RAM |
| Custom emoji for bookmark (D-05) | Unicode 📌 | Unicode rendering varies across clients; custom server emoji is consistent |

**Installation:**
```bash
# No new packages needed — all dependencies already in stack
```

## Architecture Patterns

### System Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                        External Sources                              │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────────────┐   │
│  │ DK/Udupi │  │ X/LinkedIn│  │ Discord  │  │  Bio-link Pages  │   │
│  │ domains  │  │ (cookies) │  │ #announce│  │  (JS-rendered)   │   │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘  └────────┬─────────┘   │
└───────┼──────────────┼──────────────┼──────────────────┼────────────┘
        │              │              │                  │
        ▼              ▼              ▼                  ▼
┌─────────────────────────────────────────────────────────────────────┐
│                     Scheduler (registry.ts)                          │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────────────────────┐ │
│  │ local-poll   │ │ social-poll  │ │ relay-poll                   │ │
│  │ (2-4h + jitter)│ (45-90m jitter)│ (timing per D-04 discretion)  │ │
│  └──────┬───────┘ └──────┬───────┘ └──────────────┬───────────────┘ │
│         │                │                         │                 │
│         ▼                ▼                         ▼                 │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────────────────────┐ │
│  │ LocalSource  │ │ SocialSource │ │ RelayService                 │ │
│  │ .list()      │ │ .list()      │ │ channel.messages.fetch()     │ │
│  │ + bio-link   │ │ + cookies    │ │ → #raw-incoming-feeds        │ │
│  └──────┬───────┘ └──────┬───────┘ └──────────────────────────────┘ │
│         │                │                                         │
│         ▼                ▼                                         │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │              runStubTick Candidate Pipeline                    │  │
│  │  precheck → merge → scout → scratchpad → fetch → STEP_2      │  │
│  └──────────────────────────┬───────────────────────────────────┘  │
└─────────────────────────────┼───────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│                     Orchestrator (audit-drain)                       │
│  ┌────────────────────────────────────────────────────────────────┐ │
│  │ STEP_2 drain → rule pack → LLM → gates → opportunities/tombstone│ │
│  │                                                                │ │
│  │ TBA Extension (D-10):                                          │ │
│  │   scan deadlines.tba=true → re-audit every 48h → Ping #1/#2   │ │
│  │                                                                │ │
│  │ Taste Rule Extension (D-12):                                   │ │
│  │   BLOCK → pre-scoring filter                                   │ │
│  │   BOOST/WEIGHT/CUSTOM → system-prompt injection                │ │
│  └────────────────────────────────────────────────────────────────┘ │
└─────────────────────────────┬───────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│                     Discord Router + Gateway                         │
│  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐  │
│  │ processOpportunity│  │ Bookmark Handler │  │ Reminder Ticker  │  │
│  │ (audited→routed)  │  │ messageReaction  │  │ scan reminders[] │  │
│  │ 10-channel matrix │  │ Add → bookmark   │  │ → 48h/24h posts  │  │
│  └──────────────────┘  └──────────────────┘  └──────────────────┘  │
│  ┌──────────────────┐  ┌──────────────────────────────────────────┐│
│  │ Taste Rule       │  │ buildAuditCard                           ││
│  │ Ingestion        │  │ (tba flag, prize, audit, bookmark)       ││
│  │ 3 paths → PB     │  └──────────────────────────────────────────┘│
│  └──────────────────┘                                              │
└─────────────────────────────────────────────────────────────────────┘
```

### Recommended Project Structure

```
packages/
├── discord-router/src/
│   ├── portals/
│   │   ├── local.ts          # Local DK/Udupi CandidateSource (list + bio-link)
│   │   └── social.ts         # X/LinkedIn CandidateSource (cookies + pacing)
│   ├── relay.ts              # Announcements relay service (poll → #raw-incoming-feeds)
│   ├── bookmark.ts           # Reaction handler (📌 custom emoji → bookmark + arm reminders)
│   ├── reminder.ts           # Reminder ticker (scan reminders[] → fire 48h/24h)
│   └── taste-ingest.ts       # Taste rule ingestion (3 paths → PB + confirmation)
├── orchestrator/src/
│   ├── tba-loop.ts           # TBA re-audit extension (Ping #1/#2 logic)
│   └── taste-apply.ts        # Taste rule application (BLOCK pre-scoring, BOOST prompt injection)
├── scheduler/src/
│   └── jobs.ts               # Add local-poll, social-poll, relay-poll, reminder-tick jobs
└── config/src/
    └── env.ts                # Add new env keys (LOCAL_WATCHLIST_DOMAINS, SOCIAL_COOKIES_PATH, etc.)
```

### Pattern 1: CandidateSource for Local + Social (ING-02, ING-05)
**What:** New `CandidateSource` implementations that plug into `runStubTick` via `candidateSources` injection.
**When to use:** Every new ingestion source — local domains and social polling.
**Example:**
```typescript
// packages/discord-router/src/portals/local.ts
import type { PollCandidate } from '@zod/scheduler/jobs';
import type { CandidateSource } from '@zod/scheduler/jobs';

const DEFAULT_LOCAL_DOMAINS = [
  'nitk.edu.in', 'manipal.edu', 'nmamit.nitte.edu.in',
  'sjec.ac.in', 'sahyadri.edu.in', 'mite.ac.in',
  'ajiet.edu.in', 'staloysius.edu.in', 'sosc.org.in',
];

export function getLocalDomains(): string[] {
  const extra = process.env['LOCAL_WATCHLIST_DOMAINS'] ?? '';
  const extras = extra.split(',').map((d) => d.trim()).filter(Boolean);
  return [...new Set([...DEFAULT_LOCAL_DOMAINS, ...extras])];
}

export const localSource: CandidateSource = {
  pipeline: 'local',
  async list(): Promise<PollCandidate[]> {
    const domains = getLocalDomains();
    // Fetch each domain's events page, parse with cheerio, extract PollCandidate[]
    // Bio-link pages: use fetchViaBrowser for JS-rendered content
    // ...
  },
};
```
[VERIFIED: packages/scheduler/src/jobs.ts:220-230 — CandidateSource interface]

### Pattern 2: Polling Timer for Relay (ING-04)
**What:** A cron job that polls an external Discord channel for new messages and relays them into #raw-incoming-feeds.
**When to use:** When the bot is not a member of the external guild (D-04 decision).
**Example:**
```typescript
// Poll external #announcements every N minutes
async function relayTick(log: TickLogger): Promise<void> {
  const client = getClient();
  if (!client) return;
  
  const sourceChannelId = env.DISCORD_RELAY_SOURCE_CHANNEL_ID;
  const targetChannelId = env.DISCORD_CHANNEL_RELAY;
  
  const source = await client.channels.fetch(sourceChannelId);
  const target = await client.channels.fetch(targetChannelId);
  
  // Fetch messages after last relayed message ID
  const lastId = await getLastRelayedId(pb);
  const messages = await source.messages.fetch({ 
    limit: 20, 
    after: lastId ?? undefined 
  });
  
  for (const msg of messages.values()) {
    await target.send({ content: msg.content });
    await saveLastRelayedId(pb, msg.id);
  }
}
```
[VERIFIED: Context7 /websites/discord_js_packages_discord_js_14_25_1 — FetchMessagesOptions with `after` for pagination]

### Pattern 3: Reaction Handler for Bookmarks (UI-02)
**What:** Gateway event listener for `messageReactionAdd` with custom emoji.
**When to use:** When user reacts with the custom bookmark emoji on an audit card.
**Example:**
```typescript
client.on('messageReactionAdd', async (reaction, user) => {
  if (user.bot) return;
  if (reaction.emoji.id !== env.BOOKMARK_EMOJI_ID) return;
  
  // Find the opportunity this message corresponds to
  const messageId = reaction.message.id;
  const opp = await findOpportunityByMessageId(pb, messageId);
  if (!opp) return;
  
  // Set bookmark=true and arm reminders
  await pb.collection('opportunities').update(opp.id, { 
    bookmark: true,
    reminders: computeReminders(opp.deadlines, opp.bucket_channel),
  });
  
  // Confirmation reply
  await reaction.message.reply('🔖 Bookmarked — you will get 48h and 24h reminders.');
});
```
[VERIFIED: Context7 /websites/discord_js_packages_discord_js_14_25_1 — `messageReactionAdd` event, `reaction.emoji.id` for custom guild emoji]

### Pattern 4: Reminder Ticker (UI-02, D-06)
**What:** A cron job that scans bookmarked opportunities and fires deadline reminders.
**When to use:** Periodic scan (e.g. every 15–30m) of `reminders[]` where `sent=false` and `at <= now`.
**Example:**
```typescript
async function reminderTick(log: TickLogger): Promise<void> {
  const now = new Date().toISOString();
  const page = await pb.collection('opportunities').getList(1, 50, {
    filter: `bookmark = true && reminders.sent = false && reminders.at <= '${now}'`,
  });
  
  for (const opp of page.items) {
    const reminder = opp.reminders.find((r: any) => !r.sent && r.at <= now);
    if (!reminder) continue;
    
    const channel = await resolveChannel(env, client, reminder.channel);
    await channel.send(`⏰ Reminder: **${opp.title}** — ${formatReminder(reminder, opp.deadlines)}`);
    
    // Mark reminder as sent
    const updated = opp.reminders.map((r: any) => 
      r.at === reminder.at ? { ...r, sent: true } : r
    );
    await pb.collection('opportunities').update(opp.id, { reminders: updated });
  }
}
```

### Pattern 5: TBA Re-Audit Loop (EVT-06, D-10)
**What:** Extension to the existing audit-drain that scans TBA rows and re-audits them.
**When to use:** Within the 5m audit-drain tick, scan for `deadlines.tba=true` rows.
**Example:**
```typescript
// Inside audit-drain tick handler (orchestrator.ts extension)
async function tbaReauditScan(pb: PbLike, router: LlmRouter, log: Logger): Promise<void> {
  const now = Date.now();
  const page = await pb.collection('opportunities').getList(1, 50, {
    filter: 'deadlines.tba = true && updated < fortyEightHoursAgo',
    sort: 'updated',
  });
  
  for (const opp of page.items) {
    // Re-run the audit pipeline on this opportunity
    // If prize/date now confirmed → Ping #2, set tba=false
    // If event date passed → Ping #2 (expired), set tba=false
    // Otherwise → keep TBA, update timestamp
  }
}
```

### Pattern 6: Taste Rule Ingestion (MEM-04, D-11)
**What:** Three input paths for creating taste rules from operator feedback.
**When to use:** Reaction (👍/👎), keyword command in #🧠-bot-training-chat, or DM to bot.
**Example:**
```typescript
// Path 1: Reaction-based
client.on('messageReactionAdd', async (reaction, user) => {
  if (reaction.emoji.name === '👍') {
    await createTasteRule(pb, { kind: 'BOOST', rule: extractRuleFromMessage(reaction.message) });
    await reaction.message.reply('✅ Taste rule created: BOOST');
  } else if (reaction.emoji.name === '👎') {
    await createTasteRule(pb, { kind: 'BLOCK', rule: extractRuleFromMessage(reaction.message) });
    await reaction.message.reply('✅ Taste rule created: BLOCK');
  }
});

// Path 2: Keyword command
client.on('messageCreate', async (msg) => {
  if (msg.channelId !== env.DISCORD_CHANNEL_TRAINING) return;
  if (!msg.content.startsWith('!rule')) return;
  
  const parsed = parseRuleCommand(msg.content);
  await createTasteRule(pb, parsed);
  await msg.reply(`✅ Taste rule created: ${parsed.kind} — ${parsed.rule}`);
});
```

### Anti-Patterns to Avoid

- **Scattered setInterval:** Never use `setInterval` directly. All scheduling goes through `packages/scheduler/src/registry.ts` — the single scheduler registry owning every `cron.schedule()` call. [VERIFIED: packages/scheduler/src/registry.ts:1-5]
- **Duplicating the candidate pipeline:** New sources (local, social) must implement `CandidateSource` and ride `runStubTick` — never fork the precheck→merge→scout→fetch→STEP_2 pipeline. [VERIFIED: packages/scheduler/src/jobs.ts:340-594]
- **Unicode bookmark emoji:** D-05 explicitly chooses custom server emoji over unicode 📌 for cross-client rendering consistency.
- **New scheduler job for TBA:** D-10 explicitly reuses the existing audit-drain. Do not create a separate cron job for TBA re-audit.
- **Hard-rolling Discord API calls:** Use discord.js v14's `channel.messages.fetch()` and `channel.send()` — never raw REST calls for gateway features.
- **LLM prompt injection via taste rules:** Taste rules are appended to system prompts as advisory signals (D-12), never concatenated into user message content where they could be interpreted as instructions.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Discord message polling | Custom WebSocket or REST poll loop | `channel.messages.fetch({ after })` | discord.js handles rate limits, caching, pagination [VERIFIED: Context7] |
| Discord reaction handling | Raw gateway event parsing | `client.on('messageReactionAdd')` | discord.js provides `reaction.emoji.id`, `reaction.message` |
| Cron scheduling | `setInterval` or ad-hoc `node-cron.schedule()` | Registry pattern via `registry.ts` | Single ownership, overlap guards, jitter [VERIFIED: packages/scheduler/src/registry.ts] |
| Browser page rendering | New headless browser instance | `packages/browser` singleton + `fetchViaBrowser` | Shared 2-tab queue, media-off, RAM-capped [VERIFIED: packages/browser/src/queue.ts] |
| Taste rule storage | New collection or file | `taste_rules` collection (already in schema) | Already defined with `{ kind, rule, weight, created_at }` [VERIFIED: packages/db-hot/src/schema.ts:194-207] |
| Reminder computation | Custom date math | `deadlines.event_start` / `deadlines.apply_by` with simple subtraction | Already ISO datetime in schema; no timezone ambiguity [VERIFIED: packages/db-hot/src/schema.ts:55-62] |

**Key insight:** Every capability in Phase 6 plugs into an existing integration point — the scheduler registry, the orchestrator drain, the router service, or the rule-pack builder. The codebase was designed for this extension.

## Common Pitfalls

### Pitfall 1: Missing GuildMessageReactions Intent
**What goes wrong:** Bot doesn't receive `messageReactionAdd` events; bookmarks silently fail.
**Why it happens:** `GatewayIntentBits.GuildMessageReactions` (value 1024) is not in the client's intent array.
**How to avoid:** Add `GatewayIntentBits.GuildMessageReactions` to the gateway client intents in `packages/discord-router/src/gateway.ts`. Also ensure `Partials.Reaction` is in partials (already present).
**Warning signs:** No reaction events in logs; bookmark feature appears dead.
[VERIFIED: Context7 /websites/discord_js_packages_discord_js_14_25_1 — GatewayIntentBits.GuildMessageReactions = 1024]

### Pitfall 2: Reaction on Uncached Message
**What goes wrong:** `reaction.message` is a partial; fetching full message fails or returns incomplete data.
**Why it happens:** The message isn't in the client's cache when the reaction arrives.
**How to avoid:** Use `Partials.Reaction` (already in gateway.ts) and handle partial messages by fetching: `if (reaction.message.partial) await reaction.message.fetch();`
**Warning signs:** `reaction.message.content` is null or undefined.
[VERIFIED: packages/discord-router/src/gateway.ts:20 — Partials.Reaction already present]

### Pitfall 3: Taste Rule BLOCK Bypassing Hard Compliance Gates
**What goes wrong:** A taste BLOCK rule accidentally overrides a hard compliance gate (e.g., blocking a legitimate unpaid fellowship).
**Why it happens:** Precedence logic doesn't distinguish between soft gates (which taste BLOCK can override) and hard gates (which it cannot).
**How to avoid:** Implement D-13 precedence: taste BLOCK checked before soft/personal gates but AFTER hard compliance gates (2+yr roles, unpaid non-fellowships, pay-to-training, US/EU-only swag).
**Warning signs:** Legitimate fellowships or free-tier perks being blocked by taste rules.

### Pitfall 4: TBA Re-Audit Infinite Loop
**What goes wrong:** TBA rows keep getting re-audited every 48h forever, even after the event has passed.
**Why it happens:** No terminal condition for the TBA loop — event date passes but row stays TBA.
**How to avoid:** Ping #2 must fire when: (a) prize/date confirmed (tba→false), or (b) event date passes (tba→false, status→expired). The loop terminates on either condition.
**Warning signs:** TBA rows accumulating in PB without resolution.

### Pitfall 5: Social Polling Rate-Limit Ban
**What goes wrong:** X/LinkedIn detects automated polling and bans the burner account.
**Why it happens:** No jitter or too-aggressive polling cadence.
**How to avoid:** Enforce D-08: 30–90s jitter between requests, max 5 actions per tick. Use `kelektiv/node-cron` `maxRandomDelay` for inter-tick jitter.
**Warning signs:** Cookie session expiring; HTTP 429 responses.

### Pitfall 6: Reminder Double-Firing
**What goes wrong:** The same reminder fires multiple times across ticks.
**Why it happens:** The `sent` flag isn't updated atomically or the filter doesn't check it correctly.
**How to avoid:** Update `reminders[].sent = true` immediately after posting; use PB filter `reminders.sent = false` to exclude already-sent.
**Warning signs:** Duplicate reminder posts in Discord.

### Pitfall 7: Local Domain Crawl Missing Bio-Link Events
**What goes wrong:** Events listed only on bio-link pages (JS-rendered) are missed by plain fetch.
**Why it happens:** Bio-link pages require JavaScript execution to render content.
**How to avoid:** Use `fetchViaBrowser` from `packages/browser` for bio-link page polling (D-03). The shared Playwright singleton handles rendering.
**Warning signs:** Bio-link events absent from local pipeline results.

### Pitfall 8: Relay Missing Messages Between Ticks
**What goes wrong:** Announcements posted while the bot was offline are never relayed.
**Why it happens:** The `after` cursor isn't persisted or is reset on restart.
**How to avoid:** Store the last relayed message ID in PB (or a state file). On restart, fetch from the last known ID, not from "now".
**Warning signs:** Gaps in relayed announcements after bot restarts.

### Pitfall 9: Taste Rule Confirmation Reply in Wrong Channel
**What goes wrong:** Confirmation reply goes to DM instead of #🧠-bot-training-chat.
**Why it happens:** Reply is sent to `msg.author` instead of the channel where the rule was submitted.
**How to avoid:** Always post confirmation in the originating channel (`msg.channel`), not as a DM.
**Warning signs:** Operator doesn't see confirmation; thinks rule wasn't created.

### Pitfall 10: New Scheduler Jobs Not Registered in Registry
**What goes wrong:** New poll jobs (local, social, relay, reminder) exist in job defs but never fire.
**Why it happens:** They're not registered through `startRegistry()` or the relevant `register*()` function.
**How to avoid:** Add new job definitions to the appropriate `*_JOBS` array in `jobs.ts` and ensure the corresponding `register*()` function is called at boot.
**Warning signs:** Jobs defined in STUB_JOBS/JOB_POLL_JOBS but no tick heartbeats appear.

## Code Examples

### Example 1: Custom Emoji Reaction Handling (UI-02)
```typescript
// Source: Context7 /websites/discord_js_packages_discord_js_14_25_1
client.on('messageReactionAdd', async (reaction, user) => {
  if (user.bot) return;
  
  // Handle partial messages (reaction on uncached message)
  if (reaction.message.partial) {
    try { await reaction.message.fetch(); } catch { return; }
  }
  
  // Check for custom bookmark emoji by ID
  if (reaction.emoji.id === env.BOOKMARK_EMOJI_ID) {
    // ... bookmark logic
  }
});
```
[VERIFIED: Context7 /websites/discord_js_packages_discord_js_14_25_1 — messageReactionAdd event, partial message handling]

### Example 2: Message Polling with Cursor (ING-04)
```typescript
// Source: Context7 /websites/discord_js_packages_discord_js_14_25_1
// Fetch messages after a specific message ID (cursor-based pagination)
const messages = await channel.messages.fetch({ 
  limit: 20, 
  after: lastMessageId // Snowflake — consider only messages after this id
});
```
[VERIFIED: Context7 /websites/discord_js_packages_discord_js_14_25_1 — FetchMessagesOptions.after]

### Example 3: Sending Messages to a Channel (ING-04, MEM-04)
```typescript
// Source: Context7 /websites/discord_js_packages_discord_js_14_25_1
await channel.send('hello!');
// Or with embeds:
await channel.send({ embeds: [embed] });
```
[VERIFIED: Context7 /websites/discord_js_packages_discord_js_14_25_1 — BaseGuildTextChannel.send()]

### Example 4: Channel Resolution for New Buckets (EVT-03, EVT-04, ING-04)
```typescript
// Extend CHANNEL_ID_ENV_KEYS in router-service.ts for new buckets
const CHANNEL_ID_ENV_KEYS: Record<string, keyof Env> = {
  // ... existing three ...
  '#📍-local-dk-udupi': 'DISCORD_CHANNEL_LOCAL',
  '#✈️-travel-curated': 'DISCORD_CHANNEL_TRAVEL',
  '#⏳-early-tba-radar': 'DISCORD_CHANNEL_TBA',
  '#raw-incoming-feeds': 'DISCORD_CHANNEL_RELAY',
  '#🧠-bot-training-chat': 'DISCORD_CHANNEL_TRAINING',
};
```
[VERIFIED: packages/discord-router/src/router-service.ts:134-138 — existing pattern to extend]

### Example 5: Taste Rule Schema Extension (MEM-04)
```typescript
// Current schema (packages/db-hot/src/schema.ts:194-207):
export const TasteRule = z.object({
  kind: z.string().min(1),
  rule: z.string().min(1),
  weight: z.number().default(1.0),
  created_at: z.iso.datetime().default(() => new Date().toISOString()),
});

// Phase 6 extension (D-12 discretion — add fields as needed):
// export const TasteRule = z.object({
//   kind: z.enum(['BLOCK', 'BOOST', 'WEIGHT', 'CUSTOM']),
//   rule: z.string().min(1),
//   weight: z.number().default(1.0),
//   source: z.string().default(''),  // 'reaction' | 'keyword' | 'dm'
//   created_at: z.iso.datetime().default(() => new Date().toISOString()),
// });
```
[VERIFIED: packages/db-hot/src/schema.ts:194-207 — current TasteRule schema]

### Example 6: Reminder Computation (UI-02, D-06)
```typescript
function computeReminders(deadlines: OpportunityDeadlines, channel: string): OpportunityReminder[] {
  const reminders: OpportunityReminder[] = [];
  const anchor = deadlines.event_start ?? deadlines.apply_by;
  if (!anchor) return reminders;
  
  const anchorDate = new Date(anchor);
  
  // 48h reminder
  const r48 = new Date(anchorDate.getTime() - 48 * 60 * 60 * 1000);
  if (r48 > new Date()) {
    reminders.push({ at: r48.toISOString(), channel, sent: false });
  }
  
  // 24h reminder
  const r24 = new Date(anchorDate.getTime() - 24 * 60 * 60 * 1000);
  if (r24 > new Date()) {
    reminders.push({ at: r24.toISOString(), channel, sent: false });
  }
  
  return reminders;
}
```
[VERIFIED: packages/db-hot/src/schema.ts:64-69 — OpportunityReminder shape]

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Unicode 📌 for bookmarks | Custom server emoji (D-05) | Phase 6 decision | Consistent rendering across all Discord clients |
| Separate cron job for TBA | Reuse audit-drain scan (D-10) | Phase 6 decision | No new scheduler job; simpler ops |
| Gateway listener for relay | Polling timer for relay (D-04) | Phase 6 decision | No cross-guild bot membership needed |
| Single taste-rule ingestion path | Three paths: reaction + keyword + DM (D-11) | Phase 6 decision | More flexible operator feedback |
| Flat taste-rule application | Hybrid: BLOCK pre-scoring + BOOST prompt injection (D-12) | Phase 6 decision | Saves LLM quota; advisory not authoritative |

## Assumptions Log

> List all claims tagged `[ASSUMED]` in this research. The planner and discuss-phase use this
> section to identify decisions that need user confirmation before execution.

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | X/LinkedIn cookie export format is JSON array of cookie objects | ING-05 / Social Polling | If format differs, cookie parsing fails; may need browser extension export format adaptation |
| A2 | External Discord #announcements channel ID is known and stable | ING-04 / Relay | If channel ID changes, relay breaks; needs env configuration |
| A3 | Custom bookmark emoji will be created on the server before bot deployment | UI-02 / Bookmark | If emoji doesn't exist, reaction handler can't match by ID |
| A4 | `messageReactionAdd` fires for custom guild emoji with `emoji.id` set | UI-02 / Bookmark | If discord.js partials don't include emoji ID, matching by name fallback needed |
| A5 | Local college websites have parseable event listings (HTML or API) | ING-02 / Local | If sites use non-standard rendering, cheerio selectors may need per-domain customization |
| A6 | Bio-link pages are reachable from local domain listings | ING-02 / Local | If bio-links require login, browser polling won't help |

**If this table is empty:** All claims in this research were verified or cited — no user confirmation needed.

## Open Questions (RESOLVED)

1. **Relay poll cadence (D-04 discretion)** — RESOLVED: Default to 15m + 5m jitter (matches events cadence; relay is low-volume).
2. **Taste rule schema extension (D-12 discretion)** — RESOLVED: Add `source` field for observability; keep `kind` as string (not enum) to allow future rule types without migration.
3. **Bio-link change detection (discretion)** — RESOLVED: Track known bio-link URLs in a local state; new URLs = new opportunities. Re-poll known URLs for content changes every tick.
4. **Reminder tick cadence (discretion)** — RESOLVED: Every 15m + 5m jitter (same as events cadence; reminders are time-sensitive but not second-critical).

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| discord.js v14 | All Discord features | ✓ (in stack) | ^14.25.1 | — |
| kelektiv/node-cron | All scheduling | ✓ (in stack) | ^4 | — |
| playwright-core | Bio-link polling | ✓ (in stack) | ^1.55–1.63 | — |
| PocketBase | Data storage | ✓ (in stack) | v0.40.5 | — |
| Node.js 22 | Runtime | ✓ (in stack) | 22.x | — |
| Custom bookmark emoji | Bookmark feature (UI-02) | ✗ | — | Planner must include emoji creation in Wave 0 |
| X/LinkedIn burner cookies | Social polling (ING-05) | ✗ | — | Planner must include cookie export step in Wave 0 |
| External #announcements channel | Relay (ING-04) | ✗ | — | Bot must be member of external guild OR use polling (D-04) |

**Missing dependencies with no fallback:**
- Custom bookmark emoji (must be created on server before bot deployment)
- X/LinkedIn burner cookies (must be exported from burner browser session)

**Missing dependencies with fallback:**
- External #announcements channel access — D-04 polling approach means bot doesn't need to be in the external guild

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | vitest ^3 |
| Config file | vitest.config.ts (per-package) |
| Quick run command | `pnpm vitest run --filter <package>` |
| Full suite command | `pnpm vitest run` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| ING-02 | Local domains crawl produces candidates | unit | `pnpm vitest run --filter @zod/discord-router -t "local source"` | ❌ Wave 0 |
| ING-04 | Relay polls and forwards messages | unit | `pnpm vitest run --filter @zod/discord-router -t "relay"` | ❌ Wave 0 |
| ING-05 | Social source produces candidates with pacing | unit | `pnpm vitest run --filter @zod/discord-router -t "social source"` | ❌ Wave 0 |
| EVT-03 | Local events route to #📍-local-dk-udupi | unit | `pnpm vitest run --filter @zod/orchestrator -t "local routing"` | ❌ Wave 0 |
| EVT-04 | Out-of-town events with selection route to #✈️-travel-curated | unit | `pnpm vitest run --filter @zod/orchestrator -t "travel routing"` | ❌ Wave 0 |
| EVT-06 | TBA events fire Ping #1 and re-audit | unit | `pnpm vitest run --filter @zod/orchestrator -t "tba loop"` | ❌ Wave 0 |
| UI-02 | Bookmark reaction sets bookmark + arms reminders | unit | `pnpm vitest run --filter @zod/discord-router -t "bookmark"` | ❌ Wave 0 |
| UI-02 | Reminder ticker fires 48h/24h reminders | unit | `pnpm vitest run --filter @zod/discord-router -t "reminder"` | ❌ Wave 0 |
| MEM-04 | Taste rule ingestion (3 paths) | unit | `pnpm vitest run --filter @zod/discord-router -t "taste ingest"` | ❌ Wave 0 |
| MEM-04 | Taste rule application (BLOCK pre-scoring, BOOST injection) | unit | `pnpm vitest run --filter @zod/orchestrator -t "taste apply"` | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `pnpm vitest run --filter <package>` (quick, <30s)
- **Per wave merge:** `pnpm vitest run` (full suite)
- **Phase gate:** Full suite green before `/gsd-verify-work`

### Wave 0 Gaps
- [ ] `packages/discord-router/src/portals/local.test.ts` — covers ING-02, EVT-03
- [ ] `packages/discord-router/src/portals/social.test.ts` — covers ING-05
- [ ] `packages/discord-router/src/relay.test.ts` — covers ING-04
- [ ] `packages/discord-router/src/bookmark.test.ts` — covers UI-02
- [ ] `packages/discord-router/src/reminder.test.ts` — covers UI-02
- [ ] `packages/discord-router/src/taste-ingest.test.ts` — covers MEM-04
- [ ] `packages/orchestrator/src/tba-loop.test.ts` — covers EVT-06
- [ ] `packages/orchestrator/src/taste-apply.test.ts` — covers MEM-04

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | No | Bot Gateway already handles auth via DISCORD_TOKEN |
| V3 Session Management | No | No user sessions in v1 |
| V4 Access Control | Yes | Taste rule precedence (D-13): BLOCK cannot override hard compliance gates |
| V5 Input Validation | Yes | zod validation on all new data (taste rules, local candidates, social candidates) |
| V6 Cryptography | No | No cryptographic operations in Phase 6 |

### Known Threat Patterns for discord.js + Playwright Stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Taste rule injection into LLM prompt | Tampering | Append to system prompt as advisory (D-12); LLM retains final judgment |
| Social polling cookie theft | Information Disclosure | Cookies stored on VM disk, never in git; file permissions restricted |
| Bio-link page XSS via browser | Tampering | Playwright runs headless with JS enabled; content sanitized before LLM |
| Relay message spoofing | Spoofing | Bot only relays from configured external channel; source channel ID is env-configured |
| Bookmark reaction forgery | Spoofing | Only reactions from non-bot users on audit card messages trigger bookmark |

## Sources

### Primary (HIGH confidence)
- Context7 `/websites/discord_js_packages_discord_js_14_25_1` — `messageReactionAdd` event, `reaction.emoji.id`, `channel.messages.fetch({ after })`, `channel.send()`, `GatewayIntentBits.GuildMessageReactions` (1024), `Partials.Reaction` [VERIFIED: Context7]
- `packages/db-hot/src/schema.ts` — PIPELINES, opportunities schema (reminders, bookmark, deadlines.tba), taste_rules schema, HOT_COLLECTIONS [VERIFIED: packages/db-hot/src/schema.ts:23-235]
- `packages/scheduler/src/jobs.ts` — CandidateSource interface, runStubTick pipeline, STUB_JOBS, JOB_POLL_JOBS, AUDIT_JOBS [VERIFIED: packages/scheduler/src/jobs.ts:77-206, 340-594]
- `packages/scheduler/src/registry.ts` — Single scheduler registry, registerStubJobs, registerPollJobs, registerAuditDrain [VERIFIED: packages/scheduler/src/registry.ts:1-300]
- `packages/discord-router/src/router-service.ts` — processOpportunity, resolveChannel, CHANNEL_ID_ENV_KEYS [VERIFIED: packages/discord-router/src/router-service.ts:1-186]
- `packages/discord-router/src/embed.ts` — buildAuditCard, fmtDeadlines (renders TBA flag) [VERIFIED: packages/discord-router/src/embed.ts:1-85]
- `packages/discord-router/src/gateway.ts` — Gateway client singleton, intents, partials [VERIFIED: packages/discord-router/src/gateway.ts:1-44]
- `packages/orchestrator/src/orchestrator.ts` — drainStep2Rows, processRow, processEventsRow, drainLootRow [VERIFIED: packages/orchestrator/src/orchestrator.ts:1-537]
- `packages/orchestrator/src/rule-packs/events.ts` — buildEventsMessages, EventsVerdictSchema [VERIFIED: packages/orchestrator/src/rule-packs/events.ts:1-93]
- `packages/config/src/env.ts` — EnvSchema, channel ID env keys [VERIFIED: packages/config/src/env.ts:1-37]
- `packages/browser/src/queue.ts` — fetchViaBrowser, shared singleton, tab queue [VERIFIED: packages/browser/src/queue.ts:1-95]

### Secondary (MEDIUM confidence)
- Context7 `/node-cron/node-cron` — `noOverlap`, `maxRandomDelay`, `timezone` options [VERIFIED: Context7]
- Context7 `/microsoft/playwright` — Page polling, `domcontentloaded` wait strategy [VERIFIED: Context7]

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all libraries already in stack; no new dependencies
- Architecture: HIGH — all integration points verified in existing codebase; patterns proven in Phases 2–5
- Pitfalls: HIGH — derived from existing codebase patterns + Context7 verified API surface

**Research date:** 2026-10-16
**Valid until:** 2026-11-16 (stable — no fast-moving dependencies)
