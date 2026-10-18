// Stream server entrypoint (D-01, D-05).
//
// parseEnv fail-fast gate first, then pino logger, createPbClient, then
// Node built-in http server on 127.0.0.1:3000 exposing GET /api/stream
// (SSE text/event-stream) and GET /api/boards (application/json).
// Owned by dashboard.service systemd unit (Restart=always).

import { createServer } from 'node:http';
import { parseEnv, type Env } from '@zod/config';
import { createLogger } from '@zod/logger';
import { createPbClient, type HotEnv } from '@zod/db-hot';
import { SseHub } from './sse.js';
import { handleBoards, handleAuditOlder, type StatementExecutor } from './boards.js';

/** In-memory statement executor — no Turso configured yet. Read-only stub. */
const STUB_DB: StatementExecutor = {
  execute: async (_sql: string, _args?: unknown[]) => ({ rows: [] }),
};

// G-07-WR-01: application-layer auth check on /api/stream before hub.addClient.
// Reads the Cloudflare Access identity header injected on tunneled requests;
// permits the SSE connection only when it equals env.ACCESS_OWNER_EMAIL.
// Cloudflare Access edge policy remains the outer gate (D-04); this is
// defense-in-depth, not a replacement for Zero Trust.
function authorizeStream(req: import('http').IncomingMessage, env: Env): boolean {
  const email = req.headers['cf-access-authenticated-user-email'];
  if (!email || typeof email !== 'string' || email !== env.ACCESS_OWNER_EMAIL) {
    return false;
  }
  return true;
}

async function main(): Promise<void> {
  // Fail-fast env gate first (D-06).
  const env = parseEnv();
  const log = createLogger(env.LOG_LEVEL);

  // Shared PocketBase service-account client (loopback PB on 127.0.0.1:8090).
  const pb = await createPbClient(env as HotEnv);

  // Single shared SSE hub: one PB subscription, fan-out to all viewers (D-06).
  // Server-side viewer cap bounds SSE cost (D-08, Pitfall 13).
  const hub = new SseHub(
    pb as unknown as {
      collection: (name: string) => {
        subscribe: (event: string, handler: (e: unknown) => void) => {
          unsubscribe?: () => void;
        };
      };
    },
    log,
    [],
    [],
    Number(env.SSE_VIEWER_CAP ?? 2),
  );
  hub.start();

  const server = createServer(async (req, res) => {
    const url = req.url ?? '';
    if (url === '/api/stream') {
      // Application-layer defense-in-depth (G-07-WR-01): reject unauth before hub.addClient.
      if (!authorizeStream(req, env)) {
        res.writeHead(401, { 'WWW-Authenticate': 'Bearer realm="dashboard"' });
        res.end('unauthorized');
        return;
      }
      // Zero Trust Access already rejected unauth at the edge (D-04).
      // Defense-in-depth: connection timeout reaps stalled sockets (CR-04).
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      });
      const streamTimeoutMs = Number(env.SSE_CONNECTION_TIMEOUT_MS ?? 120000);
      const onStreamTimeout = () => {
        hub.removeClient(client);
        res.end();
      };
      res.setTimeout(streamTimeoutMs, onStreamTimeout);
      req.on('timeout', onStreamTimeout);
      const client: {
        write: (chunk: string) => boolean;
        close: () => void;
      } = {
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
        // WR-02: return 503 on upstream failure so clients can detect outage
        res.writeHead(503, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'upstream unavailable' }));
        return;
      }
      handleBoards({ url: req.url ?? null }, res, { rows });
    } else if (url.startsWith('/api/audit/older')) {
      // Read-only point lookup into Turso cold tombstone_ledger (D-11).
      handleAuditOlder({ url: req.url ?? null }, res, { db: STUB_DB });
    } else {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'not found' }));
    }
  });

  // Graceful shutdown on SIGTERM/SIGINT (WR-07).
  const shutdown = async () => {
    hub.stop();
    server.close(() => {
      log.info({ component: 'dashboard-server' }, 'stream server shut down gracefully');
      process.exit(0);
    });
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);

  server.listen(3000, '127.0.0.1');
  log.info({ component: 'dashboard-server', port: 3000, bind: '127.0.0.1' }, 'stream server boot ok');
}

main().catch((err) => {
  console.error('stream server boot failed', err);
  process.exit(1);
});
