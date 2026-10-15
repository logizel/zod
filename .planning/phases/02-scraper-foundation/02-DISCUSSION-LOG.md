# Phase 2: Scraper Foundation - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-10-15
**Phase:** 2-Scraper Foundation
**Areas discussed:** Fetch + sanitizer pipeline, Browser queue behavior, Scout pre-filter rules, Scratchpad lifecycle

---

## Fetch + sanitizer pipeline

| Option | Description | Selected |
|--------|-------------|----------|
| Jina-first strict | Cheapest first, browser only for JS-gated | ✓ |
| RSS-then-Jina | Source API/RSS, then Jina, then browser last resort | |
| Browser-first | Playwright for portals, Jina only for simple pages | |

**User's choice:** Jina-first strict
**Notes:** PROJECT constraint reaffirmed — lowest RAM + token cost.

| Option | Description | Selected |
|--------|-------------|----------|
| Fail triggers | Empty/short output, HTTP error, throttle signal | ✓ |
| JS-sniffing | Detect JS-required markers then route | |
| You decide | Researcher defines thresholds | |

**User's choice:** Fail triggers
**Notes:** No JS-sniffing heuristic in v1.

| Option | Description | Selected |
|--------|-------------|----------|
| 8k cap | Balanced for free-tier LLMs, avoids 413s | ✓ |
| 16k cap | More context, higher burn | |
| You decide | Researcher sets from tests | |

**User's choice:** 8k cap

| Option | Description | Selected |
|--------|-------------|----------|
| Keep links | Links needed for 2-hop audit + official source | ✓ |
| Text-only | Strip images/fonts, text + links only | |
| You decide | Per-source decision | |

**User's choice:** Keep links

| Option | Description | Selected |
|--------|-------------|----------|
| Aggressive strip | Scripts, styles, SVG, nav, footer stripped | ✓ |
| Light strip | Keep sidebar/nav text | |
| You decide | Researcher defines list | |

**User's choice:** Aggressive strip (extra round after Next→More)

| Option | Description | Selected |
|--------|-------------|----------|
| Byte comparison | Raw HTML bytes vs capped markdown | ✓ |
| Token estimate | Token counter instead | |
| You decide | Planner defines proof | |

**User's choice:** Byte comparison

| Option | Description | Selected |
|--------|-------------|----------|
| Keyed Jina | Higher limits, key in env | ✓ |
| Keyless only | No key dependency | |
| You decide | Researcher decides | |

**User's choice:** Keyed Jina

| Option | Description | Selected |
|--------|-------------|----------|
| 30s cap | Fast fail to fallback | ✓ |
| 60s cap | Tolerant for slow portals | |
| You decide | Researcher tunes | |

**User's choice:** 30s cap

---

## Browser queue behavior

| Option | Description | Selected |
|--------|-------------|----------|
| Max 2 tabs | Lower RAM, safer on ARM | ✓ |
| Max 3 tabs | Criterion upper bound | |
| You decide | Benchmark | |

**User's choice:** Max 2 tabs

| Option | Description | Selected |
|--------|-------------|----------|
| Strict FIFO | Simplest fair ordering | ✓ |
| Priority lanes | Auditor over Scout | |
| You decide | Planner decides | |

**User's choice:** Strict FIFO

| Option | Description | Selected |
|--------|-------------|----------|
| Fresh context | Isolates cookies, prevents leak | ✓ |
| Reuse context | Lower overhead | |
| You decide | Researcher decides | |

**User's choice:** Fresh context

| Option | Description | Selected |
|--------|-------------|----------|
| Backpressure | Scheduler waits, never drops | ✓ |
| Drop oldest | Shed load under pileup | |
| You decide | Planner decides | |

**User's choice:** Backpressure

| Option | Description | Selected |
|--------|-------------|----------|
| Block media | Abort images, fonts, video | ✓ |
| Allow images | Keep event posters | |
| You decide | Researcher decides | |

**User's choice:** Block media (extra round)

| Option | Description | Selected |
|--------|-------------|----------|
| 30s nav | Fast fail, frees tab | ✓ |
| 60s nav | Tolerant for slow portals | |
| You decide | Researcher tunes | |

**User's choice:** 30s nav

| Option | Description | Selected |
|--------|-------------|----------|
| playwright-core | Small ARM footprint | ✓ |
| Full Playwright | Easier debugging, bigger image | |
| You decide | Researcher decides | |

**User's choice:** playwright-core

| Option | Description | Selected |
|--------|-------------|----------|
| Strict close | Close context after every fetch | ✓ |
| Pooled reuse | Pool contexts for speed | |
| You decide | Researcher decides | |

**User's choice:** Strict close

---

## Scout pre-filter rules

| Option | Description | Selected |
|--------|-------------|----------|
| Strict expiry | Never waste scrape on past dates | ✓ |
| Grace window | 24h grace for timezone edge | |
| You decide | Researcher decides | |

**User's choice:** Strict expiry

| Option | Description | Selected |
|--------|-------------|----------|
| Conservative | Only obvious spam from title/snippet | |
| Aggressive | Broader keyword + pattern matching | ✓ |
| You decide | Researcher defines list | |

**User's choice:** Aggressive

| Option | Description | Selected |
|--------|-------------|----------|
| date-fns parse | date-fns parsing, reject unparseable-past | ✓ |
| Naive compare | String compare only | |
| You decide | Researcher decides | |

**User's choice:** date-fns parse

| Option | Description | Selected |
|--------|-------------|----------|
| Favor precision | Drop noise over saving edge cases | ✓ |
| Favor recall | Keep borderline for auditor | |
| You decide | Researcher tunes | |

**User's choice:** Favor precision

---

## Scratchpad lifecycle

| Option | Description | Selected |
|--------|-------------|----------|
| STEP_1-2 only | Discovered → sanitized per ARCH | ✓ |
| Full STEP_1-4 | Full rows now, later phases fill | |
| You decide | Researcher defines | |

**User's choice:** STEP_1-2 only

| Option | Description | Selected |
|--------|-------------|----------|
| PB-backed | task_scratchpad row is source of truth | ✓ |
| Memory-first | Faster, flush async | |
| You decide | Researcher decides | |

**User's choice:** PB-backed

| Option | Description | Selected |
|--------|-------------|----------|
| URL resume | Resume STEP position by candidate_url | ✓ |
| Restart fresh | Replay from scratch on crash | |
| You decide | Planner decides | |

**User's choice:** URL resume

| Option | Description | Selected |
|--------|-------------|----------|
| 3 retries | Bounded, then tombstone | |
| Unlimited | Keep retrying | |
| You decide | Researcher decides | |

**User's choice:** 5 retries (freeform Other override)
**Notes:** User typed "5 retries" — locked as 5, not 3.

---

## Agent's Discretion

None — user chose concrete options for all areas. No "you decide" selections.

## Deferred Ideas

None — discussion stayed within phase scope.
