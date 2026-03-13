import { hydrate as __zenithHydrate } from '/assets/runtime.11111111.js';
import { zenOnMount as __zenithOnMount } from '/assets/core.33333333.js';

void __zenithHydrate;
void __zenithOnMount;

const __ZENITH_MANIFEST__ = {
  "entry": "/assets/runtime.11111111.js",
  "css": "/assets/styles.22222222.css",
  "core": "/assets/core.33333333.js",
  "router": "/assets/router.44444444.js",
  "hash": "deadbeef",
  "chunks": {
    "/": "/assets/index.aaaaaaa1.js",
    "/about": "/assets/about.bbbbbbb2.js"
  }
};
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
}

function routeEventListeners() {
  const scope = zenithScope();
  let listeners = scope[__ZENITH_ROUTE_EVENT_KEY];
  if (!listeners || typeof listeners !== "object") {
    listeners = Object.create(null);
    scope[__ZENITH_ROUTE_EVENT_KEY] = listeners;
  }
  for (let i = 0; i < __ZENITH_ROUTE_EVENT_NAMES.length; i++) {
    const name = __ZENITH_ROUTE_EVENT_NAMES[i];
    if (!(listeners[name] instanceof Set)) {
      listeners[name] = new Set();
    }
  }
  return listeners;
}

function reportRouteEventError(eventName, payload, error) {
  console.error("[Zenith Router] route event handler failed", error);
  if (
    eventName === "navigation:error" ||
    !payload ||
    typeof payload !== "object" ||
    typeof payload.navigationId !== "number"
  ) {
    return;
  }

  dispatchRouteEvent("navigation:error", {
    navigationId: payload.navigationId,
    navigationType: payload.navigationType,
    to: cloneUrl(payload.to),
    from: cloneUrl(payload.from),
    routeId: typeof payload.routeId === "string" ? payload.routeId : "",
    params: copyParams(payload.params),
    stage: typeof payload.stage === "string" ? payload.stage : "listener",
    reason: "listener-error",
    hook: eventName,
    error
  });
}

function dispatchRouteEvent(eventName, payload) {
  const listeners = routeEventListeners()[eventName];
  if (!(listeners instanceof Set)) return;
  const handlers = Array.from(listeners);
  for (let i = 0; i < handlers.length; i++) {
    const handler = handlers[i];
    try {
      const result = handler(payload);
      if (result && typeof result.catch === "function") {
        result.catch(function(error) {
          reportRouteEventError(eventName, payload, error);
        });
      }
    } catch (error) {
      reportRouteEventError(eventName, payload, error);
    }
  }
}

async function dispatchRouteEventAsync(eventName, payload) {
  const listeners = routeEventListeners()[eventName];
  if (!(listeners instanceof Set)) return;
  const handlers = Array.from(listeners);
  for (let i = 0; i < handlers.length; i++) {
    const handler = handlers[i];
    try {
      await handler(payload);
    } catch (error) {
      reportRouteEventError(eventName, payload, error);
    }
  }
}

function buildNavigationPayload(context, extra) {
  const payload = {
    navigationId: context.token,
    navigationType: context.navigationType,
    to: cloneUrl(context.toUrl),
    from: cloneUrl(context.fromUrl),
    routeId: context.routeId,
    params: copyParams(context.params),
    stage: context.stage
  };
  if (extra && typeof extra === "object") {
    Object.assign(payload, extra);
  }
  return payload;
}

function emitNavigationError(context, extra) {
  if (!context) return;
  dispatchRouteEvent("navigation:error", buildNavigationPayload(context, extra));
}

async function emitNavigationEvent(context, eventName, extra, awaitHandlers) {
  const payload = buildNavigationPayload(context, extra);
  if (awaitHandlers) {
    await dispatchRouteEventAsync(eventName, payload);
    return;
  }
  dispatchRouteEvent(eventName, payload);
}

function emitNavigationAbort(context, extra) {
  if (!context || context.abortDispatched) return;
  context.abortDispatched = true;
  dispatchRouteEvent("navigation:abort", buildNavigationPayload(context, extra));
}

function ensureCurrentNavigation(context) {
  if (context && context.token === navigationToken) {
    return true;
  }
  if (context) {
    if (!context.abortReason) {
      context.abortReason = {
        reason: "superseded",
        abortedStage: context.stage
      };
    }
    emitNavigationAbort(context, context.abortReason);
  }
  return false;
}

function extractSsrData(parsed) {
  if (!parsed || typeof parsed.getElementById !== "function") return {};
  const ssrScript = parsed.getElementById("zenith-ssr-data");
  if (!ssrScript) return {};
  const source = typeof ssrScript.textContent === "string" ? ssrScript.textContent : "";
  const marker = "window.__zenith_ssr_data =";
  const markerIndex = source.indexOf(marker);
  if (markerIndex === -1) return {};
  const jsonText = source.slice(markerIndex + marker.length).trim().replace(/;$/, "");
  try {
    return JSON.parse(jsonText);
  } catch {
    return {};
  }
}

