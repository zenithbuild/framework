import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

function normalizeNewlines(value) {
    return String(value).replace(/\r\n/g, '\n').replace(/\r/g, '\n');
}

function readRuntimeSourceFile(fileName) {
    const fullPath = join(__dirname, fileName);
    return normalizeNewlines(readFileSync(fullPath, 'utf8'));
}

function stripImports(source) {
    return source.replace(/^\s*import\s+[^;]+;\s*$/gm, '').trim();
}

function buildRuntimeModuleSource() {
    const segments = [
        stripImports(readRuntimeSourceFile('zeneffect.js')),
        stripImports(readRuntimeSourceFile('ref.js')),
        stripImports(readRuntimeSourceFile('env.js')),
        stripImports(readRuntimeSourceFile('platform.js')),
        stripImports(readRuntimeSourceFile('signal.js')),
        stripImports(readRuntimeSourceFile('state.js')),
        stripImports(readRuntimeSourceFile('diagnostics.js')),
        stripImports(readRuntimeSourceFile('cleanup.js')),
        stripImports(readRuntimeSourceFile('hydrate.js'))
    ].filter(Boolean);

    return normalizeNewlines(segments.join('\n\n'));
}

const RUNTIME_MODULE_SOURCE = buildRuntimeModuleSource();

export function runtimeModuleSource() {
    return RUNTIME_MODULE_SOURCE;
}

