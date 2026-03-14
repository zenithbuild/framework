export function renderRouterLifecycleSource() {
    return `function routeEventListeners() {
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
}`;
}