function parseDocumentPayload(html) {
  if (typeof DOMParser === "undefined") return null;
  const parsed = new DOMParser().parseFromString(html, "text/html");
  return {
    html,
    title: parsed.title || "",
    ssrData: extractSsrData(parsed)
  };
}

function isHtmlResponse(response) {
  const contentType = String(response.headers.get("content-type") || "");
  return /text\/html|application\/xhtml\+xml/i.test(contentType);
}

function createDocumentDetail(payload, response) {
  return {
    title: payload && typeof payload.title === "string" ? payload.title : "",
    hasSsrData: !!(payload && payload.ssrData && typeof payload.ssrData === "object"),
    status: response && typeof response.status === "number" ? response.status : 200
  };
}

function createScrollDetail(targetUrl, scrollTarget) {
  return {
    mode: scrollTarget.mode,
    x: scrollTarget.x,
    y: scrollTarget.y,
    hash: targetUrl.hash || ""
  };
}

async function requestRouteCheck(context, resolved, targetUrl, signal) {
  if (!requiresServerReload(resolved.route)) {
    return { kind: "allow" };
  }

  dispatchRouteEvent("route-check:start", {
    navigationId: context.token,
    navigationType: context.navigationType,
    to: cloneUrl(targetUrl),
    from: cloneUrl(context.fromUrl),
    routeId: resolved.route,
    params: copyParams(resolved.params),
    stage: "route-check"
  });

  try {
    const response = await fetch("/__zenith/route-check?path=" + encodeURIComponent(toNavigationPath(targetUrl)), {
      headers: { "x-zenith-route-check": "1" },
      credentials: "include",
      signal
    });
    const data = await response.json();
    if (!response.ok) {
      throw new Error("route-check failed");
    }
    const result = data && data.result ? data.result : { kind: "allow" };
    dispatchRouteEvent("route-check:end", {
      navigationId: context.token,
      navigationType: context.navigationType,
      to: cloneUrl(targetUrl),
      from: cloneUrl(context.fromUrl),
      routeId: resolved.route,
      params: copyParams(resolved.params),
      stage: "route-check",
      result
    });
    if (result.kind === "redirect") {
      dispatchRouteEvent("route:redirect", {
        navigationId: context.token,
        navigationType: context.navigationType,
        to: cloneUrl(targetUrl),
        from: cloneUrl(context.fromUrl),
        routeId: resolved.route,
        params: copyParams(resolved.params),
        stage: "route-check",
        result
      });
    }
    if (result.kind === "deny") {
      dispatchRouteEvent("route:deny", {
        navigationId: context.token,
        navigationType: context.navigationType,
        to: cloneUrl(targetUrl),
        from: cloneUrl(context.fromUrl),
        routeId: resolved.route,
        params: copyParams(resolved.params),
        stage: "route-check",
        result
      });
    }
    return result;
  } catch (error) {
    if (isAbortError(error)) {
      throw error;
    }
    dispatchRouteEvent("route-check:error", {
      navigationId: context.token,
      navigationType: context.navigationType,
      to: cloneUrl(targetUrl),
      from: cloneUrl(context.fromUrl),
      routeId: resolved.route,
      params: copyParams(resolved.params),
      stage: "route-check",
      error
    });
    return { kind: "allow" };
  }
}

function resolveRedirectUrl(location, fallbackUrl) {
  try {
    return new URL(location || fallbackUrl.href, fallbackUrl.href);
  } catch {
    return new URL(fallbackUrl.href);
  }
}

function navigateViaBrowser(targetUrl, replace) {
  if (!targetUrl || typeof targetUrl.href !== "string") return;
  if (replace && typeof window.location.replace === "function") {
    window.location.replace(targetUrl.href);
    return;
  }
  window.location.assign(targetUrl.href);
}

function dispatchNavigationFallback(context, detail) {
  emitNavigationAbort(context, detail);
}

