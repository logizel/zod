// Stream server entrypoint (D-01, D-05).
//
// parseEnv fail-fast gate first, then pino logger, createPbClient, then
// Node built-in http server on 127.0.0.1:3000 exposing:
//   GET /api/stream            SSE (telemetry + slots + machine events)
//   GET /api/boards            opportunity boards
//   GET /api/telemetry         raw agent_telemetry rows
//   GET /api/machine/events    cursor-paginated machine event log
//   GET /api/overview          kanban stage snapshot
//   GET /api/pools             provider × model pool health
//   GET /api/sources           adapter/source health
//   GET /api/system            process + scheduler + GC status
//   GET /flow /glass ...       static multi-page dashboard
// Owned by dashboard.service systemd unit (Restart=always).
//
// Read-only by construction: every route is GET/HEAD; there is no mutation
// endpoint and PocketBase writes live in the pipeline processes, not here.

import { createServer } from 'node:http';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseEnv, type Env } from '@zod/config';
import { createLogger } from '@zod/logger';
import { createPbClient, type HotEnv } from '@zod/db-hot';
import { clientExecutor, createTursoClient } from '@zod/db-cold';
import { SseHub } from './sse.js';
import { handleBoards, handleAuditOlder } from './boards.js';
import { handleMachineEvents } from './machine.js';
import { handleOverview } from './overview.js';
import { handlePools } from './pools.js';
import { handleSources } from './sources.js';
import { handleSystem } from './system.js';
import { handleStatic } from './static.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const DASHBOARD_DIR = resolve(HERE, '../../dashboard');
const ASSETS_DIR = resolve(DASHBOARD_DIR, 'assets');

type ServerResponse = import('node:http').ServerResponse;

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(body));
}

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
        getList?: (
          page: number,
          perPage: number,
          options?: unknown,
        ) => Promise<{ items: Array<Record<string, unknown>> }>;
        getFullList?: (options?: unknown) => Promise<Array<Record<string, unknown>>>;
      };
    },
    log,
    [],
    [],
    Number(env.SSE_VIEWER_CAP ?? 2),
  );
  hub.start();

  const server = createServer(async (req, res) => {
    // Read-only server: no POST/PUT/PATCH/DELETE surface at all.
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405, { Allow: 'GET, HEAD', 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'method not allowed' }));
      return;
    }

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
        sendJson(res, 503, { error: 'viewer capacity reached' });
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
      return;
    }

    if (pathname === '/api/boards') {
      // Fetch opportunities from PocketBase (hot store) and apply filters
      // server-side in handleBoards. Read-only: getFullList only, no writes.
      let rows: Array<Record<string, unknown>> = [];
      let tombstones: Array<Record<string, unknown>> = [];
      try {
        const records = await pb.collection('opportunities').getFullList<Record<string, unknown>>();
        rows = records as unknown as Array<Record<string, unknown>>;
      } catch {
        // WR-02: return 503 on upstream failure so clients can detect outage
        sendJson(res, 503, { error: 'upstream unavailable' });
        return;
      }
      try {
        const records = await pb.collection('tombstone_ledger').getFullList<Record<string, unknown>>();
        tombstones = records as unknown as Array<Record<string, unknown>>;
      } catch {
        // Optional mirror: the audit-log tab still renders opportunity rows.
      }
      handleBoards({ url: req.url ?? null }, res, { rows, tombstones });
      return;
    }

    if (pathname === '/api/telemetry') {
      // Glass view: raw agent_telemetry rows for the machine glass panel.
      // Read-only: getList only, no writes.
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
        sendJson(res, 200, { ts: Date.now(), rows });
      } catch {
        sendJson(res, 503, { error: 'upstream unavailable' });
      }
      return;
    }

    if (pathname === '/api/machine/events') {
      await handleMachineEvents({ url: req.url ?? null }, res, {
        pb: pb as unknown as Parameters<typeof handleMachineEvents>[2]['pb'],
      });
      return;
    }

    if (pathname === '/api/overview') {
      await handleOverview(res, {
        pb: pb as unknown as Parameters<typeof handleOverview>[1]['pb'],
      });
      return;
    }

    if (pathname === '/api/pools') {
      await handlePools(res, {
        pb: pb as unknown as Parameters<typeof handlePools>[1]['pb'],
      });
      return;
    }

    if (pathname === '/api/sources') {
      await handleSources(res, {
        pb: pb as unknown as Parameters<typeof handleSources>[1]['pb'],
      });
      return;
    }

    if (pathname === '/api/system') {
      await handleSystem(res, {
        pb: pb as unknown as Parameters<typeof handleSystem>[1]['pb'],
        hub: {
          get size() {
            return hub.size;
          },
          get capacity() {
            return hub.capacity;
          },
          get lastEventAgeMs() {
            return hub.lastEventAgeMs;
          },
        },
      });
      return;
    }

    if (pathname.startsWith('/api/audit/older')) {
      // Read-only point lookup into Turso cold tombstone_ledger (D-11).
      await handleAuditOlder({ url: req.url ?? null }, res, { db: coldDb });
      return;
    }

    // Static pages/assets: served from the same origin as /api/* so fetch and
    // SSE need no CORS or proxy. Asset paths are whitelisted; traversal is
    // rejected. Cloudflare Access gates these at the edge later.
    if (handleStatic(pathname, res, { dashboardDir: DASHBOARD_DIR, assetsDir: ASSETS_DIR })) {
      return;
    }

    sendJson(res, 404, { error: 'not found' });
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
