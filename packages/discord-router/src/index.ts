// Package-level convenience exports. No top-level boot side effects: the
// production entrypoint is apps/bot/src/index.ts (see its ownership comment).
export { startGateway, getClient } from './gateway.js';
export { startRouterService, createRouterService } from './router-service.js';
export { startRelayService, createRelayService } from './relay.js';
export { createReminderTick, reminderTick } from './reminder.js';
