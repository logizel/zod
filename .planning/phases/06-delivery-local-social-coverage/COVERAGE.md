# API Coverage — Discord API (via discord.js v14)

> Full coverage by default. Opt-outs are explicit, reasoned decisions.

| capability | decision | reason |
|---|---|---|
| messageReactionAdd (bookmark) | INTEGRATE | Core Phase 6 feature (UI-02, D-05) |
| messageReactionAdd (taste rule ingestion) | INTEGRATE | Core Phase 6 feature (MEM-04, D-11) |
| channel.messages.fetch (relay polling) | INTEGRATE | Core Phase 6 feature (ING-04, D-04) |
| channel.send (relay posts) | INTEGRATE | Core Phase 6 feature (ING-04) |
| channel.send (reminder posts) | INTEGRATE | Core Phase 6 feature (UI-02, D-06) |
| channel.send (taste rule confirmation) | INTEGRATE | Core Phase 6 feature (MEM-04, D-11) |
| messageCreate (keyword command ingestion) | INTEGRATE | Core Phase 6 feature (MEM-04, D-11) |
| DM handling (DM taste rule ingestion) | INTEGRATE | Core Phase 6 feature (MEM-04, D-11) |
| GuildMessageReactions intent | INTEGRATE | Required for reaction events (Pitfall 1) |
| User DM via gateway | OPT-OUT | not needed — D-11 path 3 uses existing DM channel, no special gateway handling |
