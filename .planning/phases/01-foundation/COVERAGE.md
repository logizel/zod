# Phase 1 — External API Coverage

**Phase:** 01-foundation
**Decided:** 2026-10-15

Phase 1 integrates external services (PocketBase server plus binary, Turso cloud, Cloudflare tunnel plus Access plus Pages, Oracle VM). INTEGRATE is the default; every OPT-OUT carries a one-line reason.

| Capability | Verdict | Reason |
|---|---|---|
| PocketBase server binary (ARM64, loopback-only) plus JS SDK 0.28 line | INTEGRATE | Hot memory for all five collections plus realtime-ready auth store |
| Turso cloud database plus libsql remote client | INTEGRATE | Off-server cold ledger plus taste rules surviving VM reclaim |
| Cloudflare tunnel via apt cloudflare-main | INTEGRATE | Only ingress with zero open inbound ports |
| Cloudflare Zero Trust Access owner-only rule | INTEGRATE | Reject-before-render gate on shell plus future stream endpoints |
| Cloudflare Pages static deploy | INTEGRATE | Hosts the Phase 1 locked shell so the VM serves zero dashboard bytes |
| Oracle Cloud Ampere VM plus block volume | INTEGRATE | 24/7 host; block volume holds pb_data plus backups across rebuilds |
| External dead-man watchdog pings | INTEGRATE | Dual-heartbeat silence alerting; provider under agent's discretion with env-plumbed URL |
| S3-compatible object storage for nightly backups | INTEGRATE | Holds consistent sqlite snapshots off-VM; target under agent's discretion with env-plumbed credentials |
| Discord bot gateway | OPT-OUT | Gateway code arrives with Phase 4 and Phase 6; Phase 1 ships only the bot skeleton entry |
| GitHub Models, Groq, SambaNova, and overflow LLM vendors | OPT-OUT | LLM ladder is Phase 3 scope; no model calls exist in Phase 1 |
| Jina Reader and headless browser automation | OPT-OUT | Sanitizer plus shared browser is Phase 2 scope; Phase 1 reserves the tab-count constraint only |
| X and LinkedIn session-cookie polling | OPT-OUT | Social ingestion is Phase 6 scope behind its own session-posture gate |
| Job-board and event-portal APIs plus RSS | OPT-OUT | Poll logic lands in Phase 2 through Phase 5; Phase 1 builds only the scheduler skeleton cadences |
