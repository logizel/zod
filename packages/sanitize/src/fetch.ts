import { fetchViaJina, JinaFetchError } from './jina.js';
import { sanitizeHtml, sanitizeMarkdown } from './strip.js';
import { fetchViaBrowser } from '@zod/browser';

interface FacadeResult {
  markdown: string;
  capped: boolean;
  source: 'jina' | 'browser';
}

let jinaCoolingUntil = 0;

function isPrivateHost(host: string): boolean {
  const h = host.toLowerCase();
  if (h === 'localhost' || h === '::1' || h === '0.0.0.0') return true;
  // IPv4
  const v4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(h);
  if (v4) {
    const [a, b] = [Number(v4[1]), Number(v4[2])];
    if (a === 127) return true;
    if (a === 10) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 0) return true;
    if (a === 169 && b === 254) return true;
  }
  if (h.startsWith('fe80') || h.startsWith('fc') || h.startsWith('fd') || h.startsWith('::')) {
    return true;
  }
  return false;
}

function validateUrl(raw: string): URL {
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

export async function fetch(url: string): Promise<FacadeResult> {
  const u = validateUrl(url);
  const normalized = u.toString();

  // Throttle cooling: park Jina path.
  if (Date.now() < jinaCoolingUntil) {
    const html = await fetchViaBrowser(normalized);
    const sanitized = sanitizeHtml(html);
    return { markdown: sanitized.markdown, capped: sanitized.capped, source: 'browser' };
  }

  try {
    const body = await fetchViaJina(normalized);
    const sanitized = sanitizeMarkdown(body);
    return { markdown: sanitized.markdown, capped: sanitized.capped, source: 'jina' };
  } catch (err) {
    if (err instanceof JinaFetchError && err.throttle) {
      jinaCoolingUntil = Date.now() + 60_000;
    }
    // Browser fallback.
    const html = await fetchViaBrowser(normalized);
    const sanitized = sanitizeHtml(html);
    return { markdown: sanitized.markdown, capped: sanitized.capped, source: 'browser' };
  }
}
