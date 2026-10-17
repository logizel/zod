---
status: testing
phase: 06-delivery-local-social-coverage
source: [06-VERIFICATION.md]
started: 2026-10-17T13:45:00Z
updated: 2026-10-17T13:45:00Z
---

## Current Test

number: 1
name: Operator authorization configuration for taste-ingestion paths
expected: |
  Only authorized operators can create taste rules that affect all audit verdicts system-wide. OPERATOR_USER_IDS Discord user IDs must be added to .env (code enforcement is complete and fail-closed when empty).
awaiting: user response

## Tests

### 1. Operator authorization configuration for taste-ingestion paths
expected: Only authorized operators can create taste rules via DM !rule (Path 3) and keyword !rule (Path 2). OPERATOR_USER_IDS env var configured with operator Discord IDs.
result: [pending]
awaiting: Add OPERATOR_USER_IDS to .env with operator Discord user IDs

### 2. Custom bookmark emoji creation on Discord server
expected: Custom bookmark emoji exists on the Discord server and BOOKMARK_EMOJI_ID env var is configured with its ID.
result: [pending]
awaiting: Create custom bookmark emoji on server (Server Settings -> Emojis -> Upload Image), export ID to BOOKMARK_EMOJI_ID

### 3. X/LinkedIn burner cookie export
expected: Cookie file exists at SOCIAL_COOKIES_PATH (/opt/zod/social-cookies/) with valid burner session cookies, file permissions restricted (chmod 600).
result: [pending]
awaiting: Export burner session cookies to JSON file at SOCIAL_COOKIES_PATH, chmod 600

### 4. External #announcements channel access
expected: Bot can read messages from external #announcements channel via DISCORD_RELAY_SOURCE_CHANNEL_ID env var.
result: [pending]
awaiting: Configure DISCORD_RELAY_SOURCE_CHANNEL_ID with the external #announcements channel ID

## Summary

total: 4
passed: 0
issues: 0
pending: 4
skipped: 0
blocked: 0

## Gaps

- gap_id: G-06-1
  truth: "Only authorized operators can create taste rules via DM path (CR-02)"
  status: closed
  plan: 06-05
  commit: 3aba6c6
  reason: "OPERATOR_USER_IDS allowlist added to EnvSchema and enforced on Path 3 DM handler — code complete"

- gap_id: G-06-2
  truth: "Only authorized operators can create taste rules via keyword command path (CR-04)"
  status: closed
  plan: 06-06
  commit: 0c8aea3
  reason: "OPERATOR_USER_IDS allowlist enforced on Path 2 keyword handler — code complete"

- gap_id: G-06-3
  truth: "Social cookie path resolves symlinks and confines to allowed directory (CR-01 partial / WR-06)"
  status: closed
  plan: 06-07
  commit: 813a8f1
  reason: "realpathSync resolution + ALLOWED_COOKIE_DIR confinement added to readSocialCookies — code complete"

## Deferred Follow-Ups

None — all 4 remaining items are human setup/configuration actions tracked above as pending UAT tests.