async function performNavigation(targetUrl, historyMode, popstateState) {
  const resolved = resolveRoute(targetUrl.pathname);
  if (!resolved) {
    if (historyMode === "pop") {
      navigateViaBrowser(new URL(window.location.href), true);
      return true;
    }
    return false;
  }

  const context = beginNavigation(targetUrl, resolved, historyMode);
  let historyCommitted = false;
  let documentDetail = null;
  try {
    dispatchRouteEvent("navigation:request", buildNavigationPayload(context));

    context.stage = "route-check";
    const checkResult = await requestRouteCheck(context, resolved, targetUrl, context.signal);
    if (!ensureCurrentNavigation(context)) return false;
    if (checkResult.kind === "redirect") {
      const redirectUrl = resolveRedirectUrl(checkResult.location, targetUrl);
      dispatchNavigationFallback(context, {
        reason: "server-redirect",
        location: redirectUrl.href,
        status: checkResult.status
      });
      navigateViaBrowser(redirectUrl, historyMode === "pop");
      return true;
    }
    if (checkResult.kind === "deny") {
      dispatchNavigationFallback(context, {
        reason: "server-deny",
        status: checkResult.status
      });
      navigateViaBrowser(targetUrl, historyMode === "pop");
      return true;
    }

    context.stage = "fetch";
    const response = await fetch(targetUrl.href, {
      credentials: "include",
      headers: { Accept: "text/html,application/xhtml+xml" },
      redirect: "manual",
      signal: context.signal
    });
    if (!ensureCurrentNavigation(context)) return false;

    if (response.type === "opaqueredirect" || (response.status >= 300 && response.status < 400)) {
      const redirectUrl = resolveRedirectUrl(response.headers.get("location"), targetUrl);
      dispatchNavigationFallback(context, {
        reason: "server-redirect",
        location: redirectUrl.href,
        status: response.status
      });
      navigateViaBrowser(redirectUrl, historyMode === "pop");
      return true;
    }

    const html = await response.text();
    if (!ensureCurrentNavigation(context)) return false;
    if (response.status !== 200) {
      dispatchNavigationFallback(context, {
        reason: "http-status",
        status: response.status
      });
      navigateViaBrowser(targetUrl, historyMode === "pop");
      return true;
    }
    if (!isHtmlResponse(response)) {
      dispatchNavigationFallback(context, {
        reason: "non-html",
        status: response.status
      });
      navigateViaBrowser(targetUrl, historyMode === "pop");
      return true;
    }

    const payload = parseDocumentPayload(html);
    if (!payload) {
      dispatchNavigationFallback(context, {
        reason: "document-parse"
      });
      navigateViaBrowser(targetUrl, historyMode === "pop");
      return true;
    }

    documentDetail = createDocumentDetail(payload, response);

    context.stage = "data-ready";
    emitNavigationEvent(context, "navigation:data-ready", {
      document: documentDetail
    }, false);

    dispatchScrollEvent("before", {
      navigationType: historyMode,
      to: targetUrl.href,
      from: context.fromUrl ? context.fromUrl.href : window.location.href
    }, false);

    context.stage = "before-leave";
    await emitNavigationEvent(context, "navigation:before-leave", {
      document: documentDetail
    }, true);
    if (!ensureCurrentNavigation(context)) return false;

    context.stage = "leave-complete";
    emitNavigationEvent(context, "navigation:leave-complete", {
      document: documentDetail
    }, false);

    context.stage = "before-swap";
    await emitNavigationEvent(context, "navigation:before-swap", {
      document: documentDetail
    }, true);
    if (!ensureCurrentNavigation(context)) return false;

    if (historyMode === "push") {
      rememberScrollForKey(currentHistoryKey);
      pushHistoryEntry(targetUrl);
      historyCommitted = true;
    } else if (historyMode === "pop") {
      syncHistoryEntry(popstateState);
      historyCommitted = true;
    }
    currentUrl = new URL(targetUrl.href);

    if (payload.title) {
      document.title = payload.title;
    }

    const mounted = await mountRoute(resolved.route, resolved.params, context.token, payload);
    if (!mounted || !ensureCurrentNavigation(context)) return false;

    context.stage = "content-swapped";
    emitNavigationEvent(context, "navigation:content-swapped", {
      document: documentDetail,
      historyCommitted
    }, false);

    await nextFrame();
    if (!ensureCurrentNavigation(context)) return false;

    const scrollTarget = resolveScrollTarget(targetUrl, historyMode, popstateState);
    const scrollDetail = createScrollDetail(targetUrl, scrollTarget);
    const defaultScrollAllowed = dispatchScrollEvent("apply", {
      navigationType: historyMode,
      mode: scrollDetail.mode,
      x: scrollDetail.x,
      y: scrollDetail.y,
      hash: scrollDetail.hash
    }, true);
    if (defaultScrollAllowed) {
      applyNativeScroll(scrollTarget);
    }

    focusAfterNavigation(scrollTarget);
    rememberScrollForKey(currentHistoryKey, { x: scrollTarget.x, y: scrollTarget.y });

    context.stage = "before-enter";
    await emitNavigationEvent(context, "navigation:before-enter", {
      document: documentDetail,
      scroll: scrollDetail
    }, true);
    if (!ensureCurrentNavigation(context)) return false;

    dispatchScrollEvent("after", {
      navigationType: historyMode,
      mode: scrollDetail.mode,
      x: scrollDetail.x,
      y: scrollDetail.y,
      hash: scrollDetail.hash
    }, false);

    await nextFrame();
    if (!ensureCurrentNavigation(context)) return false;

    context.stage = "enter-complete";
    emitNavigationEvent(context, "navigation:enter-complete", {
      document: documentDetail,
      scroll: scrollDetail
    }, false);

    return true;
  } catch (error) {
    if (!isAbortError(error)) {
      emitNavigationError(context, {
        reason: "runtime-failure",
        error,
        historyCommitted,
        document: documentDetail
      });
      console.error("[Zenith Router] navigation failed", error);
      dispatchNavigationFallback(context, {
        reason: "runtime-failure",
        historyCommitted
      });
      navigateViaBrowser(targetUrl, historyMode === "pop" || historyCommitted);
      return true;
    }
    dispatchNavigationFallback(context, context.abortReason || {
      reason: "superseded",
      abortedStage: context.stage
    });
    return false;
  } finally {
    completeNavigation(context);
  }
}

