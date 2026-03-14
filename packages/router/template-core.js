export function renderRouterCoreSource({ manifest, runtimeSpec, coreSpec }) {
    return `import { hydrate as __zenithHydrate } from '${runtimeSpec}';
import { zenOnMount as __zenithOnMount } from '${coreSpec}';

void __zenithHydrate;
void __zenithOnMount;

const __ZENITH_MANIFEST__ = ${manifest};
const __ZENITH_ROUTE_EVENT_KEY = "__zenith_route_event_listeners";
const __ZENITH_ROUTE_EVENT_NAMES = [
  "guard:start",
  "guard:end",
  "route-check:start",
  "route-check:end",
  "route-check:error",
  "route:deny",
  "route:redirect",
  "navigation:request",
  "navigation:before-leave",
  "navigation:leave-complete",
  "navigation:data-ready",
  "navigation:before-swap",
  "navigation:content-swapped",
  "navigation:before-enter",
  "navigation:enter-complete",
  "navigation:abort",
  "navigation:error"
];
const __ZENITH_HISTORY_STATE_KEY = "__zenith_router_state";
const __ZENITH_RUNTIME_ROUTE_HTML_KEY = "__zenith_route_html";
const __ZENITH_SCROLL_EVENT_NAME = "zx-router-scroll";

let activeCleanup = null;
let navigationToken = 0;
let activeNavigationController = null;
let activeNavigationContext = null;
let currentUrl = null;
let currentHistoryKey = "";
let scrollSnapshotQueued = false;
const scrollPositions = new Map();

function splitPath(path) {
  return path.split('/').filter(Boolean);
}

function copyParams(params) {
  if (!params || typeof params !== "object") {
    return {};
  }
  return { ...params };
}

function cloneUrl(url) {
  if (!url || typeof url.href !== "string") {
    return null;
  }
  return new URL(url.href);
}

function normalizeCatchAll(segments) {
  return segments.filter(Boolean).join('/');
}

function segmentWeight(segment) {
  if (!segment) return 0;
  if (segment.startsWith('*')) return 1;
  if (segment.startsWith(':')) return 2;
  return 3;
}

function routeClass(segments) {
  let hasParam = false;
  let hasCatchAll = false;
  for (let i = 0; i < segments.length; i++) {
    const segment = segments[i];
    if (segment.startsWith('*')) {
      hasCatchAll = true;
    } else if (segment.startsWith(':')) {
      hasParam = true;
    }
  }
  if (!hasParam && !hasCatchAll) return 3;
  if (hasCatchAll) return 1;
  return 2;
}

function compareRouteSpecificity(a, b) {
  if (a === '/' && b !== '/') return -1;
  if (b === '/' && a !== '/') return 1;
  const aSegs = splitPath(a);
  const bSegs = splitPath(b);
  const aClass = routeClass(aSegs);
  const bClass = routeClass(bSegs);
  if (aClass !== bClass) {
    return bClass - aClass;
  }
  const max = Math.min(aSegs.length, bSegs.length);
  for (let i = 0; i < max; i++) {
    const aWeight = segmentWeight(aSegs[i]);
    const bWeight = segmentWeight(bSegs[i]);
    if (aWeight !== bWeight) {
      return bWeight - aWeight;
    }
  }
  if (aSegs.length !== bSegs.length) {
    return bSegs.length - aSegs.length;
  }
  return a.localeCompare(b);
}

function resolveRoute(pathname) {
  if (__ZENITH_MANIFEST__.chunks[pathname]) {
    return { route: pathname, params: {} };
  }

  const pathnameSegments = splitPath(pathname);
  const routes = Object.keys(__ZENITH_MANIFEST__.chunks).sort(compareRouteSpecificity);
  for (let i = 0; i < routes.length; i++) {
    const route = routes[i];
    const routeSegments = splitPath(route);
    const params = Object.create(null);
    let routeIndex = 0;
    let pathIndex = 0;
    let matched = true;

    while (routeIndex < routeSegments.length) {
      const routeSegment = routeSegments[routeIndex];
      if (routeSegment.startsWith('*')) {
        const optionalCatchAll = routeSegment.endsWith('?');
        const key = optionalCatchAll ? routeSegment.slice(1, -1) : routeSegment.slice(1);
        if (routeIndex !== routeSegments.length - 1) {
          matched = false;
          break;
        }
        const rest = pathnameSegments.slice(pathIndex);
        const rootRequiredCatchAll = !optionalCatchAll && routeSegments.length === 1;
        if (rest.length === 0 && !optionalCatchAll && !rootRequiredCatchAll) {
          matched = false;
          break;
        }
        params[key] = normalizeCatchAll(rest);
        pathIndex = pathnameSegments.length;
        routeIndex = routeSegments.length;
        continue;
      }
      if (pathIndex >= pathnameSegments.length) {
        matched = false;
        break;
      }
      const pathnameSegment = pathnameSegments[pathIndex];
      if (routeSegment.startsWith(':')) {
        params[routeSegment.slice(1)] = pathnameSegment;
      } else if (routeSegment !== pathnameSegment) {
        matched = false;
        break;
      }
      routeIndex += 1;
      pathIndex += 1;
    }

    if (matched && routeIndex === routeSegments.length && pathIndex === pathnameSegments.length) {
      return { route, params: { ...params } };
    }
  }

  return null;
}

function requiresServerReload(route) {
  const routes = __ZENITH_MANIFEST__.server_routes || __ZENITH_MANIFEST__.serverRoutes || [];
  return Array.isArray(routes) && routes.includes(route);
}

function zenithScope() {
  return typeof globalThis === "object" && globalThis ? globalThis : window;
}

function toNavigationPath(url) {
  return url.pathname + url.search;
}

function isAbortError(error) {
  return !!error && typeof error === "object" && error.name === "AbortError";
}

function nextFrame() {
  if (typeof requestAnimationFrame === "function") {
    return new Promise((resolve) => requestAnimationFrame(() => resolve()));
  }
  return Promise.resolve();
}

function createHistoryKey() {
  return "z" + Date.now().toString(36) + Math.random().toString(36).slice(2);
}

function readHistoryEntry(state) {
  if (!state || typeof state !== "object") return null;
  const entry = state[__ZENITH_HISTORY_STATE_KEY];
  if (!entry || typeof entry !== "object" || typeof entry.key !== "string") {
    return null;
  }
  return entry;
}

function withHistoryEntry(state, entry) {
  const base = state && typeof state === "object" ? { ...state } : {};
  base[__ZENITH_HISTORY_STATE_KEY] = entry;
  return base;
}

function ensureHistoryEntry() {
  const existing = readHistoryEntry(history.state);
  if (existing) {
    currentHistoryKey = existing.key;
    return existing;
  }
  const entry = { key: createHistoryKey() };
  history.replaceState(withHistoryEntry(history.state, entry), "", window.location.href);
  currentHistoryKey = entry.key;
  return entry;
}

function rememberScrollForKey(key, position) {
  if (!key) return;
  scrollPositions.set(key, position || { x: window.scrollX || 0, y: window.scrollY || 0 });
}

function queueScrollSnapshot() {
  if (!currentHistoryKey || scrollSnapshotQueued) return;
  scrollSnapshotQueued = true;
  const flush = () => {
    scrollSnapshotQueued = false;
    rememberScrollForKey(currentHistoryKey);
  };
  if (typeof requestAnimationFrame === "function") {
    requestAnimationFrame(flush);
    return;
  }
  setTimeout(flush, 0);
}

function readStoredScroll(state) {
  const entry = readHistoryEntry(state);
  if (!entry) return { x: 0, y: 0 };
  return scrollPositions.get(entry.key) || { x: 0, y: 0 };
}

function pushHistoryEntry(targetUrl) {
  const entry = { key: createHistoryKey() };
  history.pushState(withHistoryEntry(history.state, entry), "", targetUrl.href);
  currentHistoryKey = entry.key;
  return entry;
}

function syncHistoryEntry(state) {
  const existing = readHistoryEntry(state);
  if (existing) {
    currentHistoryKey = existing.key;
    return existing;
  }
  const entry = { key: createHistoryKey() };
  history.replaceState(withHistoryEntry(history.state, entry), "", window.location.href);
  currentHistoryKey = entry.key;
  return entry;
}

function teardownRuntime() {
  if (typeof activeCleanup === "function") {
    activeCleanup();
    activeCleanup = null;
  }
}

async function mountRoute(route, params, token, payload) {
  if (token !== navigationToken) return false;
  teardownRuntime();
  if (token !== navigationToken) return false;

  const scope = zenithScope();
  if (payload && payload.ssrData && typeof payload.ssrData === "object") {
    scope.__zenith_ssr_data = payload.ssrData;
  }
  if (payload && typeof payload.html === "string") {
    scope[__ZENITH_RUNTIME_ROUTE_HTML_KEY] = payload.html;
  }

  try {
    const pageModule = await import(__ZENITH_MANIFEST__.chunks[route]);
    if (token !== navigationToken) return false;
    const mountFn = pageModule.__zenith_mount || pageModule.default;
    if (typeof mountFn === "function") {
      const cleanup = mountFn(document, params);
      activeCleanup = typeof cleanup === "function" ? cleanup : null;
    }
    return true;
  } finally {
    if (Object.prototype.hasOwnProperty.call(scope, __ZENITH_RUNTIME_ROUTE_HTML_KEY)) {
      delete scope[__ZENITH_RUNTIME_ROUTE_HTML_KEY];
    }
  }
}

function beginNavigation(targetUrl, resolved, navigationType) {
  navigationToken += 1;
  if (activeNavigationContext && !activeNavigationContext.abortReason) {
    activeNavigationContext.abortReason = {
      reason: "superseded",
      abortedStage: activeNavigationContext.stage
    };
  }
  if (activeNavigationController && typeof activeNavigationController.abort === "function") {
    activeNavigationController.abort();
  }
  const controller = typeof AbortController === "function" ? new AbortController() : null;
  const context = {
    token: navigationToken,
    controller,
    signal: controller ? controller.signal : undefined,
    navigationType,
    toUrl: cloneUrl(targetUrl),
    fromUrl: currentUrl ? cloneUrl(currentUrl) : new URL(window.location.href),
    routeId: resolved.route,
    params: copyParams(resolved.params),
    stage: "request",
    abortReason: null,
    abortDispatched: false
  };
  activeNavigationController = controller;
  activeNavigationContext = context;
  return context;
}

function completeNavigation(context) {
  if (activeNavigationController === context.controller) {
    activeNavigationController = null;
  }
  if (activeNavigationContext === context) {
    activeNavigationContext = null;
  }
}

function dispatchScrollEvent(phase, detail, cancelable) {
  if (typeof document !== "object" || !document || typeof CustomEvent === "undefined") {
    return true;
  }
  const event = new CustomEvent(__ZENITH_SCROLL_EVENT_NAME, {
    detail: { ...detail, phase },
    cancelable: cancelable === true
  });
  return document.dispatchEvent(event);
}

function decodeHash(hash) {
  if (!hash || hash === "#") return "";
  try {
    return decodeURIComponent(hash.slice(1));
  } catch {
    return hash.slice(1);
  }
}

function findHashTarget(hash) {
  const decoded = decodeHash(hash);
  if (!decoded) return null;
  const byId = typeof document.getElementById === "function" ? document.getElementById(decoded) : null;
  if (byId) return byId;
  if (typeof document.getElementsByName === "function") {
    const named = document.getElementsByName(decoded);
    if (named && named.length > 0) return named[0];
  }
  return null;
}

function resolveScrollTarget(targetUrl, historyMode, popstateState) {
  const hashTarget = findHashTarget(targetUrl.hash);
  if (hashTarget) {
    return {
      mode: "hash",
      x: 0,
      y: hashTarget.getBoundingClientRect().top + (window.scrollY || window.pageYOffset || 0),
      focusTarget: hashTarget
    };
  }
  if (historyMode === "pop") {
    const saved = readStoredScroll(popstateState);
    return { mode: "restore", x: saved.x, y: saved.y, focusTarget: null };
  }
  return { mode: "top", x: 0, y: 0, focusTarget: null };
}

function applyNativeScroll(target) {
  if (typeof window.scrollTo === "function") {
    window.scrollTo(target.x, target.y);
  }
}

function focusAfterNavigation(target) {
  const focusTarget = target.focusTarget || document.querySelector("main") || document.getElementById("app");
  if (!focusTarget || typeof focusTarget.focus !== "function") return;
  const shouldRestoreTabIndex =
    focusTarget instanceof HTMLElement &&
    !focusTarget.hasAttribute("tabindex") &&
    focusTarget !== document.body;
  if (shouldRestoreTabIndex) {
    focusTarget.setAttribute("tabindex", "-1");
  }
  try {
    focusTarget.focus({ preventScroll: true });
  } catch {
    focusTarget.focus();
  }
  if (shouldRestoreTabIndex) {
    focusTarget.addEventListener("blur", function cleanup() {
      focusTarget.removeEventListener("blur", cleanup);
      if (focusTarget.getAttribute("tabindex") === "-1") {
        focusTarget.removeAttribute("tabindex");
      }
    }, { once: true });
  }
}`;
}
