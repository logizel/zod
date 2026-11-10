// Static routing: page map, asset whitelist, traversal rejection.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  ASSET_TYPES,
  PAGES,
  handleStatic,
  resolveAsset,
  resolvePage,
} from './static.js';

let root = '';
const roots = () =>
  ({ dashboardDir: join(root, 'dashboard'), assetsDir: join(root, 'dashboard', 'assets') }) as const;

function makeRes() {
  const state: { status: number; headers: Record<string, string>; body: string | Uint8Array } = {
    status: 0,
    headers: {},
    body: '',
  };
  return {
    state,
    writeHead(status: number, headers?: Record<string, string>) {
      state.status = status;
      state.headers = headers ?? {};
    },
    end(body?: string | Uint8Array) {
      state.body = body ?? '';
    },
    text() {
      return typeof state.body === 'string' ? state.body : Buffer.from(state.body).toString('utf8');
    },
  };
}

beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), 'zod-static-'));
  mkdirSync(join(root, 'dashboard', 'assets'), { recursive: true });
  for (const file of Object.values(PAGES)) {
    writeFileSync(join(root, 'dashboard', file), `<h1>${file}</h1>`);
  }
  writeFileSync(join(root, 'dashboard', 'assets', 'styles.css'), 'body{margin:0}');
  writeFileSync(join(root, 'dashboard', 'assets', 'shell.js'), 'export {};');
  writeFileSync(join(root, 'dashboard', 'assets', 'bookmark.svg'), '<svg/>');
  writeFileSync(join(root, 'secret.txt'), 'secret');
});

afterAll(() => {
  rmSync(root, { recursive: true, force: true });
});

describe('page map', () => {
  it('covers every sidebar route', () => {
    expect(Object.keys(PAGES).filter((key) => !key.endsWith('.html')).sort()).toEqual([
      '/',
      '/audit',
      '/boards',
      '/flow',
      '/glass',
      '/pools',
      '/sources',
      '/system',
    ]);
  });

  it('resolves a page path and rejects unknown routes', () => {
    expect(resolvePage(roots(), '/flow')).toBe(join(root, 'dashboard', 'flow.html'));
    expect(resolvePage(roots(), '/nope')).toBeNull();
  });
});

describe('asset whitelist', () => {
  it('accepts css/js/svg under /assets', () => {
    expect(resolveAsset(roots(), '/assets/styles.css')).toMatchObject({
      contentType: 'text/css; charset=utf-8',
    });
    expect(resolveAsset(roots(), '/assets/shell.js')?.filePath).toBe(
      join(root, 'dashboard', 'assets', 'shell.js'),
    );
    expect(resolveAsset(roots(), '/assets/bookmark.svg')?.contentType).toBe('image/svg+xml');
    expect(Object.keys(ASSET_TYPES)).toContain('.woff2');
  });

  it('rejects traversal, subdirectories, and unapproved extensions', () => {
    expect(resolveAsset(roots(), '/assets/../secret.txt')).toBeNull();
    expect(resolveAsset(roots(), '/assets/%2e%2e%2fsecret.txt')).toBeNull();
    expect(resolveAsset(roots(), '/assets/sub/styles.css')).toBeNull();
    expect(resolveAsset(roots(), '/assets/secret.txt')).toBeNull();
    expect(resolveAsset(roots(), '/assets/missing.css')?.filePath).toBeTruthy();
  });
});

describe('handleStatic', () => {
  it('serves a page with HTML content type', () => {
    const res = makeRes();
    expect(handleStatic('/glass', res, roots())).toBe(true);
    expect(res.state.status).toBe(200);
    expect(res.state.headers['Content-Type']).toBe('text/html; charset=utf-8');
    expect(res.text()).toBe('<h1>glass.html</h1>');
  });

  it('serves an asset with the right content type', () => {
    const res = makeRes();
    expect(handleStatic('/assets/styles.css', res, roots())).toBe(true);
    expect(res.state.status).toBe(200);
    expect(res.state.headers['Content-Type']).toBe('text/css; charset=utf-8');
    expect(res.text()).toBe('body{margin:0}');
  });

  it('returns 404 JSON for a bad asset path', () => {
    const res = makeRes();
    expect(handleStatic('/assets/../secret.txt', res, roots())).toBe(true);
    expect(res.state.status).toBe(404);
    expect(JSON.parse(res.text()).error).toBe('not found');
  });

  it('returns 404 for a missing page file', () => {
    const res = makeRes();
    const pageRoots = { dashboardDir: join(root, 'empty'), assetsDir: join(root, 'empty') };
    expect(handleStatic('/', res, pageRoots)).toBe(true);
    expect(res.state.status).toBe(404);
  });

  it('handles favicon with 204 and leaves unknown routes to the API router', () => {
    const favicon = makeRes();
    expect(handleStatic('/favicon.ico', favicon, roots())).toBe(true);
    expect(favicon.state.status).toBe(204);

    const unknown = makeRes();
    expect(handleStatic('/api/nope', unknown, roots())).toBe(false);
    expect(unknown.state.status).toBe(0);
  });
});