function isInternalLink(anchor) {
  if (!anchor || anchor.target || anchor.hasAttribute("download")) return false;
  const href = anchor.getAttribute("href");
  if (!href || href.startsWith("#") || href.startsWith("mailto:") || href.startsWith("tel:")) {
    return false;
  }
  const url = new URL(anchor.href, window.location.href);
  return url.origin === window.location.origin;
}

async function mountInitialRoute() {
  const resolved = resolveRoute(window.location.pathname);
  if (!resolved) return;
  navigationToken += 1;
  currentUrl = new URL(window.location.href);
  await mountRoute(resolved.route, resolved.params, navigationToken, null);
}

function start() {
  if (typeof history === "object" && history && "scrollRestoration" in history) {
    history.scrollRestoration = "manual";
  }

  ensureHistoryEntry();
  currentUrl = new URL(window.location.href);
  rememberScrollForKey(currentHistoryKey);
  window.addEventListener("scroll", queueScrollSnapshot, { passive: true });
  window.addEventListener("hashchange", function() {
    currentUrl = new URL(window.location.href);
    queueScrollSnapshot();
  });

  document.addEventListener("click", function(event) {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const target = event.target && event.target.closest ? event.target.closest("a[data-zen-link]") : null;
    if (!isInternalLink(target)) return;

    const targetUrl = new URL(target.href, window.location.href);
    const hashOnly =
      currentUrl &&
      targetUrl.pathname === currentUrl.pathname &&
      targetUrl.search === currentUrl.search &&
      targetUrl.hash !== currentUrl.hash;
    if (hashOnly) return;
    if (currentUrl && targetUrl.pathname === currentUrl.pathname && targetUrl.search === currentUrl.search && targetUrl.hash === currentUrl.hash) {
      return;
    }
    if (!resolveRoute(targetUrl.pathname)) return;

    event.preventDefault();
    performNavigation(targetUrl, "push", null).catch(function(error) {
      if (!isAbortError(error)) {
        console.error("[Zenith Router] click navigation failed", error);
        navigateViaBrowser(targetUrl, false);
      }
    });
  });

  window.addEventListener("popstate", function(event) {
    const targetUrl = new URL(window.location.href);
    const hashOnly =
      currentUrl &&
      targetUrl.pathname === currentUrl.pathname &&
      targetUrl.search === currentUrl.search &&
      targetUrl.hash !== currentUrl.hash;
    if (hashOnly) {
      syncHistoryEntry(event.state);
      currentUrl = targetUrl;
      const scrollTarget = resolveScrollTarget(targetUrl, "pop", event.state);
      const defaultScrollAllowed = dispatchScrollEvent("apply", {
        navigationType: "pop",
        mode: scrollTarget.mode,
        x: scrollTarget.x,
        y: scrollTarget.y,
        hash: targetUrl.hash || ""
      }, true);
      if (defaultScrollAllowed) {
        applyNativeScroll(scrollTarget);
      }
      focusAfterNavigation(scrollTarget);
      rememberScrollForKey(currentHistoryKey, { x: scrollTarget.x, y: scrollTarget.y });
      dispatchScrollEvent("after", {
        navigationType: "pop",
        mode: scrollTarget.mode,
        x: scrollTarget.x,
        y: scrollTarget.y,
        hash: targetUrl.hash || ""
      }, false);
      return;
    }

    performNavigation(targetUrl, "pop", event.state).catch(function(error) {
      if (!isAbortError(error)) {
        console.error("[Zenith Router] popstate navigation failed", error);
        navigateViaBrowser(targetUrl, true);
      }
    });
  });

  mountInitialRoute().catch(function(error) {
    console.error("[Zenith Router] initial navigation failed", error);
  });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", start, { once: true });
} else {
  start();
}
