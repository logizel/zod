---
phase: 06-delivery-local-social-coverage
reviewed: 2026-10-17T00:00:00Z
depth: standard
files_reviewed: 16
files_reviewed_list:
  - packages/discord-router/src/portals/local.ts
  - packages/discord-router/src/portals/social.ts
  - packages/discord-router/src/relay.ts
  - packages/discord-router/src/bookmark.ts
  - packages/discord-router/src/reminder.ts
  - packages/discord-router/src/taste-ingest.ts
  - packages/orchestrator/src/tba-loop.ts
  - packages/orchestrator/src/taste-apply.ts
  - packages/orchestrator/src/rule-packs/local.ts
  - packages/orchestrator/src/orchestrator.ts
  - packages/discord-router/src/router-service.ts
  - packages/discord-router/src/gateway.ts
  - packages/scheduler/src/jobs.ts
  - apps/scheduler/src/registry-start.ts
  - packages/config/src/env.ts
  - packages/db-hot/src/schema.ts
findings:
  critical: 4
  warning: 6
  info: 5
  total: 15
status: issues_found
---

# Phase 06: Code Review Report

**Reviewed:** 2026-10-17T00:00:00Z
**Depth:** standard
**Files Reviewed:** 16
**Status:** issues_found

## Summary

Phase 06 delivers four plans of work: local/social ingestion (06-01), local/travel/TBA routing (06-02), bookmark + reminder delivery (06-03), and taste-rules feedback (06-04). The implementation largely follows the plan decisions (D-01 through D-13) and the established patterns (CandidateSource injection, zod schema boundaries, per-row error isolation, no setInterval scatter). Test coverage is strong for the new modules (15+ test files across the new code).

However, the adversarial review surfaced **4 Critical** findings: an arbitrary file read via the social cookie path, missing operator authorization on two taste-ingestion paths (DM and keyword command), and a broken channel name-resolution fallback (`caches` vs `cache`) that silently breaks `resolveChannel` for channels without env IDs. There are also **6 Warnings** including data loss in TBA re-audit (deadlines object fully overwritten), reminder re-firing on bookmark re-reaction, and dedup corruption from a shared URL hash in taste pre-scoring.

## Structural Findings (fallow)

No structural findings block was provided for this review.

## Critical Issues

### CR-01: Arbitrary File Read via `SOCIAL_COOKIES_PATH` (social.ts)

**File:** `packages/discord-router/src/portals/social.ts:42-45`

**Issue:** `readSocialCookies(path)` calls `readFileSync(path, 'utf8')` where `path` comes directly from `env.SOCIAL_COOKIES_PATH` with no path validation, symlink resolution, or directory confinement. An attacker who can set or influence `SOCIAL_COOKIES_PATH` can read any file on the VM (`/etc/passwd`, `~/.ssh/id_rsa`, `.env`, etc.). The file is parsed as JSON, so non-JSON files throw and are caught (returning `[]`), but any JSON-formatted sensitive file is exfiltratable.

**Fix:** Confine the cookie path to an allowed directory and resolve symlinks before reading:

```typescript
import { readFileSync } from 'node:fs';
import { realpathSync } from 'node:fs';

const ALLOWED_COOKIE_DIR = '/opt/zod/cookies';

export function readSocialCookies(path: string): SocialCookie[] {
  const resolved = realpathSync(path);
  if (!resolved.startsWith(ALLOWED_COOKIE_DIR + '/')) {
    throw new Error(`Cookie path outside allowed directory: ${resolved}`);
  }
  const raw = readFileSync(resolved, 'utf8');
  return JSON.parse(raw);
}
```

### CR-02: Taste Ingestion DM Path — No Operator Authorization (taste-ingest.ts)

**File:** `packages/discord-router/src/taste-ingest.ts:193-214`

**Issue:** Path 3 (DM to bot) accepts `!rule` commands from ANY user who can DM the bot, with no operator authorization check. Any user who can direct-message the bot can create taste rules (BLOCK, BOOST, WEIGHT, CUSTOM) that affect all audit verdicts for all users. This is an authorization bypass / privilege escalation — taste rules influence the LLM auditor's judgments system-wide.

