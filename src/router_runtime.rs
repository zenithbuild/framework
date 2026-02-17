pub fn generate_router_runtime_js() -> String {
    r#"(function() {
  let activeCleanup = null;
  let navigationToken = 0;
  const __ZENITH_MANIFEST__ = window.__ZENITH_MANIFEST__;

  function splitPath(path) {
    return path.split('/').filter(Boolean);
  }

  function resolveRoute(pathname) {
    if (__ZENITH_MANIFEST__.chunks[pathname]) {
      return {
        route: pathname,
        params: Object.freeze({})
      };
    }

    const pathnameSegments = splitPath(pathname);
    const routes = Object.keys(__ZENITH_MANIFEST__.chunks);

    for (let i = 0; i < routes.length; i++) {
      const route = routes[i];
      const routeSegments = splitPath(route);
      if (routeSegments.length !== pathnameSegments.length) continue;

      const params = Object.create(null);
      let matched = true;

      for (let j = 0; j < routeSegments.length; j++) {
        const routeSegment = routeSegments[j];
        const pathnameSegment = pathnameSegments[j];
        if (routeSegment.startsWith(':')) {
          params[routeSegment.slice(1)] = pathnameSegment;
          continue;
        }

        if (routeSegment !== pathnameSegment) {
          matched = false;
          break;
        }
      }

      if (matched) {
        return {
          route,
          params: Object.freeze({ ...params })
        };
      }
    }

    return null;
  }

  function teardownRuntime() {
    if (typeof activeCleanup === 'function') {
      activeCleanup();
      activeCleanup = null;
    }
  }

  function readRouterSsrPayload() {
    try {
      const encoded = new URL(import.meta.url).searchParams.get('__zenith_ssr');
      if (!encoded) return null;
      const decoded = JSON.parse(decodeURIComponent(encoded));
      if (decoded && typeof decoded === 'object' && !Array.isArray(decoded)) {
        return decoded;
      }
    } catch {
      return null;
    }
    return null;
  }

  const __routerSsrPayload = readRouterSsrPayload();
  if (__routerSsrPayload) {
    globalThis.__zenith_ssr_data = Object.freeze(__routerSsrPayload);
  }

  async function mountRoute(route, params, token) {
    if (token !== navigationToken) return;
    teardownRuntime();
    if (token !== navigationToken) return;

    const pageModule = await import(__ZENITH_MANIFEST__.chunks[route]);
    if (token !== navigationToken) return;

    const mountFn = pageModule.__zenith_mount || pageModule.default;
    if (typeof mountFn === 'function') {
      const cleanup = mountFn(document, params);
      activeCleanup = typeof cleanup === 'function' ? cleanup : null;
    }
  }

  async function navigate(pathname, push) {
    const next = resolveRoute(pathname);
    if (!next) return false;

    navigationToken += 1;
    if (push) {
      history.pushState({}, '', pathname);
    }
    await mountRoute(next.route, next.params, navigationToken);
    return true;
  }

  function handleNavigationFailure(error, url) {
    console.error('[Zenith Router] navigation failed', error);
    if (url && typeof url.href === 'string') {
      window.location.assign(url.href);
    }
  }

  function isInternalLink(anchor) {
    if (!anchor || anchor.target || anchor.hasAttribute('download')) return false;
    const href = anchor.getAttribute('href');
    if (!href || href.startsWith('#') || href.startsWith('mailto:') || href.startsWith('tel:')) {
      return false;
    }
    const url = new URL(anchor.href, window.location.href);
    return url.origin === window.location.origin;
  }

  function start() {
    document.addEventListener('click', function(event) {
      const target = event.target && event.target.closest ? event.target.closest('a[href]') : null;
      if (!isInternalLink(target)) return;

      const url = new URL(target.href, window.location.href);
      const nextPath = url.pathname;
      if (nextPath === window.location.pathname) return;
      if (!resolveRoute(nextPath)) return;

      event.preventDefault();
      navigate(nextPath, true).catch(function(error) {
        handleNavigationFailure(error, url);
      });
    });

    window.addEventListener('popstate', function() {
      navigate(window.location.pathname, false).catch(function(error) {
        console.error('[Zenith Router] popstate navigation failed', error);
      });
    });

    navigate(window.location.pathname, false).catch(function(error) {
      console.error('[Zenith Router] initial navigation failed', error);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, { once: true });
  } else {
    start();
  }
})();"#
        .to_string()
}
