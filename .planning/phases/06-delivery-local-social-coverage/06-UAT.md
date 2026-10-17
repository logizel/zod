---
status: testing
phase: 06-delivery-local-social-coverage
source: [06-VERIFICATION.md]
started: 2026-10-17T11:35:00Z
updated: 2026-10-17T11:35:00Z
---

## Current Test

number: 1
name: Operator authorization configuration for taste-ingestion paths
expected: |
  Only authorized operators can create taste rules that affect all audit verdicts system-wide. Add OPERATOR_USER_IDS env var and authorization checks to DM and keyword command taste-ingestion paths (CR-02, CR-04).
awaiting: user response

## Tests

### 1. Operator authorization configuration for taste-ingestion paths
expected: Only authorized operators can create taste rules that affect all audit verdicts system-wide
result: [pending]

### 2. Custom bookmark emoji creation on Discord server
expected: Custom bookmark emoji exists on server and ID is configured
result: [pending]

### 3. X/LinkedIn burner cookie export
expected: Cookie file exists at configured path with valid session cookies
result: [pending]

### 4. External #announcements channel access
expected: Bot can read messages from external #announcements channel via DISCORD_RELAY_SOURCE_CHANNEL_ID
result: [pending]

## Summary

total: 4
passed: 0
issues: 0
pending: 4
skipped: 0
blocked: 0

## Gaps

- CR-02: DM taste-ingestion path has no operator authorization — any DM user can create system-wide taste rules
- CR-04: Keyword command taste-ingestion path has no operator authorization — any training-channel user can create system-wide taste rules
- CR-01 partial: social cookie path has isSafeCookiePath() but lacks realpathSync symlink resolution (WR-06)
- Bookmark emoji must be manually created on Discord server and BOOKMARK_EMOJI_ID configured
- X/LinkedIn burner cookies must be manually exported to SOCIAL_COOKIES_PATH
- External #announcements channel ID must be configured in DISCORD_RELAY_SOURCE_CHANNEL_ID
