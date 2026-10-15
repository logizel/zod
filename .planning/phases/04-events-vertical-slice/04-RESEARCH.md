# Phase 4: Events Vertical Slice - Research

**Researched:** 2026-10-16
**Domain:** Discord Gateway bot + national-event-portal ingestion + Link-Hopper 2-hop resolution + audit-card routing
**Confidence:** MEDIUM (stack/API facts verified via Context7 + npm registry; portal listing shapes for several portals are third-party/assumed — see Assumptions Log)

## Summary

Phase 4 delivers the first end-to-end verified event alert in Discord: national-portal events (Unstop, Devfolio, Devpost, Luma, Meetup, CTFtime, CLIST.by) are polled every 15–30m, pass Scout pre-filter (expiry + spam, zero fetch), resolve through Link-Hopper to the official event domain within 2 hops via HTTP redirect following, receive an auditor verdict via the existing LlmRouter (429/413 baton-pass, length-stitch), and post as a structured Discord audit card to the right channel (Sys/CP/Sec → #🔥-priority-sys-cp-sec; online ≥₹1L verified cash → #💻-online-1lakh-plus; remaining → #📋-events-general catch-all).

Phase 4 is greenfield for Discord wiring: no discord.js gateway/intents/embeds code exists yet (`apps/bot/src/index.ts` is a skeleton), no `DISCORD_TOKEN` exists in `packages/config/src/env.ts`, and no Link-Hopper, 80/20 domain filter, prize-verification predicate, or Discord router service exists. Everything Phase 4 adds plugs into Phase 1–3 contracts (db-hot schemas, scratchpad STEP machine, LlmRouter, scheduler registry, sanitize pipeline, shared browser).

**Primary recommendation:** Scaffold a new `@zod/discord-router` package (gateway bot + router service), add `DISCORD_TOKEN` to the fail-fast env schema, register 7 staggered portal-poll cron jobs through the single scheduler registry, build the Link-Hopper as native-fetch redirect following (max 2 hops), and route `status='audited'` opportunities to Discord embeds via a dedicated poller that flips status to `routed`.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** Wire all 7 national portals (Unstop, Devfolio, Devpost, Luma, Meetup, CTFtime, CLIST.by) at once with a dedicated parser per portal for the 15–30m poll. — Reversibility: costly — undo touches every portal adapter plus the poll scheduler wiring.
- **D-02:** Stagger the 7 portals' polls across the 15–30m window rather than firing all simultaneously. — Reversibility: reversible — changes scheduler cron offsets only.
- **D-03:** Portal adapter emits title+snippet from an RSS/JSON listing first; Scout pre-filter runs on that (zero fetch); full fetch happens only for survivors. — Reversibility: costly — undo reworks every adapter's fetch contract.
- **D-04:** Link-Hopper resolves aggregator→official domain BEFORE the auditor posts its verdict. — Reversibility: costly — undo moves resolution after the auditor and reworks the STEP machine ordering.
- **D-05:** A "hop" is resolved via HTTP redirect following (hop 1 = aggregator/social page, hop 2 = official event domain), not browser rendering. — Reversibility: reversible — contained in the Link-Hopper module.
- **D-06:** A candidate that fails to resolve to an official domain within 2 hops is tombstoned as `link_hop_failed` and skipped. — Reversibility: reversible — undo changes the terminal_status written to tombstone_ledger.
- **D-07:** Remaining verified events (beyond #🔥-priority-sys-cp-sec and #💻-online-1lakh-plus) route to a catch-all #📋-events-general channel in Phase 4; other 10-matrix channels (local, travel, TBA, loot, jobs) deferred to Phase 5/6. — Reversibility: reversible — channel list is config.
- **D-08:** The Discord audit card is a structured embed per UI-01: title, organizer, dates, prize breakdown (cash vs credits stripped), merged links [official + aggregator], 1-line audit from `audit_summary`. — Reversibility: reversible — embed field set lives in the router service.
- **D-09:** Audit cards are posted by a dedicated Discord router service that polls opportunities with `status='audited'` + `bucket_channel`, posts the embed, then marks `status='routed'`. — Reversibility: costly — undo merges posting back into the auditor/curator and reworks retry handling for failed posts.
- **D-10:** "Verified liquid cash ≥₹1L" requires explicit INR stated on the portal; credits/vouchers/certificates are stripped; `prize_cash_inr` null (TBA/unverified) does not qualify. — Reversibility: reversible — changes the prize-parsing predicate only.
- **D-11:** The 80/20 domain filter runs BEFORE the auditor as a cheap pre-filter: admit all SWE domains, adjacent deep-tech only at organizer≥9 AND agenda≥9, reject non-technical business. — Reversibility: reversible — changes pre-filter ordering and scoring predicate.

### the agent's Discretion
No "you decide" selections — the user chose a concrete option for every area discussed. Researcher/planner have flexibility on: exact per-portal parser implementation (RSS vs JSON shape per portal), exact cheerio strip selector list, stagger interval math within the 15–30m window, exact 80/20 scoring formula (thresholds organizer≥9 / agenda≥9 are locked), Discord embed styling/colors, and the router service poll interval — as long as the locked decisions above and the Phase 4 success criteria hold.

### Deferred Ideas (OUT OF SCOPE)
None — discussion stayed within phase scope. No scope creep raised; no todos folded (todo match count 0).
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| ING-01 | System polls structured event portals (Unstop, Devfolio, Devpost, Luma, Meetup, CTFtime, CLIST.by) via JSON APIs/RSS first every 15–30 minutes | Portal listing-shape research (CTFtime/CLIST.by official free JSON APIs; others lack free official APIs — see Standard Stack & Assumptions Log); scheduler cron registration pattern (kelektiv/node-cron verified via Context7) |
| SWM-02 | Link-Hopper resolves aggregator/social cards to official event domain or direct ATS link within max 2 hops | Node.js native `fetch` redirect-following research (`response.url` = final URL, `redirect: 'manual'` to count hops — MDN/Fetch Standard verified via web search) |
| EVT-01 | Sys/CP/Sec (systems, competitive programming, CTF/InfoSec) events fast-track to #🔥-priority-sys-cp-sec after legitimacy check | Discord router channel-mapping decision D-07/D-08; discord.js EmbedBuilder/TextChannel.send verified via Context7 |
| EVT-02 | 80/20 domain filter admits all SWE domains, adjacent deep-tech only at organizer≥9 and agenda≥9, rejects non-technical business events | Locked decision D-11 (pre-filter before auditor, before any LLM spend) |
| EVT-05 | Online events require verified liquid cash ≥₹1,00,000 INR (credits/vouchers/certificates stripped) to reach #💻-online-1lakh-plus | Locked decision D-10 (explicit INR; `prize_cash_inr` null does not qualify) |
| UI-01 | Discord router posts audit cards (title, organizer, dates, mode, prize breakdown, merged links, 1-line audit) | Discord.js v14 gateway/intents/embeds verified via Context7 (`/websites/discord_js_packages_discord_js_14_25_1`); PocketBase query/update verified via Context7 (`/pocketbase/js-sdk`) |
</phase_requirements>

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Portal listing ingestion (title + snippet) | API / Backend | — | Adapters run on the scheduler VM, poll portals server-side (RSS/JSON first, headless fallback) |
| Scout pre-filter (expiry + spam, zero fetch) | API / Backend | — | Pure function, runs before any scrape; already shipped in Phase 2 |
| Link-Hopper 2-hop redirect resolution | API / Backend | — | HTTP redirect following on the VM; no shared-browser tab cost (D-05) |
| 80/20 domain filter | API / Backend | — | Cheap pre-filter before the auditor (D-11), keeps non-technical business out before LLM spend |
| Prize verification (verified liquid cash ≥₹1L INR) | API / Backend | — | Code predicate on `prize_cash_inr` + auditor evidence quote (D-10) |
| LLM auditor verdict (baton-pass, length-stitch) | API / Backend | LlmRouter (`packages/llm`) | Reuses Phase 3 router; priority lane Auditor |
| Discord audit card posting | API / Backend | Discord service (gateway) | Dedicated router service polls `status='audited'` + `bucket_channel` (D-09) |
| Status transitions (audited → routed) | Database/Storage | API / Backend | PocketBase write via JS SDK (`update(id, {status: 'routed'})`) |
| Shared browser fallback (portals without APIs) | API / Backend | Browser/Client | Existing `packages/browser` singleton, max 2–3 tabs, media off |

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| discord.js | `^14.25.1` (v14 line; latest 14.27.0 per npm) | Discord Gateway bot: client, intents, partials, EmbedBuilder audit cards, channel send | Locked stack (AGENTS.md); v14 is the stable documented line with `GatewayIntentBits` + `Partials` + `EmbedBuilder`. Legitimacy OK via package-legitimacy seam (1.3M weekly downloads, repo github.com/discordjs/discord.js, not deprecated). [CITED: discord.js.org/docs/packages/discord.js/14.25.1] [VERIFIED: npm registry] |
| pocketbase (JS SDK) | `^0.28.1` installed; server `v0.35.x` | Hot DB: opportunities collection, status transitions (`audited` → `routed`), agent_telemetry | Already a dependency (`packages/db-hot` uses it); `createPbClient` + `AsyncAuthStore` pattern established in Phase 1. [CITED: pocketbase js-sdk README via Context7] [VERIFIED: npm registry (0.28.1 installed)] |
| zod | `^4` (installed 4.6.7) | Runtime validation of portal listings, env schema, audit-card fields | Single validation toolchain; `z.infer<>` types free. [CITED: colinhacks/zod v4 docs via Context7] [VERIFIED: npm registry] |
| kelektiv/node-cron | `^4` (installed 4.6.0) | Scheduler cron for 7 staggered portal-poll jobs | Single scheduler registry already owns every `cron.schedule()`; `noOverlap` + `maxRandomDelay` jitter + Asia/Kolkata guards. [CITED: kelektiv/node-cron v4 docs via Context7] [VERIFIED: npm registry] |
| pino | `^10` (installed 10.4.0) | Structured JSON logging; child loggers per pipeline | Fastest Node logger; raw JSON to stdout (journald-friendly); redacting logger covers secrets. [CITED: pinojs/pino v10 via Context7] [VERIFIED: npm registry] |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| eventsource | `^3` (installed 5.1.3) | `EventSource` polyfill for PocketBase realtime in Node | Always server-side; `global.EventSource = EventSource` before realtime calls (already in `packages/db-hot/src/client.ts`) |
| cheerio + turndown | `^1` / `^7.2` (installed) | HTML→markdown strip in sanitize pipeline | Reuse existing `packages/sanitize`; portal detail-page fallback scraping |
| playwright-core | `^1.55–1.64` (installed 1.64.1) | Shared headless browser fallback for portals without free APIs | Only when a portal lacks RSS/JSON; max 2–3 tabs, media off, via `packages/browser` singleton |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| discord.js v14 Gateway bot | discord.py / raw REST + WebSocket | Rejected: TS monorepo decision; raw REST reinvents sharding/reconnect; self-bot/user-token violates Discord ToS (ban risk) |
| kelektiv/node-cron + single registry | BullMQ + Redis / system cron | Rejected: zero-cost constraint (no Redis); system cron loses jitter/noOverlap ergonomics; scattered setInterval is prohibited |
| Jina Reader + shared browser | Crawl4AI self-hosted / Firecrawl cloud | Rejected: Crawl4AI only on Jina throttling evidence; Firecrawl is paid (violates zero-cost); Jina-first is the locked cost rule |

**Installation:**
```bash
pnpm add discord.js          # new package for Phase 4
# eventsource, pocketbase, zod, node-cron, pino, cheerio, turndown, playwright-core already present
```

**Version verification:** Before writing the Standard Stack table, each recommended package was verified against the npm registry:
- `discord.js` → 14.27.0 (published 2026-07-15, ~1.3M downloads/wk, repo github.com/discordjs/discord.js, not deprecated, no postinstall) — legitimacy OK [VERIFIED: npm registry]
- `pocketbase` → 0.28.1 installed [VERIFIED: npm registry]
- `zod` → 4.6.7 installed [VERIFIED: npm registry]
- `node-cron` (kelektiv) → 4.6.0 installed [VERIFIED: npm registry]

> Note on PocketBase SDK version: AGENTS.md/stack cites SDK `^0.30`, but `packages/db-hot/package.json` declares `pocketbase: ^0.28.1` and 0.28.1 is installed. Context7's js-sdk README lists v0.26.2. Treat `^0.30` as aspirational/unverified — pin to what builds (`^0.28.1`) unless the Phase 4 build proves otherwise. [ASSUMED]

## Package Legitimacy Audit

> Required whenever this phase installs external packages. The Package Legitimacy Gate was run before completing this section.

| Package | Registry | Age | Downloads | Source Repo | Verdict | Disposition |
|---------|----------|-----|-----------|-------------|---------|-------------|
| discord.js | npm | ~9+ yrs (published 2026-07-15 latest) | ~1.3M/wk | github.com/discordjs/discord.js | [OK] | Approved |

**Packages removed due to [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none

`discord.js` is the only new package Phase 4 installs. It passed the legitimacy gate (OK). All other Phase 4 dependencies (pocketbase, zod, node-cron, pino, cheerio, turndown, playwright-core, eventsource) are already installed and were approved in Phase 1.

## Architecture Patterns

### System Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         PHASE 4: EVENTS VERTICAL SLICE                      │
└─────────────────────────────────────────────────────────────────────────────┘

ENTRY (scheduler cron, Asia/Kolkata, staggered offsets)
     │
     ▼
┌──────────────────┐      ┌──────────────────┐      ┌──────────────────┐
│  Portal Adapter  │─────▶│   Scout Pre-filter│─────▶│   Link-Hopper    │
│  (7 portals,     │      │  (expiry+spam,    │      │  (2-hop HTTP     │
│   RSS/JSON first)│      │   zero fetch)     │      │   redirect follow)│
└──────────────────┘      └──────────────────┘      └──────────────────┘
         │                         │                         │
         │ (reject → tombstone)    │ (reject → tombstone)    │ (fail 2 hops → link_hop_failed)
         ▼                         ▼                         ▼
┌──────────────────┐      ┌──────────────────┐      ┌──────────────────┐
│  80/20 Domain    │─────▶│   Fetch + Sanitize│─────▶│   LlmRouter      │
│  Filter (pre-    │      │  (Jina-first,     │      │  Auditor (baton- │
│    auditor, D-11)│      │   browser fallback│      │   pass, stitch)  │
└──────────────────┘      └──────────────────┘      └──────────────────┘
         │ (reject non-tech)   │ (markdown ≤8k)              │ (UNVERIFIED → tombstone)
         ▼                       ▼                       ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  Prize verification (verified liquid cash ≥₹1L INR, credits stripped, D-10) │
└─────────────────────────────────────────────────────────────────────────────┘
         │
         ▼ (verdict → status='audited' + bucket_channel)
┌──────────────────┐      ┌──────────────────┐      ┌──────────────────┐
│   Discord Router │─────▶│  discord.js      │─────▶│  Discord Channel │
│  (polls PB       │      │  EmbedBuilder    │      │  #🔥-priority-   │
│   status='audited'│     │  audit card      │      │  #💻-online-...  │
│   + bucket_channel│      │  → TextChannel.send│   │  #📋-events-general│
└──────────────────┘      └──────────────────┘      └──────────────────┘
         │
         ▼ (posted)
┌─────────────────────────────────────────────────────────────────────────────┐
│  Mark status='routed' (PocketBase update) — single Discord writer (D-09)   │
└─────────────────────────────────────────────────────────────────────────────┘

Decision points: Scout reject / Link-Hopper fail / 80/20 reject / prize gate
   → tombstone_ledger (never re-audit). Entry point: scheduler cron ticks.
External dependencies: PocketBase (hot), Turso (cold tombstones), Discord Gateway,
Jina Reader + shared Playwright browser (fallback), LLM ladder (Groq→GitHub→SambaNova).
```

### Recommended Project Structure

```
packages/
├── discord-router/          # NEW — Discord gateway bot + router service
│   ├── src/index.ts         # entry: parseEnv → discord.js Client login → gateway
│   ├── src/gateway.ts       # Client with GatewayIntentBits + Partials, ready event
│   ├── src/router-service.ts# polls PB status='audited'+bucket_channel, posts embed, marks routed
│   ├── src/embed.ts         # EmbedBuilder audit card per UI-01 (title/organizer/dates/prize/links/audit_summary)
│   ├── src/link-hop.ts      # NEW — 2-hop HTTP redirect following (max 2 hops, native fetch)
│   ├── src/domain-filter.ts # NEW — 80/20 pre-filter (SWE / deep-tech organizer≥9 & agenda≥9 / reject)
│   ├── src/prize-gate.ts    # NEW — verified liquid cash ≥₹1L INR predicate (credits stripped)
│   ├── src/portals/         # ONE adapter per portal (7 total): unstop, devfolio, devpost, luma, meetup, ctf, clist
│   ├── package.json         # @zod/discord-router, dep: discord.js
│   ├── tsconfig.json        # copy from packages/scheduler
│   └── vitest.config.ts     # copy from packages/scheduler
├── scheduler/               # EXISTING — register 7 portal-poll cron jobs in single registry
│   └── src/jobs.ts          # extend STUB_JOBS / POLL_CANDIDATES with real portal adapters
├── config/                  # EXISTING — add DISCORD_TOKEN to env schema + REDACT_PATHS
│   └── src/env.ts
├── scout/                   # EXISTING — prefilter (reuse)
├── sanitize/                # EXISTING — fetch Jina-first + browser fallback (reuse)
├── browser/                 # EXISTING — shared singleton fetchViaBrowser (reuse)
├── db-hot/                  # EXISTING — schema + scratchpad (reuse; writes audited/routed)
└── llm/                     # EXISTING — LlmRouter auditor (reuse)
apps/
├── bot/                     # EXISTING skeleton — gateway wiring lands here OR in discord-router package
└── scheduler/               # EXISTING — registry start entry
```

### Pattern 1: Dedicated Discord Router Service (single writer)

**What:** A long-lived process that polls PocketBase for `opportunities` where `status = 'audited'` && `bucket_channel` is set, builds a discord.js `EmbedBuilder` audit card per UI-01, sends it to the resolved text channel, then `pb.collection('opportunities').update(id, { status: 'routed' })`. Failed posts are retried via the scratchpad `recordFailure` (5 retries → tombstone) so the auditor never blocks on Discord.

**When to use:** Any verified opportunity ready for Discord delivery (Phase 4: events only).

**Example:**
```typescript
// Source: discord.js v14 docs (EmbedBuilder, Client, TextChannel) — Context7 /websites/discord_js_packages_discord_js_14_25_1
// Source: PocketBase JS SDK getList/update — Context7 /pocketbase/js-sdk
import { Client, GatewayIntentBits, Partials, EmbedBuilder } from 'discord.js';
import { env } from '@zod/config';
import { createPbClient } from '@zod/db-hot/client';

const client = new Client({
  intents: [GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent], // MessageContent is PRIVILEGED — enable in Discord dev portal
  partials: [Partials.Message, Partials.Reaction, Partials.Channel],
});

const embed = new EmbedBuilder()
  .setTitle(opportunity.title)
  .addFields(
    { name: 'Organizer', value: opportunity.organizer },
    { name: 'Dates', value: formatDeadlines(opportunity.deadlines) },
    { name: 'Prize (cash)', value: opportunity.prize_text }, // credits already stripped
    { name: 'Links', value: `[Official](${opportunity.links.official}) | [Aggregator](${opportunity.links.aggregator})` },
    { name: 'Audit', value: opportunity.audit_summary },
  )
  .setColor(0x00AA00)
  .setTimestamp();

const channel = await client.channels.fetch(opportunity.bucket_channel) as TextChannel;
await channel.send({ embeds: [embed] });
await pb.collection('opportunities').update(opportunity.id, { status: 'routed' });
```

### Pattern 2: Link-Hopper 2-Hop via Native Fetch (no browser)

**What:** Resolve aggregator → official domain within 2 hops using HTTP redirect following, not browser rendering. `fetch(url, { redirect: 'manual' })` returns the redirect response; read `response.headers.get('location')` for hop N+1, count hops, stop at 2. Final `response.url` (with `redirect: 'follow'`) is the resolved official domain.

**When to use:** Every candidate before the auditor posts its verdict (D-04/D-05). Tombstone as `link_hop_failed` if no official domain within 2 hops (D-06).

**Example:**
```typescript
// Source: MDN Fetch Standard — response.url = final URL after redirects; redirect: 'manual' to intercept Location header (web search)
async function resolveHops(url: string, maxHops = 2): Promise<{ finalUrl: string; hops: number; ok: boolean }> {
  let current = url;
  let hops = 0;
  while (hops < maxHops) {
    const res = await fetch(current, { redirect: 'manual' });
    if (res.redirected || res.status >= 300 && res.status < 400) {
      const loc = res.headers.get('location');
      if (!loc) break;
      current = new URL(loc, current).href;
      hops++;
      continue;
    }
    return { finalUrl: current, hops, ok: isOfficialDomain(current) };
  }
  return { finalUrl: current, hops, ok: false }; // → tombstone link_hop_failed
}
```

### Anti-Patterns to Avoid

- **Firing all 7 portal polls simultaneously:** Thundering-herd on the shared 2-tab browser + Jina rate limits; breaks the Oracle ARM 2.5GB RAM budget. Stagger cron offsets across the 15–30m window (D-02).
- **Fetching the full page before Scout pre-filter:** Wastes fetch budget on items Scout would reject. RSS/JSON listing → title+snippet → Scout → fetch only survivors (D-03).
- **Link-Hopper in the browser:** Consumes shared-browser tabs; HTTP redirect following is lighter and within the 2-hop budget (D-05).
- **Auditor posting to Discord directly:** Couples verdicts to delivery; failed posts can't be retried independently. Use the dedicated router service (D-09).
- **Counting `prize_cash_inr` null (TBA/unverified) as ≥₹1L:** Violates EVT-05; credit-inflated "₹5L prize" must not reach #💻-online-1lakh-plus (D-10).
- **Discord self-bot / user token:** Against Discord ToS; token-ban risk kills all alert channels. Bot Gateway only (AGENTS.md Compliance).
- **Scattered `setInterval` for portal polls:** Prohibited; all `cron.schedule()` goes through the single scheduler registry with `noOverlap` + jitter.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Discord gateway reconnect/sharding | Custom WebSocket to Discord Gateway | discord.js v14 `Client` + `GatewayIntentBits` | v14 handles sharding, reconnect, intent enums; raw REST re-invents this |
| HTTP redirect hop counting | Custom raw `http` redirect parser | Native `fetch({redirect:'manual'})` + `Location` header | Undici/fetch follows redirects; `response.url` gives final URL |
| PocketBase HTTP client | `fetch` against PB REST API directly | `pocketbase` JS SDK (`getList`/`update`/`authWithPassword`) | SDK handles auth store, filters, pagination; already a dependency |
| Scheduler for 7 portals | 7 `setInterval` calls | kelektiv/node-cron via single scheduler registry | `noOverlap` + jitter + Asia/Kolkata; registry owns every `cron.schedule()` |
| Env secret parsing | Manual `process.env` reads | zod `EnvSchema.parse()` fail-fast at entrypoint | `DISCORD_TOKEN` added here; missing key throws before any client constructs |
| Audit card layout | Hand-written Discord message JSON | `EmbedBuilder` (title, fields, color, footer, timestamp) | Structured embed per UI-01; field limits enforced (truncate, don't crash) |

**Key insight:** Custom solutions in this domain fail at the exact edge cases libraries already solve (Discord reconnect/intent semantics, redirect-hop semantics, PB auth-store persistence, cron overlap guards). Phase 4 composes existing Phase 1–3 packages rather than rebuilding them.

## Common Pitfalls

### Pitfall 1: Portals without free official APIs force headless-browser fallbacks
**What goes wrong:** Unstop, Devfolio, Devpost, Luma, and Meetup have no documented free official public RSS/JSON listing API (verified via web search — only third-party aggregators like brabble/parse.bot exist, requiring keys/payment; Luma needs paid Plus; Meetup needs OAuth GraphQL). If every portal assumes a JSON listing, the adapters break at runtime and fall onto the shared browser, burning the 2–3 tab budget.
**Why it happens:** Assuming "RSS/JSON first" means a free official API exists for every portal.
**How to avoid:** Design each adapter with a mode enum: `api` (CTFtime, CLIST.by — official free JSON) vs `scrape` (Unstop, Devfolio, Devpost, Luma, Meetup — headless browser via `packages/browser`). Document the per-portal mode in config. CTFtime (`ctftime.org/api`) and CLIST.by (`clist.by/api/v1/doc`) are confirmed free JSON endpoints [CITED: ctftime.org/api, clist.by/api/v1/doc]. [ASSUMED: exact listing shapes for Unstop/Devfolio/Devpost/Luma/Meetup]
**Warning signs:** Adapter returns HTML instead of JSON; browser tab count nears 3 during event poll; Jina rate-limit 429s on listing fetches.

### Pitfall 2: `MessageContent` intent is privileged and must be enabled in the Discord developer portal
**What goes wrong:** `client.login()` succeeds but the bot receives no message content / cannot read reactions, so bookmark reactions and audit-card interactions silently fail.
**Why it happens:** `GatewayIntentBits.MessageContent` (32768) is a privileged intent; discord.js does not enable it automatically.
**How to avoid:** Enable "Message Content Intent" in the Discord developer portal for the bot application before deployment; declare it in `intents` alongside `GuildMessages` (512). [CITED: discord.js.org/docs GatewayIntentBits.MessageContent = 32768]
**Warning signs:** Bot online but no message/reaction events fire; audit-card 📌 bookmarks not recorded.

### Pitfall 3: Counting `prize_cash_inr` null (TBA/unverified) as passing the ₹1L gate
**What goes wrong:** A credit-inflated "₹5L prize" (cloud credits + vouchers) or a TBA prize passes as verified liquid cash ≥₹1L and reaches #💻-online-1lakh-plus, violating EVT-05 and eroding channel trust.
**Why it happens:** Prize blocks are marketing copy; LLMs pattern-match "₹" + big number and stop reading; `prize_cash_inr` is null while TBA/unverified per schema.
**How to avoid:** Hard predicate: pass only if explicit INR liquid cash ≥1,00,000 is stated on the portal; strip credits/vouchers/certificates; `prize_cash_inr === null` does NOT qualify; require an evidence quote (page + quoted text) on the audit card — no quote, no PASS. [ASSUMED: exact prize-parsing regex; thresholds locked at ≥₹1L]
**Warning signs:** Audit cards whose prize quote mentions "credits", "worth", "up to", or sponsor names; high PASS rate on online events.

### Pitfall 4: Cron overlap stampede when a 15–30m poll overruns its interval
**What goes wrong:** A slow portal poll (headless page + LLM audit) takes longer than its interval; the next tick starts anyway, doubling browser tabs, LLM draw, and PB writes — an OOM/quota stampede.
**Why it happens:** Interval scheduling without mutual exclusion.
**How to avoid:** Rely on the existing single registry's `noOverlap: true` (execution:overlap → skip + telemetry counter). Track poll duration as a metric; alert when p95 > 70% of interval. [CITED: kelektiv/node-cron `noOverlap` + `execution:overlap` via Context7]
**Warning signs:** `skipped_overlapping_tick` counter > 0; duplicate alerts for the same item within minutes; browser RSS trending up.

### Pitfall 5: Secret leakage — `DISCORD_TOKEN` in code, logs, or git
**What goes wrong:** The Discord bot token is committed, logged via verbose HTTP output, or left in `.env`, letting anyone impersonate the alert system across all channels.
**Why it happens:** Greenfield speed — `.env` checked in temporarily, raw header dumps left on.
**How to avoid:** `DISCORD_TOKEN` is a required field in the fail-fast zod `EnvSchema` (env-only, never in code); extend `REDACT_PATHS` in `packages/logger/src/index.ts` with `DISCORD_TOKEN` and `authorization`; commit `.env.example` with placeholders only; real `.env` gitignored from day one. [CITED: pino REDACT_PATHS pattern; zod parse fail-fast]
**Warning signs:** Token visible in `git log`/telemetry/logs; no revocation runbook.

### Pitfall 6: SSRF / open-redirect through Link-Hopper redirect following
**What goes wrong:** Following `Location` headers blindly could redirect to private/loopback hosts or external attacker-controlled domains, exfiltrating data or hitting internal services.
**Why it happens:** Native `fetch` follows redirects; Link-Hopper re-fetches whatever `Location` points to.
**How to avoid:** Reuse the existing `validateUrl` SSRF guard (rejects private/loopback hosts, non-80/443 ports) on every hop target before following; cap at 2 hops; treat non-http(s) or private targets as `link_hop_failed`. [CITED: sanitize `validateUrl` SSRF guard — `packages/sanitize/src/fetch.ts`]
**Warning signs:** Hop target resolves to a private IP; redirect chain longer than 2 without termination.

### Pitfall 7: 80/20 filter placed after (or inside) the auditor instead of before
**What goes wrong:** Non-technical business events spend LLM tokens on auditor verdicts and could still reach a channel, violating EVT-02 and success criterion #5.
**Why it happens:** Coupling domain filtering to the LLM verdict rather than a cheap pre-filter.
**How to avoid:** Run the 80/20 domain filter immediately after Scout pre-filter and before any fetch/audit (D-11). Admit all SWE domains; adjacent deep-tech only at organizer≥9 AND agenda≥9; reject non-technical business outright. [ASSUMED: exact SWE-domain list and scoring formula; organizer≥9/agenda≥9 thresholds locked]
**Warning signs:** Non-technical events appearing in any Discord channel; auditor spend on clearly non-technical titles.

## Code Examples

Verified patterns from official sources:

### Discord.js v14 gateway client + privileged intents
```typescript
// Source: discord.js.org/docs/packages/discord.js/14.25.1 (Client, GatewayIntentBits, Partials) — Context7
import { Client, GatewayIntentBits, Partials } from 'discord.js';

// GuildMessages = 512; MessageContent = 32768 (PRIVILEGED — enable in Discord dev portal)
export const bot = new Client({
  intents: [GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent],
  partials: [Partials.Message, Partials.Reaction, Partials.Channel],
});

bot.login(env.DISCORD_TOKEN); // fail-fast: missing token throws at parseEnv
bot.on('ready', () => console.log(`Logged in as ${bot.user?.tag}`));
```

### PocketBase: poll audited opportunities + mark routed
```typescript
// Source: pocketbase js-sdk getList/update — Context7 /pocketbase/js-sdk
// Source: packages/db-hot/src/schema.ts (status 'audited'/'routed', bucket_channel) — read this session
import { createPbClient } from '@zod/db-hot/client';
import { env } from '@zod/config';

const pb = await createPbClient({ PB_URL: env.PB_URL, PB_SERVICE_EMAIL: env.PB_SERVICE_EMAIL, PB_SERVICE_PASSWORD: env.PB_SERVICE_PASSWORD });

const page = await pb.collection('opportunities').getList(1, 50, {
  sort: '-created',
  filter: `status = 'audited' && bucket_channel != ''`,
});
for (const opp of page.items) {
  // post Discord embed (router service), then:
  await pb.collection('opportunities').update(opp.id, { status: 'routed' });
}
```

### Link-Hopper 2-hop redirect following (native fetch, no browser)
```typescript
// Source: MDN Fetch Standard — response.url = final URL after redirects; redirect: 'manual' intercepts Location header (web search)
export async function resolveOfficialDomain(url: string, maxHops = 2): Promise<{ finalUrl: string; hops: number; ok: boolean }> {
  let current = url;
  let hops = 0;
  while (hops < maxHops) {
    const res = await fetch(current, { redirect: 'manual' });
    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get('location');
      if (!loc) break;
      current = new URL(loc, current).href;
      hops++;
      continue;
    }
    return { finalUrl: current, hops, ok: isOfficialDomain(current) };
  }
  return { finalUrl: current, hops, ok: false }; // → tombstone link_hop_failed
}
```

### EmbedBuilder audit card per UI-01
```typescript
// Source: discord.js.org/docs/packages/discord.js/14.25.1 (EmbedBuilder) — Context7
import { EmbedBuilder } from 'discord.js';

export function buildAuditCard(opp: Opportunity): EmbedBuilder {
  return new EmbedBuilder()
    .setTitle(opp.title)
    .addFields(
      { name: 'Organizer', value: opp.organizer, inline: true },
      { name: 'Dates', value: fmtDeadlines(opp.deadlines), inline: true },
      { name: 'Prize (liquid cash)', value: opp.prize_text || '—', inline: false },
      { name: 'Links', value: `[Official](${opp.links.official}) • [Aggregator](${opp.links.aggregator})`, inline: false },
      { name: 'Audit', value: opp.audit_summary, inline: false },
    )
    .setColor(0x00AA00)
    .setTimestamp();
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Stub poll (`POLL_CANDIDATES` static list) | Real portal adapters (7 national portals) | Phase 4 | First verified Discord alert; RSS/JSON-first listing |
| discord.js skeleton (no gateway) | discord.js v14 Gateway bot + EmbedBuilder | Phase 4 | Audit cards land in Discord with official source links |
| No Discord token in env | `DISCORD_TOKEN` in fail-fast zod schema | Phase 4 | Bot can construct; secret never logged |
| No Link-Hopper | 2-hop HTTP redirect following (native fetch) | Phase 4 | Aggregator→official domain before auditor verdict |

**Deprecated/outdated:**
- Original `node-cron` (unmaintained, no `noOverlap`/jitter): replaced by `kelektiv/node-cron ^4` (Phase 1 decision)
- discord.js v13: pre-`EmbedBuilder`, different intent enums; all tutorial code mismatches
- Cerebras as free Tier-1: always-free tier ended Jul 2026; disabled by default (Phase 3)

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | PocketBase SDK should be pinned to `^0.28.1` (installed), not `^0.30` cited in AGENTS.md | Standard Stack | Build/type errors if SDK API changed between 0.28.1 and 0.30 |
| A2 | CTFtime (`ctftime.org/api`) and CLIST.by (`clist.by/api/v1/json/...`) remain free, unauthenticated JSON endpoints with stable shapes | Standard Stack / Pitfalls | Adapter breaks if endpoints require keys or change shape |
| A3 | Unstop, Devfolio, Devpost, Luma, Meetup have no usable free official listing API → headless-browser scrape fallback | Standard Stack / Pitfalls | If a free API exists, scrape path is wasted effort; if scrape is blocked (WAF/CAPTCHA), ingestion stalls |
| A4 | Exact 80/20 scoring formula (SWE-domain list, deep-tech weighting) — thresholds organizer≥9 / agenda≥9 locked | Pitfalls / Standard Stack | Non-technical events leak or legit events rejected; needs labeled eval set |
| A5 | Exact per-portal parser implementation (RSS vs JSON shape) and cheerio strip selector list | Architecture Patterns | Adapter mismatch to portal markup; requires per-portal verification |
| A6 | Discord router service poll interval (discretion) | Architecture Patterns | Too slow → alert latency; too fast → PB read load (minor) |
| A7 | `prize_cash_inr` parsing predicate and evidence-quote requirement | Pitfalls | Credit-inflated prizes leak (trust damage) or legit cash events rejected |
| A8 | Node v26 (environment) is acceptable though AGENTS.md targets Node 22 LTS | Environment Availability | discord.js/Playwright compatibility on Node 26 unverified |

## Open Questions

1. **Portal listing-mode per source (api vs scrape):**
   - What we know: CTFtime + CLIST.by confirmed free JSON APIs; Unstop/Devfolio/Devpost/Luma/Meetup lack confirmed free official APIs.
   - What's unclear: exact listing endpoint shape for each scrape-mode portal; whether any have an undocumented public JSON feed.
   - Recommendation: Implement adapter mode enum; start scrape-mode portals with headless browser (shared singleton) and confirm shapes against live pages before finalizing selectors.

2. **Discord bot application & channel setup:**
   - What we know: `DISCORD_TOKEN` must be added to env; bot needs Message Content Intent (privileged) enabled in dev portal.
   - What's unclear: Discord application/client ID, guild ID, and channel IDs (or names to resolve) for #🔥-priority-sys-cp-sec, #💻-online-1lakh-plus, #📋-events-general.
   - Recommendation: Resolve channels by name at runtime via `client.channels.fetch` + name match; record IDs in config after the Discord app is created.

3. **Discord-router package location:**
   - What we know: `apps/bot/src/index.ts` is a skeleton; a new `@zod/discord-router` package is one option.
   - What's unclear: whether the router service lives in `apps/bot` or a new `packages/discord-router`.
   - Recommendation: New `@zod/discord-router` package (clean separation from scheduler); `apps/bot` can remain the gateway entry or host the router.

4. **80/20 SWE domain list:**
   - What we know: "admit all SWE domains" is locked (D-11) but the domain list isn't enumerated.
   - What's unclear: which domains count as SWE vs adjacent deep-tech vs non-technical business.
   - Recommendation: Define the SWE domain list in config; treat unknown organizer domains as deep-tech requiring organizer≥9 AND agenda≥9.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | Discord router + all packages | ✓ | v26.11.1 (engine >=22) | — |
| pnpm | Package installs (discord.js) | ✓ | 10.34.7 | npm |
| discord.js | Discord gateway bot + audit cards | ✗ | — | none (new install for Phase 4) |
| PocketBase server + SDK | Hot DB opportunities/status | ✓ (SDK installed 0.28.1; server binary separate) | SDK 0.28.1 | none |
| `eventsource` polyfill | PB realtime (if router subscribes) | ✓ | 5.1.3 | — |
| Playwright headless-shell | Portal scrape fallback (portals without APIs) | ✓ | 1.64.1 | Jina-only (skip JS-gated portals) |
| Jina API key (`JINA_API_KEY`) | Sanitize fetch | ✓ (in env schema) | — | shared browser fallback |
| Discord bot application/token | Discord router | ✗ | — | none (must create app + add DISCORD_TOKEN) |
| Cloudflare tunnel | Not required for Phase 4 pipelines | — | — | — (Discord is outbound-only) |

**Missing dependencies with no fallback:**
- `discord.js` package (not installed) — install via `pnpm add discord.js`
- `DISCORD_TOKEN` env var + Discord bot application — must be created in Discord developer portal; add to `.env` and env schema before the router constructs

**Missing dependencies with fallback:** none

Note: Node v26 is newer than the Node 22 LTS target in AGENTS.md. discord.js v14 and Playwright support Node >=18/>=20, so v26 should work, but this is unverified in this session [ASSUMED].

## Validation Architecture

> `workflow.nyquist_validation` is `true` in `.planning/config.json` (absent = enabled), so this section is included.

### Test Framework

| Property | Value |
|----------|-------|
| Framework | vitest `^3` (installed, root `pnpm test` = `vitest run`) |
| Config file | per-package `vitest.config.ts` (copy from `packages/scheduler`) |
| Quick run command | `pnpm run test -- --run src/<package>` (per-package) |
| Full suite command | `pnpm test` (root, all packages) |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| ING-01 | 7 portal adapters emit title+snippet; polls stagger across 15–30m | unit | `vitest run packages/discord-router/src/portals` | ❌ Wave 0 |
| SWM-02 | Link-Hopper resolves to official domain within 2 hops; tombstones `link_hop_failed` | unit | `vitest run packages/discord-router/src/link-hop.test.ts` | ❌ Wave 0 |
| EVT-01 | Sys/CP/Sec → #🔥-priority-sys-cp-sec after legitimacy check | unit | `vitest run packages/discord-router/src/domain-filter.test.ts` | ❌ Wave 0 |
| EVT-02 | 80/20 rejects non-technical business before auditor | unit | `vitest run packages/discord-router/src/domain-filter.test.ts` | ❌ Wave 0 |
| EVT-05 | Verified liquid cash ≥₹1L; credits stripped; null ≠ pass | unit | `vitest run packages/discord-router/src/prize-gate.test.ts` | ❌ Wave 0 |
| UI-01 | EmbedBuilder audit card with title/organizer/dates/prize/links/audit_summary | unit | `vitest run packages/discord-router/src/embed.test.ts` | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** quick run (affected package vitest)
- **Per wave merge:** full suite (`pnpm test`)
- **Phase gate:** Full suite green before `/gsd-verify-work`

### Wave 0 Gaps
- [ ] `packages/discord-router/` package scaffold (package.json, tsconfig, vitest.config)
- [ ] `packages/discord-router/src/link-hop.test.ts` — covers SWM-02
- [ ] `packages/discord-router/src/domain-filter.test.ts` — covers EVT-01/EVT-02
- [ ] `packages/discord-router/src/prize-gate.test.ts` — covers EVT-05
- [ ] `packages/discord-router/src/embed.test.ts` — covers UI-01
- [ ] `packages/discord-router/src/portals/` adapter tests — covers ING-01
- [ ] Framework install: `pnpm add discord.js`

## Security Domain

> `security_enforcement` is `true` in `.planning/config.json`; `security_asvs_level: 1`; `security_block_on: high`. Section included.

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | — (bot uses token, no user auth in Phase 4) |
| V3 Session Management | no | — |
| V4 Access Control | yes | Discord bot token is the sole auth; owner-only channels; no dashboard mutations (v1 read-only) |
| V5 Input Validation | yes | zod `EnvSchema.parse()` fail-fast; portal listings validated at adapter boundary; `validateUrl` SSRF guard on Link-Hopper hops |
| V6 Cryptography | no | — (no hand-rolled crypto; tokens from env only) |

### Known Threat Patterns for Discord/events stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Discord bot token leakage | Information Disclosure | Env-only secret, `DISCORD_TOKEN` in `REDACT_PATHS`, `.env` gitignored, `.env.example` placeholders |
| Self-bot / user-token Discord automation | Unauthorized Access | Bot Gateway only (discord.js), never user token [CITED: Discord self-bot ToS via PITFALLS.md] |
| Blind redirect following (Link-Hopper) | Tampering / SSRF | `validateUrl` SSRF guard per hop; max 2 hops; private/loopback targets → `link_hop_failed` [CITED: packages/sanitize/src/fetch.ts] |
| Credits counted as cash (prize gate) | Fraud | Explicit-INR predicate; `prize_cash_inr` null ≠ pass; evidence quote on card [D-10] |
| Non-technical events reach channel | Unauthorized Access | 80/20 pre-filter before auditor [D-11] |
| Cron overlap stampede | Denial of Service | `noOverlap: true` + `execution:overlap` skip in single registry |

## Sources

### Primary (HIGH confidence)
- `@opengsd/gsd-core` package-legitimacy seam — `discord.js` verdict OK (github.com/discordjs/discord.js, 1.3M/wk, not deprecated, no postinstall)
- npm registry — `discord.js` 14.27.0, `pocketbase` 0.28.1, `zod` 4.6.7, `kelektiv/node-cron` 4.6.0 versions
- `.planning/REQUIREMENTS.md` — requirement IDs ING-01/SWM-02/EVT-01/EVT-02/EVT-05/UI-01, traceability Phase 4
- `.planning/phases/04-events-vertical-slice/04-CONTEXT.md` — locked decisions D-01..D-11, phase boundary, deferred ideas
- `.planning/ROADMAP.md` §Phase 4 — goal, success criteria 1–5

### Secondary (MEDIUM confidence)
- Context7 `/websites/discord_js_packages_discord_js_14_25_1` — GatewayIntentBits (GuildMessages=512, MessageContent=32768), ClientOptions.intents/partials, EmbedBuilder, TextChannel.fetch/send [CITED: discord.js.org/docs/packages/discord.js/14.25.1]
- Context7 `/pocketbase/js-sdk` — getList filter, authWithPassword, AsyncAuthStore, eventsource polyfill, update(id, body) [CITED: github.com/pocketbase/js-sdk README + autodocs]
- Context7 `/colinhacks/zod` — z.object required-by-default, z.infer, .parse fail-fast [CITED: colinhacks/zod v4 docs]
- Context7 `/kelektiv/node-cron` — CronJob.from, timeZone/noOverlap/waitForCompletion [CITED: github.com/kelektiv/node-cron]
- MDN Fetch Standard — `response.url` final URL after redirects; `redirect: 'manual'` + Location header [CITED: developer.mozilla.org]
- `packages/sanitize/src/fetch.ts` — `validateUrl` SSRF guard (read this session) [VERIFIED: src/sanitize/src/fetch.ts:34-51]
- `packages/db-hot/src/schema.ts` — Opportunity schema, OPPORTUNITY_STATUSES, PIPELINES (read this session) [VERIFIED: src/db-hot/src/schema.ts:71-96]
- `packages/db-hot/src/scratchpad.ts` — getOrCreateScratchpad, advanceToStep2 (8k cap), recordFailure (5 retries), resumeByUrl (read this session) [VERIFIED: src/db-hot/src/scratchpad.ts:51-118]
- `packages/scheduler/src/registry.ts` — single registry, noOverlap, maxRandomDelay, Asia/Kolkata (read this session) [VERIFIED: src/scheduler/src/registry.ts]

### Tertiary (LOW confidence — marked for validation)
- Web search portal findings: brabble.ai GET /api/listings (third-party aggregator, bearer key), parse.bot search_hackathons (paid), Luma paid Plus API, Meetup OAuth GraphQL [ASSUMED — third-party/aggregator sources, not official portal docs]
- Portal listing shapes for Unstop/Devfolio/Devpost/Luma/Meetup [ASSUMED]
- Exact 80/20 SWE domain list and scoring formula [ASSUMED]
- discord.js/PocketBase/Playwright compatibility on Node v26 [ASSUMED]

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — versions verified against npm registry; discord.js legitimacy OK via seam
- Architecture: MEDIUM — reuses verified Phase 1–3 patterns; new Discord router + Link-Hopper are greenfield
- Pitfalls: HIGH — drawn from PITFALLS.md (official docs cited) + Context7-verified API semantics
- Portal shapes: LOW/MIXED — CTFtime/CLIST.by official APIs confirmed; others assumed third-party

**Research date:** 2026-10-16
**Valid until:** 30 days (stable stack); 7 days for portal API shapes and Discord free-tier details



