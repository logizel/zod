// Read-only API client. Every endpoint is GET; mutation is impossible here.
(function () {
  'use strict';

  async function get(path, params) {
    const url = new URL(path, window.location.origin);
    if (params) {
      for (const [key, value] of Object.entries(params)) {
        if (value === '' || value === null || value === undefined) continue;
        url.searchParams.set(key, String(value));
      }
    }
    const response = await fetch(url.toString(), {
      method: 'GET',
      headers: { Accept: 'application/json' },
      cache: 'no-store',
    });
    if (!response.ok) {
      let message = 'HTTP ' + response.status;
      try {
        const body = await response.json();
        if (body && body.error) message = String(body.error);
      } catch {
        /* non-JSON error body */
      }
      const error = new Error(message);
      error.status = response.status;
      throw error;
    }
    return response.json();
  }

  window.ZodApi = {
    get,
    overview: () => get('/api/overview'),
    events: (params) => get('/api/machine/events', params),
    pools: () => get('/api/pools'),
    sources: () => get('/api/sources'),
    system: () => get('/api/system'),
    boards: (params) => get('/api/boards', params),
    telemetry: () => get('/api/telemetry'),
    auditOlder: (urlHash) => get('/api/audit/older', { url_hash: urlHash }),
  };
})();
