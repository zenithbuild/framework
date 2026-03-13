export function renderRouterNavigationSource() {
    return `function extractSsrData(parsed) {
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
  return /text\\/html|application\\/xhtml\\+xml/i.test(contentType);
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
}`;
}
