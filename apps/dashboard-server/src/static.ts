// Static multi-page dashboard routing.
//
// The dashboard is a true multi-page app: every sidebar entry is its own HTML
// file served by this process, so there is no client-side router to keep in
// sync and no build step. Assets are whitelisted by extension and path shape;
// no request can escape the dashboard directory.

import { readFileSync } from 'node:fs';
import { extname, resolve, sep } from 'node:path';

/** Page route -> file name (true multi-page app, no client-side router). */
export const PAGES: Record<string, string> = {
  '/': 'index.html',
  '/index.html': 'index.html',
  '/flow': 'flow.html',
  '/flow.html': 'flow.html',
  '/glass': 'glass.html',
  '/glass.html': 'glass.html',
  '/pools': 'pools.html',
  '/pools.html': 'pools.html',
  '/boards': 'boards.html',
  '/boards.html': 'boards.html',
  '/audit': 'audit.html',
  '/audit.html': 'audit.html',
  '/sources': 'sources.html',
  '/sources.html': 'sources.html',
  '/system': 'system.html',
  '/system.html': 'system.html',
};

/** Asset extensions the dashboard is allowed to serve. */
export const ASSET_TYPES: Record<string, string> = {
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};

export interface StaticRes {
  writeHead: (status: number, headers?: Record<string, string>) => void;
  end: (body?: string | Uint8Array) => void;
}

export interface StaticRoots {
  dashboardDir: string;
  assetsDir: string;
}

/** Resolve a page route to a file path; null when the route is unknown. */
export function resolvePage(roots: StaticRoots, pathname: string): string | null {
  const file = PAGES[pathname];
  if (!file) return null;
  return resolve(roots.dashboardDir, file);
}

/**
 * Resolve `/assets/<name>` to a whitelisted file. Rejects traversal,
 * subdirectories, and unapproved extensions.
 */
export function resolveAsset(
  roots: StaticRoots,
  pathname: string,
): { filePath: string; contentType: string } | null {
  if (!pathname.startsWith('/assets/')) return null;
  let name = '';
  try {
    name = decodeURIComponent(pathname.slice('/assets/'.length));
  } catch {
    return null;
  }
  if (!name || name.includes('..') || name.includes('/') || name.includes('\\')) {
    return null;
  }
  const contentType = ASSET_TYPES[extname(name).toLowerCase()];
  if (!contentType) return null;
  const filePath = resolve(roots.assetsDir, name);
  if (!filePath.startsWith(`${roots.assetsDir}${sep}`)) return null;
  return { filePath, contentType };
}

function send(res: StaticRes, status: number, headers: Record<string, string>, body?: string | Uint8Array): void {
  res.writeHead(status, headers);
  res.end(body);
}

/** Read and serve one file; 404 when it is missing. */
export function serveFile(
  res: StaticRes,
  filePath: string,
  contentType: string,
): boolean {
  try {
    const body = readFileSync(filePath);
    send(
      res,
      200,
      {
        'Content-Type': contentType,
        'Content-Length': String(body.byteLength),
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
      },
      body,
    );
    return true;
  } catch {
    send(res, 404, { 'Content-Type': 'application/json' }, JSON.stringify({ error: 'not found' }));
    return false;
  }
}

/**
 * Handle a static page or asset request. Returns true when the request was
 * handled (including a 404 for a bad asset path).
 */
export function handleStatic(
  pathname: string,
  res: StaticRes,
  roots: StaticRoots,
): boolean {
  if (pathname.startsWith('/assets/')) {
    const asset = resolveAsset(roots, pathname);
    if (!asset) {
      send(res, 404, { 'Content-Type': 'application/json' }, JSON.stringify({ error: 'not found' }));
      return true;
    }
    serveFile(res, asset.filePath, asset.contentType);
    return true;
  }

  const page = resolvePage(roots, pathname);
  if (page) {
    serveFile(res, page, 'text/html; charset=utf-8');
    return true;
  }

  if (pathname === '/favicon.ico') {
    send(res, 204, { 'Cache-Control': 'no-store' });
    return true;
  }

  return false;
}
