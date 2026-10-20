// Local-only dashboard proxy (261020-nea).
//
// Serves apps/dashboard/index.html with its hard-coded https://dash.example.com
// origin rewritten to this loopback origin, and forwards /api/* to the
// dashboard server on 127.0.0.1:3000 while injecting the Cloudflare Access
// owner header the application-layer gate expects.
//
// Loopback only: bind 127.0.0.1:8080 and never 0.0.0.0. This harness is for
// local development; production stays behind Cloudflare Tunnel + Zero Trust.
//
// node: built-ins only — no workspace imports, no dependencies.
import { createServer, request } from 'node:http';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const INDEX_PATH = resolve(ROOT, 'apps/dashboard/index.html');
const PORT = 8080;
const DASHBOARD_PORT = 3000;
const OWNER = process.env.ACCESS_OWNER_EMAIL || 'owner@example.com';

function json(res, status, payload) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(payload));
}

const server = createServer((req, res) => {
  const requestUrl = req.url ?? '/';
  const pathname = requestUrl.split('?')[0] ?? '/';

  if (pathname === '/' || pathname === '/index.html') {
    let html;
    try {
      // Read fresh per request so editing the dashboard HTML never requires a
      // proxy restart.
      html = readFileSync(INDEX_PATH, 'utf8');
    } catch {
      res.writeHead(500, { 'content-type': 'text/plain; charset=utf-8' });
      res.end('dashboard html not found');
      return;
    }
    html = html.replaceAll('https://dash.example.com', `http://127.0.0.1:${PORT}`);
    res.writeHead(200, {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'no-store',
    });
    res.end(html);
    return;
  }

  if (pathname.startsWith('/api/')) {
    const headers = {
      ...req.headers,
      host: `127.0.0.1:${DASHBOARD_PORT}`,
      // Derived only from the resolved owner identity — never from a request
      // header, so local clients cannot spoof another identity.
      'cf-access-authenticated-user-email': OWNER,
    };

    const upstream = request(
      {
        host: '127.0.0.1',
        port: DASHBOARD_PORT,
        // Forward req.url verbatim so query strings survive.
        path: requestUrl,
        method: req.method,
        headers,
      },
      (upstreamRes) => {
        res.writeHead(upstreamRes.statusCode || 502, upstreamRes.headers);
        // Flush headers immediately, then pipe without buffering so SSE
        // frames reach the browser as soon as they arrive.
        res.flushHeaders();
        upstreamRes.pipe(res);
      },
    );

    upstream.on('error', () => {
      if (!res.headersSent) {
        json(res, 502, { error: 'upstream unavailable' });
      } else {
        res.destroy();
      }
    });

    // Client-side abort: stop the upstream request so SSE handlers and PB
    // subscriptions are released by the dashboard server.
    req.on('aborted', () => upstream.destroy());
    res.on('close', () => {
      if (!res.writableEnded) upstream.destroy();
    });

    req.pipe(upstream);
    return;
  }

  json(res, 404, { error: 'not found' });
});

function closeServer() {
  server.close(() => process.exit(0));
  // Do not let an open SSE client hold the process past a terminating signal.
  server.closeAllConnections?.();
  setTimeout(() => process.exit(0), 1000).unref();
}

process.on('SIGINT', closeServer);
process.on('SIGTERM', closeServer);

server.listen(PORT, '127.0.0.1', () => {
  // dev-local adds its own [proxy] prefix; no per-request logging.
  console.log(`listening on http://127.0.0.1:${PORT} (owner ${OWNER})`);
});
