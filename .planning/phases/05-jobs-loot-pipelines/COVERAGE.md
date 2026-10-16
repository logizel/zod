# Phase 5 — API Coverage Matrix

**Produced by:** plan-phase (API-coverage checkpoint fired: `detected=true`)
**Scope:** every external API / SDK / service this phase integrates or deliberately excludes — job sources, loot watchlist, and pipeline services. Full coverage by default; every non-integrated capability is an explicit, reasoned OPT-OUT.

| Capability | Decision | Reason |
|---|---|---|
| Greenhouse Job Board API — board + single-job JSON (boards-api.greenhouse.io) | INTEGRATE | ING-03; free unauthenticated JSON carries title, location, and full description; listing feeds the tick, JSON-direct detail feeds the auditor (D-01) |
| Lever Postings API — listing (api.lever.co and api.eu.lever.co, `mode=json`) | INTEGRATE | ING-03; public JSON listing with location/commitment metadata (D-01) |
| Ashby Job Board API — posting-api/job-board JSON listing (api.ashbyhq.com) | INTEGRATE | ING-03; public JSON listing; description is HTML, stripped to text before audit (D-01) |
| HN Algolia API — thread search + item tree (hn.algolia.com/api/v1) | INTEGRATE | D-01 "HN Who is hiring?" monthly thread; free structured API; `created_at_i` watermark keeps re-polls cheap |
| Workday CXS listing JSON (POST `/wday/cxs/{tenant}/{site}/jobs`) | INTEGRATE | D-03; cxs-first per research A1, shared browser reserved for JS-rendered detail fallback |
| Cutshort listing pages (server-rendered) | INTEGRATE | D-01 aggregator; server-rendered scrape through the shared browser queue; pagination bounded per poll |
| Cuvette listing/detail pages | INTEGRATE | D-01 aggregator; public detail pages per research A2 with browser-mode fallback if surfaces degrade for logged-out pollers |
| startup.jobs feed (XML/RSS) | INTEGRATE | Research aggregator alternate; dependency-free parse (native fetch + cheerio xmlMode) |
| Vendor pages — CNCF/LF, AWS Student Rewards, MS/Azure, GitHub Education, Oracle | INTEGRATE | D-12 curated watchlist; config-driven URL + parser mode per entry, polled at low cadence (research A5) |
| Jina Reader API (r.jina.ai) | INTEGRATE | Existing Phase 2 fetch facade path for non-JSON detail pages (fallback remains the shared browser) |
| LLM vendors — Groq, GitHub Models, SambaNova, Mistral, Z.ai, NVIDIA, OpenRouter | INTEGRATE | Existing LlmRouter ladder, now actually driven for STEP_2 audits by the new orchestrator drain |
| Discord API — bot Gateway, channel resolution, embed posting | INTEGRATE | Existing router-service; env-configured channel IDs canonical for the three new channels (jobs sys/cloud, jobs general, loot) |
| ATS application-submission endpoints (Greenhouse/Lever/Ashby apply POST) | OPT-OUT | The system never auto-applies; alerts carry direct apply links only — discovery + routing is the project scope, not application automation |
| YC Work-at-a-Startup direct polling | OPT-OUT | Login-walled + ToS risk (research A3, recommendation: do not scrape in v1); YC-startup coverage retained via HN Who-is-hiring, D-02 auto-learned ATS boards, and startup.jobs; revisit post-phase |
| Wellfound direct polling | OPT-OUT | Login wall (research A4); deferrable from v1 without breaking ING-03 acceptance; seed + auto-learn boards carry startup coverage |
| X (Twitter) and LinkedIn APIs | OPT-OUT | Phase 6 social scope (ING-04/ING-05); burner-cookie human pacing is not part of this phase |
| LLM fine-tuning / batch inference APIs | OPT-OUT | Zero-monthly-cost constraint; chat completions through the existing free-tier ladder only |
| Cloudflare Tunnel API and Zero Trust Access API | OPT-OUT | Phase 7 dashboard scope (DSH-01..DSH-04); no inbound surface exists yet |
