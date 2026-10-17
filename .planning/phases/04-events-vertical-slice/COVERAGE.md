# Discord Gateway API Coverage Matrix — Phase 4

Enumerates the Discord Gateway capability surface integrated by Phase 4. `INTEGRATE` is the default; every `OPT-OUT` carries a one-line reason. A second integration against the same need starts from the same full-coverage baseline.

| capability | decision | reason |
|---|---|---|
| login (bot token auth via discord.js Client.login) | INTEGRATE | Required to establish Discord Gateway connection for alert posting |
| gateway_connect (WebSocket gateway connection with reconnect/sharding) | INTEGRATE | Required for real-time Discord presence and channel access |
| fetch_channel (resolve TextChannel by ID or name match) | INTEGRATE | Required to route audit cards to #🔥-priority-sys-cp-sec, #💻-online-1lakh-plus, #📋-events-general |
| send_message (post EmbedBuilder to TextChannel via channel.send) | INTEGRATE | Core delivery mechanism — audit cards land in Discord |
| embed_builder (EmbedBuilder audit card per UI-01) | INTEGRATE | Required — structured embed with title, organizer, dates, prize breakdown, merged links, 1-line audit |
| ready_event (bot ready detection before posting) | INTEGRATE | Confirms gateway connection before router service posts audit cards |
| guild_messages (GatewayIntentBits.GuildMessages = 512) | INTEGRATE | Standard intent for guild channel access and messaging |
| reaction_listen (MessageReaction add/remove events) | OPT-OUT | Deferred to Phase 6 (UI-02 bookmarks, reminders) |
| message_content (GatewayIntentBits.MessageContent = 32768, privileged) | OPT-OUT | Phase 4 only posts audit cards; does not read Discord messages; intent toggle deferred if message reading is needed later |
| message_reactions (reaction event dispatch) | OPT-OUT | Deferred to Phase 6 (bookmark reactions on audit cards) |
