export function renderRouterRefreshSource() {
    return `const __ZENITH_REFRESH_CURRENT_ROUTE_KEY = "__zenith_refresh_current_route";

async function refreshCurrentRouteInternal() {
  const targetUrl = new URL(window.location.href);
  const resolved = resolveRoute(targetUrl.pathname);
  if (!resolved) {
    throw new Error("[Zenith Router] refreshCurrentRoute() requires a current matched Zenith page route");
  }
  await performNavigation(targetUrl, "refresh", null);
}

zenithScope()[__ZENITH_REFRESH_CURRENT_ROUTE_KEY] = refreshCurrentRouteInternal;`;
}
