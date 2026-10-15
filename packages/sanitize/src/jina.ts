import { env } from '@zod/config';

export class JinaFetchError extends Error {
  throttle: boolean;
  constructor(message: string, throttle: boolean = false) {
    super(message);
    this.name = 'JinaFetchError';
    this.throttle = throttle;
  }
}

const JINA_BASE = 'https://r.jina.ai';

export async function fetchViaJina(url: string): Promise<string> {
  const headers: Record<string, string> = {
    Accept: 'text/plain',
    'X-Timeout': '25',
    'X-Retain-Links': 'all',
    'X-Retain-Images': 'none',
    'X-Remove-Selector': 'nav, footer, .sidebar, #ads',
  };
  // Never log the Authorization header value (T-02-02).
  headers['Authorization'] = `Bearer ${env.JINA_API_KEY}`;

  const res = await fetch(`${JINA_BASE}/${url}`, {
    method: 'GET',
    headers,
    signal: AbortSignal.timeout(30_000),
  });

  if (!res.ok) {
    const hasRetryAfter =
      typeof res.headers?.get === 'function' && res.headers.get('Retry-After') !== null;
    const throttle = res.status === 402 || res.status === 429 || hasRetryAfter;
    throw new JinaFetchError(`Jina fetch failed: HTTP ${res.status}`, throttle);
  }

  const body = (await res.text()) as string;

  if (body.length < 500) {
    throw new JinaFetchError(`Jina short body: ${body.length} chars`, false);
  }

  // Retry-After even on ok-ish is treated as throttle signal.
  const retryAfter =
    typeof res.headers?.get === 'function' ? res.headers.get('Retry-After') : null;
  if (retryAfter !== null) {
    throw new JinaFetchError('Jina throttled (Retry-After present)', true);
  }

  return body;
}