**Fix:** Add an operator allowlist check before processing DM rule commands:

```typescript
const OPERATOR_USER_IDS = new Set((env.OPERATOR_USER_IDS ?? '').split(',').filter(Boolean));

// In the DM handler (Path 3):
if (isDM && msg.content.startsWith('!rule')) {
  if (!OPERATOR_USER_IDS.has(msg.author.id)) {
    await msg.reply('❌ You are not authorized to create taste rules.');
    return;
  }
  // ... existing rule creation logic
}
```

Add `OPERATOR_USER_IDS: z.string().default('')` to `EnvSchema` in `packages/config/src/env.ts`.

### CR-03: `resolveChannel` Name-Based Fallback Broken (`caches` vs `cache`) (router-service.ts)

**File:** `packages/discord-router/src/router-service.ts:183`

**Issue:** `client.guilds?.caches?.values?.()` uses `caches` but discord.js v14 exposes `.cache` (not `.caches`) on `GuildManager`. The optional chain evaluates to `undefined`, so `guilds` is always `[]`. The name-based fallback (step 3 of `resolveChannel`) never iterates any guilds. Channels without env IDs configured in `CHANNEL_ID_ENV_KEYS` will never be resolved by name — `resolveChannel` returns `null`, and reminders/posts to those channels silently fail (skip path).

**Fix:** Change `caches` to `cache`:

```typescript
const guilds = client.guilds?.cache?.values?.() ?? [];
```

### CR-04: Taste Ingestion Keyword Command Path — No Operator Authorization (taste-ingest.ts)

**File:** `packages/discord-router/src/taste-ingest.ts:166-191`

**Issue:** Path 2 (keyword command in `#🧠-bot-training-chat`) only checks `msg.channelId === env.DISCORD_CHANNEL_TRAINING` and `msg.content.startsWith('!rule')`, but does not verify the sender is an authorized operator. Any user with access to the training channel can create taste rules that affect all audit verdicts system-wide.

**Fix:** Add the same operator allowlist check as CR-02 before creating taste rules from keyword commands:

```typescript
if (
  env.DISCORD_CHANNEL_TRAINING &&
  msg.channelId === env.DISCORD_CHANNEL_TRAINING &&
  msg.content.startsWith('!rule')
) {
  if (!OPERATOR_USER_IDS.has(msg.author.id)) {
    await msg.reply('❌ You are not authorized to create taste rules.');
    return;
  }
  // ... existing rule creation logic
}
```

## Warnings

### WR-01: `applyTastePreScoring` Uses Same URL Hash for All Blocked Candidates (taste-apply.ts)

**File:** `packages/orchestrator/src/taste-apply.ts:142-152`

**Issue:** `applyTastePreScoring` receives a single `url` parameter and computes one `urlHash` that is applied to ALL blocked candidates' tombstones:

```typescript
const urlHash = hashUrl(normalizeUrl(url));  // computed once, reused for all
for (const cand of blocked) {
  await pb.collection('tombstone_ledger').create({
    url_hash: urlHash,   // BUG: same hash for every blocked candidate
    fingerprint: urlHash, // BUG: same fingerprint
    ...
  });
}
```

Each blocked candidate should be tombstoned with its own URL hash. Using the same hash causes dedup corruption — one blocked candidate's tombstone can incorrectly prevent other, different candidates from being processed.

**Fix:** Compute the hash per candidate:

```typescript
for (const cand of blocked) {
  const candHash = hashUrl(normalizeUrl(cand.url));
  await pb.collection('tombstone_ledger').create({
    url_hash: candHash,
    fingerprint: candHash,
    terminal_status: 'taste_blocked',
    source: 'taste_rule',
    decided_at: new Date().toISOString(),
  });
}
```

### WR-02: TBA Re-audit Overwrites `deadlines` Completely — Data Loss (tba-loop.ts)

**File:** `packages/orchestrator/src/tba-loop.ts:102-105, 119-122, 181-184`

