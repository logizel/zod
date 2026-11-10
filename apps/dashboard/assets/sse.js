// Shared SSE client: one EventSource per page, exponential backoff + jitter,
// staleness detection (90s without any message) for the banner.
(function () {
  'use strict';

  const STALE_AFTER_MS = 90_000;
  const MAX_BACKOFF_MS = 30_000;

  let es = null;
  let handlers = {};
  let backoff = 1000;
  let lastEventAt = 0;
  let reconnectTimer = null;
  let staleTimer = null;
  let connected = false;
  let stopped = false;

  function status(state) {
    if (typeof handlers.onStatus === 'function') {
      handlers.onStatus({
        state,
        lastEventAgeMs: lastEventAt ? Date.now() - lastEventAt : null,
      });
    }
  }

  function clearReconnect() {
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
  }

  function open() {
    if (stopped || es) return;
    clearReconnect();
    status('connecting');
    try {
      es = new EventSource('/api/stream');
    } catch {
      scheduleReconnect();
      return;
    }

    es.onopen = function () {
      connected = true;
      backoff = 1000;
      lastEventAt = Date.now();
      status('connected');
    };

    es.onmessage = function (event) {
      lastEventAt = Date.now();
      connected = true;
      if (typeof handlers.onStatus === 'function') status('connected');
      let data;
      try {
        data = JSON.parse(event.data);
      } catch {
        return;
      }
      if (!data || typeof data !== 'object') return;
      if (data.type === 'connected') {
        if (typeof handlers.onConnected === 'function') handlers.onConnected(data);
      } else if (data.type === 'delta') {
        if (typeof handlers.onDelta === 'function') handlers.onDelta(data);
      } else if (data.type === 'heartbeat') {
        if (typeof handlers.onHeartbeat === 'function') handlers.onHeartbeat(data);
      }
    };

    es.onerror = function () {
      connected = false;
      if (es) {
        try {
          es.close();
        } catch {
          /* already closed */
        }
        es = null;
      }
      status('reconnecting');
      scheduleReconnect();
    };
  }

  function scheduleReconnect() {
    if (stopped || reconnectTimer) return;
    const delay = backoff + Math.random() * 800;
    backoff = Math.min(backoff * 2, MAX_BACKOFF_MS);
    reconnectTimer = setTimeout(function () {
      reconnectTimer = null;
      open();
    }, delay);
  }

  function checkStale() {
    if (!connected || !lastEventAt) return;
    const stale = Date.now() - lastEventAt > STALE_AFTER_MS;
    if (stale) status('stale');
  }

  function connect(opts) {
    handlers = opts || {};
    stopped = false;
    lastEventAt = Date.now();
    if (!staleTimer) staleTimer = setInterval(checkStale, 10_000);
    open();
  }

  function close() {
    stopped = true;
    clearReconnect();
    if (staleTimer) {
      clearInterval(staleTimer);
      staleTimer = null;
    }
    if (es) {
      try {
        es.close();
      } catch {
        /* noop */
      }
      es = null;
    }
    connected = false;
  }

  window.ZodSSE = {
    connect,
    close,
    isConnected: () => connected,
    lastEventAt: () => lastEventAt,
  };
})();
