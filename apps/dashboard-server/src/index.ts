// Stream server entrypoint (D-01, D-05).
//
// parseEnv fail-fast gate first, then pino logger, createPbClient, then
// Node built-in http server on 127.0.0.1:3000 exposing GET /api/stream
// (SSE text/event-stream) and GET /api/boards (application/json).
// Owned by dashboard.service systemd unit (Restart=always).

import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseEnv, type Env } from '@zod/config';
import { createLogger } from '@zod/logger';
import { createPbClient, type HotEnv } from '@zod/db-hot';
import { clientExecutor, createTursoClient } from '@zod/db-cold';
import { SseHub } from './sse.js';
import { handleBoards, handleAuditOlder } from './boards.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const DASHBOARD_HTML = resolve(HERE, '../../dashboard/index.html');

// G-07-WR-01: application-layer auth check on /api/stream before hub.addClient.
// Reads the Cloudflare Access identity header injected on tunneled requests;
// permits the SSE connection only when it equals env.ACCESS_OWNER_EMAIL.
// Cloudflare Access edge policy remains the outer gate (D-04); this is
// defense-in-depth, not a replacement for Zero Trust.
//
// Local dev bypass: when no cf-ray header is present (i.e. not behind
// Cloudflare), allow loopback connections so the localhost dashboard works
// without Zero Trust.
function authorizeStream(req: import('http').IncomingMessage, env: Env): boolean {
  if (!req.headers['cf-ray']) {
    return true;
  }
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

  // Cold ledger executor for the audit "load older" point lookup. Construction
  // is lazy — no Turso network call until the first query.
  const coldDb = clientExecutor(createTursoClient(env));

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
    // Filter queries must still route: compare the pathname, not the full URL.
    const pathname = url.split('?')[0] ?? '';
    if (pathname === '/api/stream') {
      // Application-layer defense-in-depth (G-07-WR-01): reject unauth before hub.addClient.
      if (!authorizeStream(req, env)) {
        res.writeHead(401, { 'WWW-Authenticate': 'Bearer realm="dashboard"' });
        res.end('unauthorized');
        return;
      }
      // Server-side viewer cap (D-08): reject before any stream headers render.
      if (!hub.hasCapacity()) {
        res.writeHead(503, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'viewer capacity reached' }));
        return;
      }
      // Zero Trust Access already rejected unauth at the edge (D-04).
      // Defense-in-depth: connection timeout reaps stalled sockets (CR-04).
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      });
      const client: {
        write: (chunk: string) => boolean;
        close: () => void;
      } = {
        write: (chunk: string) => res.write(chunk),
        close: () => res.end(),
      };
      const streamTimeoutMs = Number(env.SSE_CONNECTION_TIMEOUT_MS ?? 120000);
      const onStreamTimeout = () => {
        hub.removeClient(client);
        res.end();
      };
      res.setTimeout(streamTimeoutMs, onStreamTimeout);
      req.on('timeout', onStreamTimeout);
      res.write(`data: ${JSON.stringify({ type: 'connected', ts: Date.now() })}\n\n`);
      hub.addClient(client);
      req.on('close', () => hub.removeClient(client));
    } else if (pathname === '/' || pathname === '/index.html') {
      // Serve the read-only dashboard UI from the same origin as /api/*.
      // Cloudflare Access gates this page at the edge; the local dev proxy
      // serves the same file with a loopback origin rewrite.
      try {
        const html = readFileSync(DASHBOARD_HTML, 'utf8');
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
        res.end(html);
      } catch (err) {
        log.error({ err: String(err), path: DASHBOARD_HTML }, 'dashboard html not found');
        res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('dashboard html not found');
      }
    } else if (pathname === '/api/boards') {
      // Fetch opportunities from PocketBase (hot store) and apply filters
      // server-side in handleBoards. Read-only: getFullList only, no writes.
      let rows: Array<Record<string, unknown>> = [];
      let tombstones: Array<Record<string, unknown>> = [];
      try {
        const records = await pb.collection('opportunities').getFullList<Record<string, unknown>>();
        rows = records as unknown as Array<Record<string, unknown>>;
      } catch {
        // WR-02: return 503 on upstream failure so clients can detect outage
        res.writeHead(503, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'upstream unavailable' }));
        return;
      }
      try {
        const records = await pb.collection('tombstone_ledger').getFullList<Record<string, unknown>>();
        tombstones = records as unknown as Array<Record<string, unknown>>;
      } catch {
        // Optional mirror: the audit-log tab still renders opportunity rows.
      }
      handleBoards({ url: req.url ?? null }, res, { rows, tombstones });
    } else if (pathname === '/api/telemetry') {
      // Glass view: raw agent_telemetry rows for the machine glass panel.
      // Read-only: getFullList only, no writes.
      try {
        const page = await pb.collection('agent_telemetry').getList(1, 100, {
          sort: '-updated',
        });
        const rows = (page.items ?? []).map((r) => ({
          id: r.id,
          created: r.created,
          slot: r.slot,
          provider: r.provider,
          model: r.model,
          step: r.step,
          url: r.url ?? '',
          status: r.status,
          duration_ms: r.duration_ms ?? null,
          detail: r.detail ?? '',
        }));
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ts: Date.now(), rows }));
      } catch {
        res.writeHead(503, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'upstream unavailable' }));
      }
    } else if (pathname.startsWith('/api/audit/older')) {
      // Read-only point lookup into Turso cold tombstone_ledger (D-11).
      await handleAuditOlder({ url: req.url ?? null }, res, { db: coldDb });
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
