# Phase 6: Delivery + Local/Social Coverage - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-10-16
**Phase:** 6-Delivery + Local/Social Coverage
**Areas discussed:** Local crawler (domain inventory + geo bucket split), Announcements relay + bookmarks + reminders, X/LinkedIn session-cookie polling, TBA two-ping 48h loop + taste_rules training-chat

---

## Local Crawler: Domain Inventory + Geo Bucket Split

### Domain inventory source

| Option | Description | Selected |
|--------|-------------|----------|
| Hybrid | Code defaults + LOCAL_WATCHLIST_DOMAINS env override | ✓ |
| Hardcoded in code | College domains + GDG/FOSS baked into source | |
| Env/config-driven | LOCAL_WATCHLIST_DOMAINS comma-separated only | |

**User's choice:** Hybrid
**Notes:** Operator can extend without redeploy; code defaults cover the known DK/Udupi colleges.

### Geo classification signals

| Option | Description | Selected |
|--------|-------------|----------|
| Location-primary | Event location/venue city primary; organizer city secondary; "selection round" keyword for travel vs walk-in | ✓ |
| Organizer-city-primary | Organizer city is primary signal | |
| Keyword-only | Rely on selection round + ticketing platform keywords | |

**User's choice:** Location-primary
**Notes:** "Selection round" / "registration" keyword is the key distinguisher between travel-curated (has selection) and walk-in-reject (no selection).

### Bio-link watcher mechanism

| Option | Description | Selected |
|--------|-------------|----------|
| Browser page poll | Poll full page via shared browser (JS-rendered bio-links) | ✓ |
| RSS/sitemap polling | Poll RSS/sitemap feeds if available | |
| DOM selector watch | Watch a specific DOM selector via browser | |

**User's choice:** Browser page poll
**Notes:** Bio-links are JS-rendered; need headless rendering via existing shared Playwright singleton.

---

## Announcements Relay + Bookmarks + Reminders

### Relay mechanism

| Option | Description | Selected |
|--------|-------------|----------|
| Polling timer | Poll #announcements on a timer (bounded latency, no cross-guild bot membership) | ✓ |
| Gateway listener | Gateway messageCreate listener (real-time, needs bot in source guild) | |

**User's choice:** Polling timer
**Notes:** Simpler, no cross-guild bot invitation needed.

### Bookmark emoji

| Option | Description | Selected |
|--------|-------------|----------|
| Custom server emoji | Avoids unicode rendering issues across clients | ✓ |
| Unicode 📌 | Unicode pushpin U+1F4CC | |

**User's choice:** Custom server emoji
**Notes:** Avoids cross-client rendering inconsistency.

### Reminder anchor

| Option | Description | Selected |
|--------|-------------|----------|
| Event date | Counts down to deadlines.event_start / apply_by | ✓ |
| Post time | 48h/24h after the alert is posted | |

**User's choice:** Event date
**Notes:** Aligned to the actual deadline, not post time.

---

## X/LinkedIn Session-Cookie Polling

### Cookie storage / session posture

| Option | Description | Selected |
|--------|-------------|----------|
| Cookies file on disk | Exported cookies file on disk, read at tick time | ✓ |
| Env var | Serialized cookie string in env | |
| Browser-launched login | Shared Playwright browser, manual once-per-session | |

**User's choice:** Cookies file on disk
**Notes:** Easiest to rotate/export from burner browser.

### Human pacing

| Option | Description | Selected |
|--------|-------------|----------|
| 30-90s jitter, max 5/tick | Conservative pacing, low ban risk | ✓ |
| 15-60s jitter, max 10/tick | Faster coverage, higher ban risk | |
| 60-120s jitter, max 3/tick | Very conservative, minimal ban risk | |

**User's choice:** 30-90s jitter, max 5/tick
**Notes:** Balances coverage with ban-risk avoidance.

### Search-index fallback

| Option | Description | Selected |
|--------|-------------|----------|
| None | Accept coverage gaps when direct polling blocked | ✓ |
| Search engine site:query | Google/Bing/DDG site:x.com queries | |
| Aggregator/RSS | Use aggregator/RSS feeds | |

**User's choice:** None
**Notes:** Keep it simple, zero-cost. Accept gaps.

---

## TBA Two-Ping 48h Loop + Taste Rules Training-Chat

### TBA re-audit scheduler

| Option | Description | Selected |
|--------|-------------|----------|
| Reuse audit-drain | Every 5m, scan deadlines.tba=true rows >48h since last audit | ✓ |
| New dedicated job | Separate scheduler job on 48h loop | |

**User's choice:** Reuse audit-drain
**Notes:** No new scheduler job needed. Scan tba=true rows whose last audit was >48h ago, until event date/time arrives.

### Training-chat to taste rule mechanism

| Option | Description | Selected |
|--------|-------------|----------|
| All 3 paths | Reaction-based (👍/👎) + keyword command + DM to bot | ✓ |
| Reaction only | 👍/👎 on audit cards | |
| Keyword command only | Operator types rule in channel | |
| DM only | Operator DMs the bot | |

**User's choice:** All 3 paths
**Notes:** All three create/update taste_rules rows. Confirmation reply posted in #🧠-bot-training-chat.

### Taste rule application

| Option | Description | Selected |
|--------|-------------|----------|
| Hybrid (Recommended) | BLOCK = pre-scoring filter; BOOST/WEIGHT/CUSTOM = system-prompt injection | ✓ |
| System-prompt injection only | All rules appended to system prompt | |
| Pre-scoring filter only | All rules checked before LLM | |
| Post-verdict override only | Rules flip LLM verdict after the fact | |

**User's choice:** Hybrid — BLOCK = pre-scoring filter (auto-reject + tombstone before LLM, saves quota); BOOST/WEIGHT/CUSTOM = system-prompt injection (advisory)
**Notes:** User asked "what is the best option??" — agent recommended hybrid, user confirmed.

### Taste rule precedence

| Option | Description | Selected |
|--------|-------------|----------|
| Taste BLOCK overrides soft gates, NOT hard gates | Hard compliance gates (2+yr, unpaid, pay-to-training, US/EU-only) are mission-non-negotiable | ✓ |
| Taste rules override everything | Taste rules can override any gate | |
| Taste rules advisory only | Never override any gate | |

**User's choice:** Taste BLOCK overrides soft/personal gates but NOT hard compliance gates
**Notes:** Hard gates are PROJECT.md out-of-scope items — mission-non-negotiable.

---

## the agent's Discretion

- Exact cron expressions for new poll jobs (within decided cadence windows)
- Internal data flow for relay (how polled announcements map to #raw-incoming-feeds posts)
- Reminder ticker implementation details (how reminders[] rows are scanned and fired)
- Taste rule schema extension if needed
- Bio-link page change-detection heuristics

## Deferred Ideas

None — discussion stayed within phase scope