const RUNTIME_DEV_CLIENT_SOURCE = `(() => {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  if (window.__zenithDevClientActive === true) return;
  window.__zenithDevClientActive = true;

  const DEV_KEY = '__ZENITH_DEV__';
  const STORAGE_KEY = '__ZENITH_DEBUG__';
  const DEFAULT_LOGS = { route: false, bindings: false, events: false, hmr: false };

  function readStoredLogs() {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) return { ...DEFAULT_LOGS };
      if (raw === '1') return { route: true, bindings: true, events: true, hmr: true };
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object') return { ...DEFAULT_LOGS };
      return {
        route: parsed.route === true,
        bindings: parsed.bindings === true,
        events: parsed.events === true,
        hmr: parsed.hmr === true
      };
    } catch {
      return { ...DEFAULT_LOGS };
    }
  }

  function persistLogs(logs) {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(logs));
    } catch {
      // ignore storage failures in private mode
    }
  }

  function ensureDevState() {
    const current = window[DEV_KEY] && typeof window[DEV_KEY] === 'object' ? window[DEV_KEY] : {};
    const logs = current.logs && typeof current.logs === 'object' ? current.logs : readStoredLogs();
    const overlay = current.overlay && typeof current.overlay === 'object' ? current.overlay : {};
    const state = {
      logs: {
        route: logs.route === true,
        bindings: logs.bindings === true,
        events: logs.events === true,
        hmr: logs.hmr === true
      },
      overlay: {
        open: overlay.open === true
      }
    };
    window[DEV_KEY] = state;
    persistLogs(state.logs);
    return state;
  }

  function parseEventData(raw) {
    if (typeof raw !== 'string' || raw.length === 0) return {};
    try {
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
      return {};
    }
  }

  function fetchDevState() {
    return fetch('/__zenith_dev/state', { cache: 'no-store' })
      .then(function (response) {
        if (!response || !response.ok) {
          return null;
        }
        return response.json().catch(function () { return null; });
      })
      .then(function (payload) {
        return payload && typeof payload === 'object' ? payload : null;
      })
      .catch(function () {
        return null;
      });
  }

  let cssSwapEpoch = 0;

  function withCacheBuster(nextHref) {
    const separator = nextHref.includes('?') ? '&' : '?';
    return nextHref + separator + '__zenith_dev=' + Date.now();
  }

  function isSameOriginStylesheet(href) {
    if (typeof href !== 'string' || href.length === 0) {
      return false;
    }
    if (href.startsWith('http://') || href.startsWith('https://')) {
      try {
        return new URL(href, window.location.href).origin === window.location.origin;
      } catch {
        return false;
      }
    }
    return true;
  }

  function findPrimaryStylesheet() {
    const links = Array.from(document.querySelectorAll('link[rel="stylesheet"]'))
      .filter(function (link) {
        return isSameOriginStylesheet(link.getAttribute('href') || '');
      });
    if (links.length === 0) {
      return null;
    }
    const marked = links.find(function (link) {
      return link.getAttribute('data-zenith-dev-primary') === 'true';
    });
    if (marked) {
      return marked;
    }
    links[0].setAttribute('data-zenith-dev-primary', 'true');
    return links[0];
  }

  function scheduleCssRetry(previousHref, attempt) {
    if (attempt >= 3) {
      window.location.reload();
      return;
    }
    const delayMs = (attempt + 1) * 100;
    setTimeout(function () {
      fetchDevState().then(function (statePayload) {
        const href = statePayload && typeof statePayload.cssHref === 'string' && statePayload.cssHref.length > 0
          ? statePayload.cssHref
          : previousHref;
        swapStylesheet(href, attempt + 1);
      });
    }, delayMs);
  }

  function swapStylesheet(nextHref, attempt) {
    const tries = Number.isInteger(attempt) ? attempt : 0;
    if (typeof nextHref !== 'string' || nextHref.length === 0) {
      window.location.reload();
      return;
    }
    const activeLink = findPrimaryStylesheet();
    if (!activeLink) {
      window.location.reload();
      return;
    }

    const swapId = ++cssSwapEpoch;
    const nextLink = activeLink.cloneNode(true);
    nextLink.setAttribute('href', withCacheBuster(nextHref));
    nextLink.removeAttribute('data-zenith-dev-primary');
    nextLink.setAttribute('data-zenith-dev-pending', 'true');
    activeLink.removeAttribute('data-zenith-dev-primary');

    nextLink.addEventListener('load', function () {
      if (swapId !== cssSwapEpoch) {
        try { nextLink.remove(); } catch { }
        return;
      }
      nextLink.removeAttribute('data-zenith-dev-pending');
      nextLink.setAttribute('data-zenith-dev-primary', 'true');
      try { activeLink.remove(); } catch { }
    }, { once: true });

    nextLink.addEventListener('error', function () {
      if (swapId !== cssSwapEpoch) {
        try { nextLink.remove(); } catch { }
        return;
      }
      try { nextLink.remove(); } catch { }
      activeLink.setAttribute('data-zenith-dev-primary', 'true');
      scheduleCssRetry(nextHref, tries);
    }, { once: true });

    activeLink.insertAdjacentElement('afterend', nextLink);
  }

  const state = ensureDevState();
  const shell = document.createElement('div');
  shell.setAttribute('data-zenith-dev-overlay', 'true');
  shell.style.position = 'fixed';
  shell.style.left = '12px';
  shell.style.bottom = '12px';
  shell.style.zIndex = '2147483647';
  shell.style.fontFamily = 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace';
  shell.style.fontSize = '12px';
  shell.style.pointerEvents = 'none';

  const pill = document.createElement('button');
  pill.type = 'button';
  pill.textContent = 'Zenith Dev';
  pill.style.pointerEvents = 'auto';
  pill.style.border = '1px solid rgba(255,255,255,0.2)';
  pill.style.background = 'rgba(20,20,24,0.88)';
  pill.style.color = '#ecf2ff';
  pill.style.borderRadius = '999px';
  pill.style.padding = '6px 10px';
  pill.style.cursor = 'pointer';
  pill.style.boxShadow = '0 8px 24px rgba(0,0,0,0.25)';

  const panel = document.createElement('div');
  panel.style.display = state.overlay.open ? 'block' : 'none';
  panel.style.width = '360px';
  panel.style.marginTop = '8px';
  panel.style.pointerEvents = 'auto';
  panel.style.background = 'rgba(14,16,20,0.94)';
  panel.style.color = '#dbe6ff';
  panel.style.border = '1px solid rgba(255,255,255,0.16)';
  panel.style.borderRadius = '10px';
  panel.style.padding = '10px';
  panel.style.boxShadow = '0 14px 30px rgba(0,0,0,0.35)';

  const status = document.createElement('div');
  status.textContent = 'status: connecting';
  status.style.marginBottom = '6px';

  const info = document.createElement('div');
  info.textContent = 'route: ' + window.location.pathname;
  info.style.opacity = '0.85';
  info.style.marginBottom = '8px';
  info.style.whiteSpace = 'pre-wrap';

  const controls = document.createElement('div');
  controls.style.display = 'grid';
  controls.style.gridTemplateColumns = '1fr 1fr';
  controls.style.gap = '6px';
  controls.style.marginBottom = '8px';

  function makeButton(label) {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = label;
    button.style.border = '1px solid rgba(255,255,255,0.2)';
    button.style.borderRadius = '6px';
    button.style.padding = '6px 8px';
    button.style.cursor = 'pointer';
    button.style.background = 'rgba(36,41,51,0.85)';
    button.style.color = '#ecf2ff';
    return button;
  }

  const reloadButton = makeButton('Reload');
  const copyButton = makeButton('Copy URL');
  const debugButton = makeButton('Toggle Debug');
  const overlayButton = makeButton('Toggle Overlay');

  controls.append(reloadButton, copyButton, debugButton, overlayButton);

  const logs = document.createElement('pre');
  logs.style.margin = '0';
  logs.style.padding = '8px';
  logs.style.maxHeight = '190px';
  logs.style.overflow = 'auto';
  logs.style.border = '1px solid rgba(255,255,255,0.12)';
  logs.style.borderRadius = '6px';
  logs.style.background = 'rgba(8,10,14,0.8)';
  logs.style.whiteSpace = 'pre-wrap';
  logs.textContent = '[zenith-dev] waiting for server events...';

  panel.append(status, info, controls, logs);
  shell.append(pill, panel);

  function setOpen(open) {
    state.overlay.open = open === true;
    panel.style.display = state.overlay.open ? 'block' : 'none';
  }

  function appendLog(line) {
    logs.textContent += '\\n' + line;
    logs.scrollTop = logs.scrollHeight;
  }

  function updateInfo(payload) {
    const route = typeof payload.route === 'string' ? payload.route : window.location.pathname;
    const hash = typeof payload.buildHash === 'string' ? payload.buildHash : 'n/a';
    const durationValue = Number.isFinite(payload.durationMs) ? payload.durationMs : payload.lastBuildMs;
    const duration = Number.isFinite(durationValue) ? durationValue + 'ms' : 'n/a';
    const changed = Array.isArray(payload.changedFiles) ? payload.changedFiles.join(', ') : '';
    const serverUrl = typeof payload.serverUrl === 'string' ? payload.serverUrl : window.location.origin;
    const buildId = Number.isInteger(payload.buildId) ? payload.buildId : 'n/a';
    const buildStatus = typeof payload.status === 'string' ? payload.status : 'unknown';
    info.textContent =
      'server: ' + serverUrl + '\\n' +
      'route: ' + route + '\\n' +
      'buildId: ' + buildId + '\\n' +
      'status: ' + buildStatus + '\\n' +
      'hash: ' + hash + '\\n' +
      'duration: ' + duration + '\\n' +
      'changed: ' + changed;
  }

  function allLogsEnabled() {
    return state.logs.route && state.logs.bindings && state.logs.events && state.logs.hmr;
  }

  function setAllLogs(enabled) {
    state.logs.route = enabled;
    state.logs.bindings = enabled;
    state.logs.events = enabled;
    state.logs.hmr = enabled;
    persistLogs(state.logs);
    appendLog('[zenith-dev] debug logs ' + (enabled ? 'enabled' : 'disabled'));
  }

  function emitDebug(label, payload) {
    if (state.logs.hmr === true) {
      console.log('[zenith-dev] ' + label, payload);
    }
  }

  pill.addEventListener('click', function () {
    setOpen(!state.overlay.open);
  });
  overlayButton.addEventListener('click', function () {
    setOpen(!state.overlay.open);
  });
  reloadButton.addEventListener('click', function () {
    window.location.reload();
  });
  copyButton.addEventListener('click', function () {
    const target = window.location.origin;
    if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
      navigator.clipboard.writeText(target).catch(() => {});
    }
    appendLog('[zenith-dev] copied ' + target);
  });
  debugButton.addEventListener('click', function () {
    setAllLogs(!allLogsEnabled());
  });

  function mount() {
    if (document.body) {
      document.body.appendChild(shell);
    }
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mount, { once: true });
  } else {
    mount();
  }

  const source = new EventSource('/__zenith_dev/events');
  source.addEventListener('connected', function (event) {
    const payload = parseEventData(event.data);
    status.textContent = 'status: connected';
    updateInfo(payload);
    appendLog('[connected] dev channel online');
    emitDebug('connected', payload);
    fetchDevState().then(function (statePayload) {
      if (!statePayload) return;
      updateInfo({ ...payload, ...statePayload });
    });
  });
  source.addEventListener('build_start', function (event) {
    const payload = parseEventData(event.data);
    status.textContent = 'status: rebuilding';
    appendLog('[build_start] ' + (Array.isArray(payload.changedFiles) ? payload.changedFiles.join(', ') : ''));
    emitDebug('build_start', payload);
  });
  source.addEventListener('build_complete', function (event) {
    const payload = parseEventData(event.data);
    status.textContent = 'status: ready';
    updateInfo(payload);
    appendLog('[build_complete] ' + (Number.isFinite(payload.durationMs) ? payload.durationMs + 'ms' : 'done'));
    emitDebug('build_complete', payload);
  });
  source.addEventListener('build_error', function (event) {
    const payload = parseEventData(event.data);
    status.textContent = 'status: error';
    appendLog('[build_error] ' + (payload.message || 'Unknown error'));
    emitDebug('build_error', payload);
  });
  source.addEventListener('reload', function (event) {
    const payload = parseEventData(event.data);
    appendLog('[reload] refreshing page');
    emitDebug('reload', payload);
    setTimeout(function () {
      window.location.reload();
    }, 30);
  });
  source.addEventListener('css_update', function (event) {
    const payload = parseEventData(event.data);
    appendLog('[css_update] ' + (payload.href || ''));
    emitDebug('css_update', payload);
    fetchDevState().then(function (statePayload) {
      if (statePayload) {
        updateInfo({ ...payload, ...statePayload });
      }
      if (statePayload && typeof statePayload.cssHref === 'string' && statePayload.cssHref.length > 0) {
        swapStylesheet(statePayload.cssHref);
        return;
      }
      swapStylesheet(payload.href);
    });
  });
  source.addEventListener('error', function () {
    status.textContent = 'status: disconnected';
    appendLog('[error] lost dev server connection');
  });
})();`;

export function runtimeDevClientSource() {
    return RUNTIME_DEV_CLIENT_SOURCE;
}
