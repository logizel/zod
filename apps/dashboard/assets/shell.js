// App shell: sidebar, header, live pill, staleness banner, shared formatting,
// event-row renderer, and polling helpers. Vanilla JS, no build step.
(function () {
  'use strict';

  const I = window.ZodIcons;
  const icon = I.icon;

  const PAGE_META = {
    overview: {
      title: 'Overview',
      description: 'A quiet, live view of the swarm — stages, slots, and the last calls it made.',
      mode: 'stream',
    },
    flow: {
      title: 'Pipeline Flow',
      description: 'Every candidate between discovery and Discord, one column per stage.',
      mode: 'poll',
    },
    glass: {
      title: 'Machine Glass',
      description: 'Every fetch, sanitize, audit, baton-pass, and delivery — as it happens.',
      mode: 'stream',
    },
    pools: {
      title: 'Pool Health',
      description: 'Free-tier model buckets, cooldowns, and today’s call budget.',
      mode: 'poll',
    },
    boards: {
      title: 'Boards',
      description: 'Verified opportunities grouped by the channels they route to.',
      mode: 'poll',
    },
    audit: {
      title: 'Audit & Rejection',
      description: 'What the swarm refused, why it refused it, and the cold tombstone ledger.',
      mode: 'poll',
    },
    sources: {
      title: 'Sources',
      description: 'Adapter health: last poll, candidates found, fetch mode, and last error.',
      mode: 'poll',
    },
    system: {
      title: 'System',
      description: 'Runtime, retention, SSE viewers, and the scheduler heartbeat.',
      mode: 'poll',
    },
  };

  const NAV = [
    {
      label: 'Main',
      items: [
        { key: 'overview', href: '/', label: 'Overview', icon: 'overview' },
        { key: 'flow', href: '/flow', label: 'Pipeline Flow', icon: 'flow' },
        { key: 'glass', href: '/glass', label: 'Live Glass', icon: 'glass' },
      ],
    },
    {
      label: 'Observability',
      items: [
        { key: 'pools', href: '/pools', label: 'Pool Health', icon: 'pools' },
        { key: 'sources', href: '/sources', label: 'Sources', icon: 'sources' },
        { key: 'system', href: '/system', label: 'System', icon: 'system' },
      ],
    },
    {
      label: 'Opportunities',
      items: [
        { key: 'boards', href: '/boards', label: 'Boards', icon: 'boards' },
        { key: 'audit', href: '/audit', label: 'Audit', icon: 'audit' },
      ],
    },
  ];

  const STAGES = [
    {
      key: 'queued',
      label: 'Queued',
      hint: 'Waiting for a worker',
      icon: 'inbox',
      color: '#6f5bd8',
      soft: '#efeaff',
    },
    {
      key: 'fetching',
      label: 'Fetching',
      hint: 'Fetch + sanitize',
      icon: 'download',
      color: '#d1783a',
      soft: '#fff0e6',
    },
    {
      key: 'auditing',
      label: 'Auditing',
      hint: 'LLM audit',
      icon: 'search',
      color: '#3f78c4',
      soft: '#eaf2ff',
    },
    {
      key: 'routing',
      label: 'Routing',
      hint: 'Gate + channel',
      icon: 'route',
      color: '#b5851c',
      soft: '#fff6e3',
    },
    {
      key: 'delivered',
      label: 'Delivered',
      hint: 'Posted to Discord',
      icon: 'send',
      color: '#2d9770',
      soft: '#e8f8f1',
    },
  ];

  // ---------------------------------------------------------------------
  // Formatting
  // ---------------------------------------------------------------------

  function esc(value) {
    return String(value === null || value === undefined ? '' : value).replace(
      /[&<>"']/g,
      (char) =>
        ({
          '&': '&amp;',
          '<': '&lt;',
          '>': '&gt;',
          '"': '&quot;',
          "'": '&#39;',
        })[char],
    );
  }

  function parseMs(iso) {
    const ms = Date.parse(String(iso || ''));
    return Number.isFinite(ms) ? ms : null;
  }

  function humanSpan(ms) {
    const seconds = Math.round(Math.abs(ms) / 1000);
    if (seconds < 10) return 'just now';
    if (seconds < 60) return seconds + 's';
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return minutes + 'm';
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return hours + 'h ' + (minutes % 60) + 'm';
    const days = Math.floor(hours / 24);
    return days + 'd';
  }

  function timeAgo(iso) {
    const ms = parseMs(iso);
    if (ms === null) return '—';
    const diff = Date.now() - ms;
    if (diff >= 0) return humanSpan(diff) + ' ago';
    return 'in ' + humanSpan(diff);
  }

  function elapsed(iso) {
    const ms = parseMs(iso);
    if (ms === null) return '—';
    const seconds = Math.max(0, Math.floor((Date.now() - ms) / 1000));
    const minutes = Math.floor(seconds / 60);
    const rest = seconds % 60;
    if (minutes >= 60) {
      return Math.floor(minutes / 60) + 'h ' + (minutes % 60) + 'm';
    }
    return minutes + ':' + String(rest).padStart(2, '0');
  }

  function fmtDuration(ms) {
    if (ms === null || ms === undefined || !Number.isFinite(Number(ms))) return '—';
    const value = Number(ms);
    if (value < 1000) return Math.round(value) + ' ms';
    if (value < 60_000) {
      return (value / 1000).toFixed(value < 10_000 ? 1 : 0) + ' s';
    }
    const minutes = Math.floor(value / 60_000);
    const seconds = Math.round((value % 60_000) / 1000);
    return minutes + 'm ' + seconds + 's';
  }

  const numberFmt = new Intl.NumberFormat('en-IN');
  const currencyFmt = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 });
  const dateFmt = new Intl.DateTimeFormat('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: 'Asia/Kolkata',
  });
  const dateTimeFmt = new Intl.DateTimeFormat('en-IN', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Asia/Kolkata',
  });
  const timeFmt = new Intl.DateTimeFormat('en-IN', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
    timeZone: 'Asia/Kolkata',
  });

  function fmtNumber(value) {
    if (value === null || value === undefined || value === '') return '—';
    const number = Number(value);
    return Number.isFinite(number) ? numberFmt.format(number) : '—';
  }

  function fmtCurrency(value) {
    if (value === null || value === undefined || value === '') return '—';
    const number = Number(value);
    return Number.isFinite(number) ? '₹' + currencyFmt.format(number) : '—';
  }

  function fmtDate(iso) {
    const ms = parseMs(iso);
    return ms === null ? '—' : dateFmt.format(ms);
  }

  function fmtDateTime(iso) {
    const ms = parseMs(iso);
    return ms === null ? '—' : dateTimeFmt.format(ms);
  }

  function fmtTime(iso) {
    const ms = parseMs(iso);
    return ms === null ? '—' : timeFmt.format(ms);
  }

  // ---------------------------------------------------------------------
  // Status + event vocabulary
  // ---------------------------------------------------------------------

  const PILL_ALIASES = {
    start: 'start',
    active: 'active',
    ok: 'ok',
    done: 'ok',
    error: 'error',
    skip: 'skip',
    cooldown: 'cooldown',
    ready: 'ok',
    '60s-cooldown': 'cooldown',
    'daily-cap': 'error',
  };

  const STATUS_LABELS = {
    start: 'start',
    active: 'active',
    ok: 'ok',
    done: 'done',
    error: 'error',
    skip: 'skip',
    cooldown: 'cooldown',
    ready: 'ready',
    '60s-cooldown': 'cooldown',
    'daily-cap': 'daily cap',
  };

  function pillClass(status) {
    return PILL_ALIASES[String(status || '').toLowerCase()] || 'neutral';
  }

  function statusLabel(status) {
    const key = String(status || '').toLowerCase();
    return STATUS_LABELS[key] || String(status || '—');
  }

  function pipelineClass(pipeline) {
    const key = String(pipeline || '').toLowerCase();
    return ['events', 'jobs', 'loot', 'local', 'social'].includes(key)
      ? 'pipe-' + key
      : 'pipe-other';
  }

  const EVENT_ICONS = {
    llm: 'spark',
    fetch: 'download',
    sanitize: 'filter',
    dedup: 'shuffle',
    orchestrator: 'route',
    discord: 'send',
    scheduler: 'clock',
    scout: 'search',
    scratchpad: 'boards',
    gc: 'refresh',
    db: 'database',
    system: 'system',
  };

  function eventIcon(type) {
    return EVENT_ICONS[String(type || '').toLowerCase()] || 'activity';
  }

  function hostOf(url) {
    try {
      return new URL(String(url)).hostname.replace(/^www\./, '');
    } catch {
      return '';
    }
  }

  // ---------------------------------------------------------------------
  // Shared markup helpers
  // ---------------------------------------------------------------------

  function eventRow(event, options) {
    const opts = options || {};
    const type = String(event.event_type || 'system');
    const status = String(event.status || '');
    const model = [event.provider, event.model].filter(Boolean).join(' · ');
    const detail = event.detail || event.output_summary || event.input_summary || '';
    const time = opts.absolute ? fmtTime(event.created) : timeAgo(event.created);
    const interactive = opts.interactive
      ? ' tabindex="0" role="button" aria-label="Open trace for ' + esc(event.tool || type) + '"'
      : '';
    return (
      '<article class="ev' +
      (opts.compact ? ' ev-compact' : '') +
      (opts.interactive ? ' is-interactive' : '') +
      '" data-id="' +
      esc(event.id || '') +
      '" data-trace="' +
      esc(event.trace_id || '') +
      '"' +
      interactive +
      '>' +
      '<span class="ev-icon type-' +
      esc(type) +
      '">' +
      icon(eventIcon(type), 16) +
      '</span>' +
      '<span class="ev-time" title="' +
      esc(fmtDateTime(event.created)) +
      '">' +
      esc(time) +
      '</span>' +
      '<div class="ev-main">' +
      '<div class="ev-title"><span class="ev-tool">' +
      esc(event.tool || type) +
      '</span>' +
      (event.step ? '<span class="chip chip-xs">' + esc(event.step) + '</span>' : '') +
      (event.agent ? '<span class="ev-agent">' + esc(event.agent) + '</span>' : '') +
      '</div>' +
      '<div class="ev-meta">' +
      (model ? '<span class="mono ev-model">' + esc(model) + '</span>' : '') +
      (event.pipeline
        ? '<span class="pipe-tag ' + pipelineClass(event.pipeline) + '">' + esc(event.pipeline) + '</span>'
        : '') +
      (event.baton_to
        ? '<span class="chip chip-xs amber">429 → ' + esc(event.baton_to) + '</span>'
        : '') +
      (detail
        ? '<span class="ev-detail" title="' + esc(detail) + '">' + esc(detail) + '</span>'
        : '') +
      (event.url
        ? '<a class="ev-url" href="' +
          esc(event.url) +
          '" target="_blank" rel="noreferrer" title="' +
          esc(event.url) +
          '">' +
          icon('external', 11) +
          esc(hostOf(event.url) || 'source') +
          '</a>'
        : '') +
      '</div>' +
      '</div>' +
      '<span class="pill ' +
      pillClass(status) +
      '">' +
      esc(statusLabel(status)) +
      '</span>' +
      '<span class="ev-dur">' +
      (event.duration_ms !== null && event.duration_ms !== undefined
        ? esc(fmtDuration(event.duration_ms))
        : '—') +
      '</span>' +
      '</article>'
    );
  }

  function emptyState(title, detail, iconName) {
    return (
      '<div class="state">' +
      '<span class="state-icon">' +
      icon(iconName || 'inbox', 22) +
      '</span>' +
      '<strong>' +
      esc(title) +
      '</strong>' +
      (detail ? '<span>' + esc(detail) + '</span>' : '') +
      '</div>'
    );
  }

  function loadingState(label) {
    return (
      '<div class="state"><span class="spinner"></span><span>' +
      esc(label || 'Loading…') +
      '</span></div>'
    );
  }

  function errorState(label, detail) {
    return (
      '<div class="state is-error"><span class="state-icon">' +
      icon('alert', 22) +
      '</span><strong>' +
      esc(label || 'Could not load') +
      '</strong>' +
      (detail ? '<span>' + esc(detail) + '</span>' : '') +
      '</div>'
    );
  }

  function dots(index) {
    return (
      '<span class="dots" aria-hidden="true">' +
      STAGES.map(
        (_stage, i) =>
          '<span class="dot' + (i <= index ? ' on' : '') + (i === index ? ' current' : '') + '"></span>',
      ).join('') +
      '</span>'
    );
  }

  // ---------------------------------------------------------------------
  // Live pill + staleness banner
  // ---------------------------------------------------------------------

  const LIVE_DEFAULTS = {
    connected: 'Live stream',
    connecting: 'Connecting…',
    reconnecting: 'Reconnecting…',
    stale: 'Stream stale',
    polling: 'Auto-refresh',
    paused: 'Paused',
  };

  function setLive(state, label) {
    const pill = document.getElementById('live-pill');
    if (!pill) return;
    pill.className = 'live-pill ' + state;
    const labelEl = document.getElementById('live-label');
    if (labelEl) labelEl.textContent = label || LIVE_DEFAULTS[state] || state;
  }

  function setStale(stale, message) {
    const banner = document.getElementById('staleness-banner');
    if (!banner) return;
    banner.textContent = message || 'Stream stale — last update over 90s ago';
    banner.classList.toggle('show', Boolean(stale));
  }

  // ---------------------------------------------------------------------
  // Timing helpers
  // ---------------------------------------------------------------------

  function debounce(fn, wait) {
    let timer = null;
    return function () {
      const args = arguments;
      const self = this;
      clearTimeout(timer);
      timer = setTimeout(() => fn.apply(self, args), wait || 200);
    };
  }

  function throttle(fn, wait) {
    let last = 0;
    let timer = null;
    return function () {
      const args = arguments;
      const self = this;
      const now = Date.now();
      const remaining = wait - (now - last);
      if (remaining <= 0) {
        last = now;
        fn.apply(self, args);
      } else if (!timer) {
        timer = setTimeout(() => {
          timer = null;
          last = Date.now();
          fn.apply(self, args);
        }, remaining);
      }
    };
  }

  function poll(fn, intervalMs) {
    let stopped = false;
    let busy = false;
    const run = async function () {
      if (stopped || document.hidden || busy) return;
      busy = true;
      try {
        await fn();
      } catch (error) {
        console.error('[zod] refresh failed', error);
      } finally {
        busy = false;
      }
    };
    const timer = setInterval(run, intervalMs);
    document.addEventListener('visibilitychange', function () {
      if (!document.hidden) run();
    });
    run();
    return function () {
      stopped = true;
      clearInterval(timer);
    };
  }

  // ---------------------------------------------------------------------
  // Shell
  // ---------------------------------------------------------------------

  function navMarkup(activeKey) {
    return NAV.map(function (group) {
      return (
        '<div class="nav-group"><div class="nav-group-label">' +
        esc(group.label) +
        '</div>' +
        group.items
          .map(function (item) {
            const active = item.key === activeKey;
            return (
              '<a class="nav-item' +
              (active ? ' active' : '') +
              '" href="' +
              item.href +
              '"' +
              (active ? ' aria-current="page"' : '') +
              ' title="' +
              esc(item.label) +
              '">' +
              '<span class="nav-icon">' +
              icon(item.icon, 18) +
              '</span>' +
              '<span class="nav-label">' +
              esc(item.label) +
              '</span>' +
              '</a>'
            );
          })
          .join('') +
        '</div>'
      );
    }).join('');
  }

  function renderShell() {
    const pageKey = document.body.dataset.page || 'overview';
    const meta = PAGE_META[pageKey] || PAGE_META.overview;
    const sidebar = document.getElementById('sidebar');
    const topbar = document.getElementById('topbar');

    if (sidebar) {
      sidebar.innerHTML =
        '<div class="sidebar-inner">' +
        '<a class="brand" href="/" aria-label="Zod home">' +
        '<span class="brand-mark">' +
        icon('spark', 20) +
        '</span>' +
        '<span class="brand-text"><strong>Zod</strong><small>Opportunity swarm</small></span>' +
        '</a>' +
        '<nav class="sidebar-nav" aria-label="Dashboard sections">' +
        navMarkup(pageKey) +
        '</nav>' +
        '<div class="sidebar-footer">' +
        '<div class="runtime"><span class="runtime-dot"></span>Local runtime</div>' +
        '<div class="runtime-sub">Read-only · 24h event ring</div>' +
        '</div>' +
        '</div>';
    }

    if (topbar) {
      topbar.innerHTML =
        '<div class="topbar-copy">' +
        '<div class="eyebrow"><span>Workspace</span><span class="eyebrow-sep">/</span><span>' +
        esc(meta.title) +
        '</span></div>' +
        '<h1>' +
        esc(meta.title) +
        '</h1>' +
        '<p>' +
        esc(meta.description) +
        '</p>' +
        '</div>' +
        '<div class="topbar-tools">' +
        '<span class="local-pill">' +
        icon('server', 14) +
        'Local</span>' +
        '<span class="live-pill" id="live-pill"><span class="live-dot"></span><span id="live-label">' +
        (meta.mode === 'stream' ? 'Connecting…' : 'Auto-refresh') +
        '</span></span>' +
        '</div>';
    }

    let banner = document.getElementById('staleness-banner');
    if (!banner) {
      banner = document.createElement('div');
      banner.id = 'staleness-banner';
      banner.className = 'staleness-banner';
      banner.setAttribute('role', 'status');
      const main = document.querySelector('.main');
      const anchor = document.getElementById('topbar');
      if (main && anchor) main.insertBefore(banner, anchor.nextSibling);
    }

    setLive(meta.mode === 'stream' ? 'connecting' : 'polling');
  }

  const ZodUI = {
    esc,
    parseMs,
    timeAgo,
    elapsed,
    fmtDuration,
    fmtNumber,
    fmtCurrency,
    fmtDate,
    fmtDateTime,
    fmtTime,
    pillClass,
    statusLabel,
    pipelineClass,
    eventIcon,
    hostOf,
    eventRow,
    emptyState,
    loadingState,
    errorState,
    dots,
    setLive,
    setStale,
    debounce,
    throttle,
    poll,
    icon,
    stages: STAGES,
    pageMeta: PAGE_META,
  };

  window.ZodUI = ZodUI;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', renderShell, { once: true });
  } else {
    renderShell();
  }
})();