**Issue:** When keeping a TBA row on the 48h loop (UNVERIFIED, POOL_SATURATED, parse failure, or still TBA), the code replaces `deadlines` entirely:

```typescript
await pb.collection('opportunities').update(row.id, {
  updated: new Date().toISOString(),
  deadlines: { tba: true },  // wipes apply_by, event_start, event_end
});
```

If a TBA row previously had partial deadline information (e.g., `event_start` known but `prize_cash_inr` TBA), it is wiped. This is data loss.

**Fix:** Merge with existing deadlines:

```typescript
await pb.collection('opportunities').update(row.id, {
  updated: new Date().toISOString(),
  deadlines: { ...(row.deadlines as Record<string, unknown>), tba: true },
});
```

### WR-03: Bookmark Re-Reaction Resets Reminder `sent` Flags (bookmark.ts)

**File:** `packages/discord-router/src/bookmark.ts:107-111`

**Issue:** If a user re-acts with the bookmark emoji (or removes and re-adds), `computeReminders` creates fresh reminders with `sent: false`, overwriting the existing `reminders[]` array. This can cause reminders that were already fired and marked `sent: true` to be re-fired, producing duplicate reminder posts.

**Fix:** Check if already bookmarked and skip, or merge new reminders with existing ones preserving `sent` flags:

```typescript
if (opp.bookmark === true) {
  // Already bookmarked — merge new reminders, preserving sent flags
  const existingReminders = opp.reminders ?? [];
  const newReminders = computeReminders(opp.deadlines, opp.bucket_channel);
  const merged = existingReminders.map((er) => {
    const nr = newReminders.find((r) => r.at === er.at);
    return nr ?? { ...er, sent: true }; // keep existing sent flag
  });
  await pb.collection('opportunities').update(opp.id, {
    bookmark: true,
    reminders: merged,
  });
  return;
}
```

### WR-04: `formatReminder` Hardcodes Hours Based on Anchor Type (reminder.ts)

**File:** `packages/discord-router/src/reminder.ts:42`

**Issue:** `formatReminder` determines the hours text based on whether `event_start` exists, not on which reminder (48h or 24h) is being fired:

```typescript
const hoursAgo = deadlines?.event_start ? 48 : 24;
```

But `computeReminders` (bookmark.ts) creates BOTH 48h and 24h reminders regardless of which anchor is used. When anchored on `event_start`, the 24h reminder incorrectly says "Event starts in 48h". When anchored on `apply_by`, the 48h reminder incorrectly says "Apply by in 24h".

**Fix:** Pass the actual reminder hours to `formatReminder`. Store `hoursBefore` on each reminder in `computeReminders`, or pass it as a parameter:

```typescript
// In bookmark.ts computeReminders:
reminders.push({ at: r48.toISOString(), channel, sent: false, hoursBefore: 48 });
reminders.push({ at: r24.toISOString(), channel, sent: false, hoursBefore: 24 });

// In reminder.ts formatReminder:
function formatReminder(reminder: any, deadlines: any): string {
  const anchorLabel = deadlines?.event_start ? 'Event starts' : 'Apply by';
  const anchorDate = ...;
  return `${anchorLabel} in ${reminder.hoursBefore ?? 24}h (${anchorDate})`;
}
```

### WR-05: Relay Service Relays Raw Content Without Sanitization or Size Limits (relay.ts)

**File:** `packages/discord-router/src/relay.ts:154`

**Issue:** `targetChannel.send({ content: msg.content })` relays raw message content from the external `#announcements` channel with:
- No message length limit (Discord caps at 4000 chars; `channel.send()` may fail on longer content)
- No `@everyone`/`@here` mention filtering — a malicious source message could ping the entire server
- No content sanitization — malicious links or phishing content are relayed verbatim

This could flood `#raw-incoming-feeds` or relay harmful content to internal viewers.

**Fix:** Add length limits and mention filtering before relaying:

