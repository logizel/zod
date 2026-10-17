// Stream server entrypoint (D-01, D-05).
//
// parseEnv fail-fast gate first, then pino logger, createPbClient, then
// Node built-in http server on 127.0.0.1:3000 exposing GET /api/stream
// (SSE text/event-stream) and GET /api/boards (application/json).
// Owned by dashboard.service systemd unit (Restart=always).

import { createServer } from 'node:http';
import { parseEnv } from '@zod/config';
import { createLogger } from '@zod/logger';
import { createPbClient } from '@zod/db-hot';
import type { HotEnv } from '@zod/db-hot/client';
import { SseHub } from './sse.js';
import { handleBoards, handleAuditOlder, type StatementExecutor } from './boards.js';

/** In-memory statement executor — no Turso configured yet. Read-only stub. */
const STUB_DB: StatementExecutor = {
  execute: async (_sql: string, _args?: unknown[]) => ({ rows: [] }),
};

async function main(): Promise<void> {
  // Fail-fast env gate first (D-06).
  const env = parseEnv();
  const log = createLogger(env.LOG_LEVEL);

  // Shared PocketBase service-account client (loopback PB on 127.0.0.1:8090).
  const pb = await createPbClient(env as HotEnv);

  // Single shared SSE hub: one PB subscription, fan-out to all viewers (D-06).
  const hub = new SseHub(pb as unknown as { collection: (name: string) => { subscribe: (event: string, handler: (e: unknown) => void) => { unsubscribe?: () => void } } }, log);
  hub.start();

  const server = createServer((req, res) => {
    const url = req.url ?? '';
    if (url === '/api/stream') {
      // Zero Trust Access already rejected unauth at the edge (D-04).
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      });
      const client: { write: (chunk: string) => boolean; close: () => void } = {
        write: (chunk: string) => res.write(chunk),
        close: () => res.end(),
      };
      hub.addClient(client);
      res.write(`data: ${JSON.stringify({ type: 'connected', ts: Date.now() })}\n\n`);
      req.on('close', () => hub.removeClient(client));
    } else if (url === '/api/boards') {
      // Fetch opportunities from PocketBase (hot store) and apply filters
      // server-side in handleBoards. Read-only: getFullList only, no writes.
      let rows: Array<Record<string, unknown>> = [];
      try {
        const records = await pb.collection('opportunities').getFullList<Record<string, unknown>>();
        rows = records as unknown as Array<Record<string, unknown>>;
      } catch {
        rows = [];
      }
      handleBoards(req, res, { rows });
    } else if (url.startsWith('/api/audit/older')) {
      // Read-only point lookup into Turso cold tombstone_ledger (D-11).
      handleAuditOlder(req, res, { db: STUB_DB });
    } else {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'not found' }));
    }
  });

  server.listen(3000, '127.0.0.1');
  log.info({ component: 'dashboard-server', port: 3000, bind: '127.0.0.1' }, 'stream server boot ok');
}

main().catch((err) => {
  console.error('stream server boot failed', err);
  process.exit(1);
});
