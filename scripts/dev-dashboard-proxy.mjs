// Local-only dashboard proxy (261020-nea).
//
// Forwards every GET/HEAD request to the dashboard server on
// 127.0.0.1:3000 while injecting the Cloudflare Access owner header the
// application-layer gate expects. The dashboard is a true multi-page app, so
// pages, assets, and /api/* all take the same path — no local HTML rewriting
// and no route list to drift.
//
// Loopback only: bind 127.0.0.1:8080 and never 0.0.0.0. This harness is for
// local development; production stays behind Cloudflare Tunnel + Zero Trust.
//
// node: built-ins only — no workspace imports, no dependencies.
import { createServer, request } from 'node:http';

const PORT = 8080;
const DASHBOARD_PORT = 3000;
const OWNER = process.env.ACCESS_OWNER_EMAIL || 'owner@example.com';

function json(res, status, payload) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(payload));
}

const server = createServer((req, res) => {
  const requestUrl = req.url ?? '/';

  // Read-only local harness: the dashboard server has no mutation surface, and
  // the proxy should not invent one.
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405, { allow: 'GET, HEAD', 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: 'method not allowed' }));
    return;
  }

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
