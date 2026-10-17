---
phase: 06-delivery-local-social-coverage
plan_count: 3
reviewed: 2026-10-17T13:30:00Z
depth: standard
files_reviewed: 6
files_reviewed_list:
  - packages/config/src/env.ts
  - packages/config/src/env.test.ts
  - packages/discord-router/src/taste-ingest.ts
  - packages/discord-router/src/taste-ingest.test.ts
  - packages/discord-router/src/portals/social.ts
  - packages/discord-router/src/portals/social.test.ts
findings:
  critical: 0
  warning: 4
  info: 3
  total: 7
status: issues_found
---

# Phase 06: Code Review Report (Plans 06-05, 06-06, 06-07)

**Reviewed:** 2026-10-17T13:30:00Z
**Depth:** standard
**Files Reviewed:** 6
**Status:** issues_found

## Summary

This review covers the three plans executed in phase 06:
- **06-05** (G-06-1 / CR-02): `OPERATOR_USER_IDS` operator allowlist on Path 3 DM `!rule` handler
- **06-06** (G-06-2 / CR-04): `OPERATOR_USER_IDS` operator allowlist on Path 2 keyword `!rule` handler
- **06-07** (G-06-3 / CR-01 partial / WR-06): `realpathSync` symlink resolution + `ALLOWED_COOKIE_DIR` confinement in `readSocialCookies`

The previously identified Critical issues (CR-01 arbitrary file read, CR-02 DM authorization bypass, CR-04 keyword authorization bypass, WR-06 missing symlink validation) from the prior phase review have been remediated by these plans. The allowlist checks are correctly placed before rule parsing in both Path 2 and Path 3, use the same `OPERATOR_USER_IDS` Set, default to fail-closed (empty allowlist rejects all), and `readSocialCookies` now resolves symlinks via `realpathSync` before confinement checking and file reading.

The adversarial review surfaced **4 Warnings** and **3 Info** items in the implementation itself. No new Critical issues were found. All tests pass for the reviewed modules. Review failures are advisory and must not block execution.

## Warnings

### WR-01: Discord.js v14 ChannelType casing mismatch in DM detection

**File:** `packages/discord-router/src/taste-ingest.ts:206`
**Severity:** Warning
**Issue:** `msg.channel?.type === 'DM'` uses uppercase `'DM'`, but discord.js v14 `ChannelType.DM` resolves to the lowercase string `'dm'`. The `|| msg.guild === null` fallback on the same line masks this for DM messages (guild is `null` in DMs), so authorization works in practice. However, this is fragile: if the `guild` check is removed or refactored in the future, DM detection would silently break, causing operator DM `!rule` commands to be ignored (fail-closed — no rules created, but functionality broken). The test mock at `taste-ingest.test.ts:452` also uses `'DM'`, so the test does not catch this mismatch.
**Fix:** Change `'DM'` to `'dm'` to match discord.js v14's `ChannelType.DM`:

```typescript
const isDM = msg.channel?.type === 'dm' || msg.guild === null;
```

### WR-02: No guard against duplicate listener registration

**File:** `packages/discord-router/src/taste-ingest.ts:119,168`
**Severity:** Warning
**Issue:** `createTasteIngestionHandler` registers `messageReactionAdd` (line 119) and `messageCreate` (line 168) listeners on the Discord client every time it is called. `startTasteIngestion` (line 245) uses `void` (fire-and-forget) with no idempotency guard. If invoked more than once — hot reload, multiple entry points, or repeated test setup — duplicate listeners will fire, potentially creating duplicate taste rules for the same event and sending duplicate confirmation replies.
**Fix:** Add a registration guard so listeners are attached only once:

```typescript
let listenersRegistered = false;
// ... inside createTasteIngestionHandler:
if (listenersRegistered) {
  return { stop: () => undefined };
}
listenersRegistered = true;
client.on('messageReactionAdd', async (reaction, user) => { ... });
client.on('messageCreate', async (msg) => { ... });
```

### WR-03: TOCTOU symlink race in readSocialCookies

**File:** `packages/discord-router/src/portals/social.ts:51-55`
**Severity:** Warning
**Issue:** `readSocialCookies` calls `realpathSync(path)` to validate the path, then `readFileSync(resolved)` to read it. Between these two calls, an attacker with write access to `/opt/zod/social-cookies/` could replace a validated file with a symlink pointing outside `ALLOWED_COOKIE_DIR`. `readFileSync` follows symlinks, so the confinement check on the resolved path is bypassed. This is a time-of-check-to-time-of-use (TOCTOU) symlink race. The primary attack vector (symlink at the input path) is blocked by `realpathSync`, but this residual race remains.
**Fix:** Open the file with `O_NOFOLLOW` to prevent symlink following at read time:

```typescript
import { openSync, readFileSync, realpathSync, closeSync } from 'node:fs';
import { constants } from 'node:fs';

export function readSocialCookies(path: string): SocialCookie[] {
  const resolved = realpathSync(path);
  if (!resolved.startsWith(ALLOWED_COOKIE_DIR + '/')) {
    throw new Error(`Cookie path outside allowed directory: ${resolved}`);
  }
  const fd = openSync(resolved, 'r', constants.O_NOFOLLOW);
  try {
    const raw = readFileSync(fd, 'utf8');
    return JSON.parse(raw);
  } finally {
    closeSync(fd);
  }
}
```

### WR-04: Unvalidated JSON.parse in readSocialCookies

**File:** `packages/discord-router/src/portals/social.ts:56`
**Severity:** Warning
**Issue:** `readSocialCookies` returns `JSON.parse(raw)` without validating the result is an array of `SocialCookie` objects with `name`, `value`, and `domain` fields. Malformed cookie data (a JSON object instead of an array, or objects missing fields) would cause `buildCookieHeader` (line 60) to produce `undefined=undefined` entries or throw (caught by `socialSource.list()` but silently degrading to `[]`). No schema boundary validation exists at the cookie parsing layer, despite the project convention of `zod` validation at every boundary.
**Fix:** Validate the parsed result with zod before returning:

```typescript
import * as z from 'zod';

const SocialCookieSchema = z.array(z.object({
  name: z.string().min(1),
  value: z.string().min(1),
  domain: z.string().min(1),
}));

export function readSocialCookies(path: string): SocialCookie[] {
  const resolved = realpathSync(path);
  if (!resolved.startsWith(ALLOWED_COOKIE_DIR + '/')) {
    throw new Error(`Cookie path outside allowed directory: ${resolved}`);
  }
  const raw = readFileSync(resolved, 'utf8');
  return SocialCookieSchema.parse(JSON.parse(raw));
}
```

## Info

### IN-01: ALLOWED_COOKIE_DIR hardcoded, not configurable via env

**File:** `packages/discord-router/src/portals/social.ts:41`
**Severity:** Info
**Issue:** `ALLOWED_COOKIE_DIR` is hardcoded as `/opt/zod/social-cookies` with no environment variable override. Deployments using a different cookie directory path require a code change rather than a config change. This contradicts the project's env-first configuration pattern used elsewhere in `env.ts`.
**Fix:** Read from `env.ALLOWED_COOKIE_DIR` with a default, and add the key to `EnvSchema`:

```typescript
// social.ts
const ALLOWED_COOKIE_DIR = env.ALLOWED_COOKIE_DIR ?? '/opt/zod/social-cookies';

// env.ts — add to EnvSchema:
ALLOWED_COOKIE_DIR: z.string().default('/opt/zod/social-cookies'),
```

### IN-02: No user feedback when taste rule creation fails

**File:** `packages/discord-router/src/taste-ingest.ts:160-162` (Path 1 reaction), `232-234` (Path 3 DM)
**Severity:** Info
**Issue:** When `TasteRule.parse()` or `pb.collection('taste_rules').create()` throws, the catch block only logs a warning via `pbLog.warn`. The operator receives no reply indicating their rule was rejected or failed. This degrades the operator experience and makes debugging failed rule submissions difficult — the operator has no way to know whether their `!rule` command succeeded.
**Fix:** Send an error reply to the user in the catch block (wrapped in its own try/catch since DM replies may fail if the user blocked the bot):

```typescript
} catch (err) {
  pbLog.warn({ err: String(err) }, 'taste ingestion handler error');
  try {
    await msg.reply('❌ Failed to create taste rule. See logs for details.');
  } catch {
    // reply may fail in DMs if user blocked bot — ignore
  }
}
```

### IN-03: Test mock uses incorrect Discord channel type casing

**File:** `packages/discord-router/src/taste-ingest.test.ts:452`
**Severity:** Info
**Issue:** The DM test mocks `channel: { type: 'DM' }` (uppercase), matching the implementation's incorrect casing. Since discord.js v14 uses `'dm'` (lowercase), the test does not catch the casing mismatch documented in WR-01. The test passes only because `guild: null` is also set, which independently satisfies the `isDM` check.
**Fix:** Update the test mock to use `'dm'` to match the actual discord.js v14 value:

```typescript
channel: { type: 'dm' },
```

---

_Reviewed: 2026-10-17T13:30:00Z_
_Reviewer: the agent (gsd-code-reviewer)_
_Depth: standard_