```typescript
const MAX_RELAY_LENGTH = 3500;
for (const msg of msgArray) {
  try {
    let content = msg.content;
    // Strip @everyone/@here mentions
    content = content.replace(/@everyone|@here/g, '@\u200beveryone');
    // Truncate if too long
    if (content.length > MAX_RELAY_LENGTH) {
      content = content.slice(0, MAX_RELAY_LENGTH - 3) + '...';
    }
    await targetChannel.send({ content });
    // ... track newLastId
  } catch (err) { ... }
}
```

### WR-06: Social Cookie File — No Symlink or Path Validation (social.ts)

**File:** `packages/discord-router/src/portals/social.ts:42-45`

**Issue:** In addition to CR-01 (arbitrary file read), `readFileSync(path)` follows symlinks. An attacker who can replace the cookie file with a symlink to a sensitive file (e.g., `~/.ssh/id_rsa` if it happens to be valid JSON, or any JSON-formatted secret) can cause the app to read and potentially exfiltrate it via the social polling pipeline.

**Fix:** Use `fs.realpathSync` to resolve symlinks and validate the resolved path is within an allowed directory (same fix as CR-01).

## Info

### IN-01: `gateway.ts` Has No Dedicated Test File

**File:** `packages/discord-router/src/gateway.ts`

**Issue:** `gateway.ts` is a critical module — it creates the Discord client singleton, configures gateway intents (including the privileged `MessageContent` intent), and starts all event handlers (bookmark, taste ingestion). It has no dedicated test file. It is only indirectly exercised through other modules that mock `getClient()`.

**Fix:** Add `packages/discord-router/src/gateway.test.ts` with unit tests for client creation, intent configuration, handler startup, and `getClient()` null-before-login behavior.

### IN-02: `registry-start.ts` Has No Dedicated Test File

**File:** `apps/scheduler/src/registry-start.ts`

**Issue:** The scheduler entry point that wires all services (PocketBase, Turso, LlmRouter, candidate sources, relay, reminder, orchestrator) together has no direct test coverage. Registration failures would only surface at runtime.

**Fix:** Add `apps/scheduler/src/registry-start.test.ts` with unit tests for job registration, candidate source wiring, and gateway job tickHandler dispatch.

### IN-03: `Math.random()` Used for Jitter (Not Cryptographically Secure) (social.ts)

**File:** `packages/discord-router/src/portals/social.ts:99`

**Issue:** `const jitter = 30_000 + Math.random() * 60_000;` uses `Math.random()`, which is not cryptographically secure. For anti-rate-limit pacing on X/LinkedIn this is likely sufficient, but a determined observer could predict request timing patterns.

**Fix:** Use `crypto.randomInt()` if rate-limit evasion is a security concern:

```typescript
import { randomInt } from 'node:crypto';
const jitter = 30_000 + randomInt(60_000);
```

### IN-04: No Rate Limiting Between Domain Fetches in Local Source (local.ts)

**File:** `packages/discord-router/src/portals/local.ts:136-140`

**Issue:** The local source fetches all watchlist domains sequentially with no delay between requests. With 10+ domains in the default inventory, this creates a burst of rapid HTTP requests that could trigger rate limiting on college websites.

**Fix:** Add a small delay between domain fetches:

```typescript
for (const domain of domains) {
  const html = await fetchPage(`https://${domain}`);
  if (!html) continue;
  candidates.push(...parseEvents(html, domain));
  if (domain !== domains[domains.length - 1]) {
    await new Promise((r) => setTimeout(r, 1000)); // 1s between domains
  }
}
```

### IN-05: `startTasteIngestion`/`startBookmarkHandler` Return `void` With Unhandled Async Setup

**File:** `packages/discord-router/src/taste-ingest.ts:227-236`, `packages/discord-router/src/bookmark.ts:129-132`

**Issue:** Both functions use `void createXxxHandler(...)` and return `void`. Setup errors during handler creation (e.g., Discord client not ready) are logged as warnings but not propagated to callers. Callers cannot detect whether handlers were successfully initialized.

**Fix:** Consider returning the handler instance or a Promise so callers can detect setup failures. At minimum, document the fire-and-forget contract clearly.

---

_Reviewed: 2026-10-17T00:00:00Z_
_Reviewer: the agent (gsd-code-reviewer)_
_Depth: standard_