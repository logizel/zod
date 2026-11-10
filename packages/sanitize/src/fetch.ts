import { fetchViaJina, JinaFetchError } from './jina.js';
import { sanitizeHtml, sanitizeMarkdown } from './strip.js';
import { fetchViaBrowser as defaultFetchViaBrowser } from '@zod/browser';

interface FacadeResult {
  markdown: string;
  capped: boolean;
  source: 'jina' | 'browser';
}

type BrowserFetcher = (url: string) => Promise<string>;

/** Fine-grained fetch/sanitize signal for the machine-glass feed. */
export interface SanitizeEvent {
  tool: 'fetch.jina' | 'fetch.browser' | 'sanitize.jina' | 'sanitize.browser';
  phase: 'fetch' | 'sanitize';
  status: 'start' | 'ok' | 'error';
  duration_ms?: number;
  detail?: string;
  chars?: number;
  capped?: boolean;
}

export type SanitizeObserver = (event: SanitizeEvent) => void;

let jinaCoolingUntil = 0;

function isPrivateHost(host: string): boolean {
  const h = host.toLowerCase();
  if (h === 'localhost' || h === '::1' || h === '0.0.0.0') return true;
  const v4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(h);
  if (v4) {
    const [a, b] = [Number(v4[1]), Number(v4[2])];
    if (a === 127) return true;
    if (a === 10) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 0) return true;
  }
  if (h.startsWith('fe80') || h.startsWith('fc') || h.startsWith('fd') || h.startsWith('::')) {
    return true;
  }
  return false;
}

export function validateUrl(raw: string): URL {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    throw new Error('fetch: invalid URL');
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') {
    throw new Error('fetch: protocol must be http or https');
  }
  if (isPrivateHost(u.hostname)) {
    throw new Error('fetch: private/loopback host refused (SSRF guard)');
  }
  const port = u.port;
  if (port !== '' && port !== '80' && port !== '443') {
    throw new Error('fetch: non-default port refused');
  }
  return u;
}

function resolveBrowserFetcher(opts?: unknown): BrowserFetcher {
  if (typeof opts === 'function') return opts as BrowserFetcher;
  const o = opts as { fetchViaBrowser?: BrowserFetcher } | undefined;
  if (o && typeof o.fetchViaBrowser === 'function') return o.fetchViaBrowser;
  return defaultFetchViaBrowser;
}

function resolveObserver(opts?: unknown): SanitizeObserver | undefined {
  if (typeof opts === 'function') return undefined; // legacy browser-fetcher form
  const o = opts as { onEvent?: SanitizeObserver } | undefined;
  return typeof o?.onEvent === 'function' ? o.onEvent : undefined;
}

export async function fetch(url: string, opts?: unknown): Promise<FacadeResult> {
  const u = validateUrl(url);
  const normalized = u.toString();
  const browserFetcher = resolveBrowserFetcher(opts);
  const observer = resolveObserver(opts);
  const emit = (event: SanitizeEvent): void => {
    try {
      observer?.(event);
    } catch {
      // Observability must never break fetching.
    }
  };
  const runSanitize = (
    tool: 'sanitize.jina' | 'sanitize.browser',
    sanitize: () => { markdown: string; capped: boolean },
  ): { markdown: string; capped: boolean } => {
    emit({ tool, phase: 'sanitize', status: 'start' });
    const startedAt = Date.now();
    try {
      const result = sanitize();
      emit({
        tool,
        phase: 'sanitize',
        status: 'ok',
        duration_ms: Date.now() - startedAt,
        chars: result.markdown.length,
        capped: result.capped,
      });
      return result;
    } catch (err) {
      emit({
        tool,
        phase: 'sanitize',
        status: 'error',
        duration_ms: Date.now() - startedAt,
        detail: String(err),
      });
      throw err;
    }
  };

  // Throttle cooling: park Jina path.
  if (Date.now() < jinaCoolingUntil) {
    emit({ tool: 'fetch.browser', phase: 'fetch', status: 'start', detail: 'jina cooling' });
    const browserStarted = Date.now();
    try {
      const html = await browserFetcher(normalized);
      emit({
        tool: 'fetch.browser',
        phase: 'fetch',
        status: 'ok',
        duration_ms: Date.now() - browserStarted,
        detail: 'jina cooling fallback',
      });
      const sanitized = runSanitize('sanitize.browser', () => sanitizeHtml(html));
      return { markdown: sanitized.markdown, capped: sanitized.capped, source: 'browser' };
    } catch (err) {
      emit({
        tool: 'fetch.browser',
        phase: 'fetch',
        status: 'error',
        duration_ms: Date.now() - browserStarted,
        detail: String(err),
      });
      throw err;
    }
  }

  emit({ tool: 'fetch.jina', phase: 'fetch', status: 'start' });
  const jinaStarted = Date.now();
  try {
    const body = await fetchViaJina(normalized);
    emit({
      tool: 'fetch.jina',
      phase: 'fetch',
      status: 'ok',
      duration_ms: Date.now() - jinaStarted,
      chars: body.length,
    });
    const sanitized = runSanitize('sanitize.jina', () => sanitizeMarkdown(body));
    return { markdown: sanitized.markdown, capped: sanitized.capped, source: 'jina' };
  } catch (err) {
    if (err instanceof JinaFetchError && err.throttle) {
      jinaCoolingUntil = Date.now() + 60_000;
    }
    emit({
      tool: 'fetch.jina',
      phase: 'fetch',
      status: 'error',
      duration_ms: Date.now() - jinaStarted,
      detail: String(err),
    });
    // Browser fallback.
    emit({ tool: 'fetch.browser', phase: 'fetch', status: 'start', detail: 'jina failed' });
    const browserStarted = Date.now();
    try {
      const html = await browserFetcher(normalized);
      emit({
        tool: 'fetch.browser',
        phase: 'fetch',
        status: 'ok',
        duration_ms: Date.now() - browserStarted,
        detail: 'jina fallback',
      });
      const sanitized = runSanitize('sanitize.browser', () => sanitizeHtml(html));
      return { markdown: sanitized.markdown, capped: sanitized.capped, source: 'browser' };
    } catch (browserErr) {
      emit({
        tool: 'fetch.browser',
        phase: 'fetch',
        status: 'error',
        duration_ms: Date.now() - browserStarted,
        detail: String(browserErr),
      });
      throw browserErr;
    }
  }
}

export function _resetJinaCoolingForTests(): void {
  jinaCoolingUntil = 0;
}

export { isPrivateHost as _isPrivateHostForTests };
