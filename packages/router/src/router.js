// ---------------------------------------------------------------------------
// router.js — Zenith Router V0
// ---------------------------------------------------------------------------
// Router assembly: wires match engine + history + runtime mount/unmount.
//
// Usage:
//   const router = createRouter({ routes, container });
//   router.start();
//
// - Explicit start() — no side effects on import or creation
// - Mount/unmount delegated to @zenithbuild/runtime
// - Deterministic first-match-wins
// ---------------------------------------------------------------------------

import { matchRoute } from './match.js';
import { listen, current } from './history.js';
import { _dispatchRouteChange } from './events.js';
import { _setNavigationResolver } from './navigate.js';

/**
 * Create a router instance.
 *
 * @param {{ routes: Array<{ path: string, load: Function }>, container: HTMLElement, mount?: Function, cleanup?: Function }} config
 * @returns {{ start: () => Promise<void>, destroy: () => void }}
 */
export function createRouter(config) {
    const { routes, container } = config;

    // Allow injecting mount/cleanup for testing without importing runtime
    const mountFn = config.mount || null;
    const cleanupFn = config.cleanup || null;

    if (!container || !(container instanceof HTMLElement)) {
        throw new Error('[Zenith Router] createRouter() requires an HTMLElement container');
    }

    if (!Array.isArray(routes) || routes.length === 0) {
        throw new Error('[Zenith Router] createRouter() requires a non-empty routes array');
    }

    let _unlisten = null;
    let _started = false;
    let _hasMounted = false;

    /**
     * Resolve a path: match → load → mount.
     *
     * @param {string} path
     */
    async function _resolve(path) {
        const result = matchRoute(routes, path);

        if (!result) {
            _dispatchRouteChange({ path, matched: false });
            return;
        }

        // Teardown previous page (only if we've mounted before)
        if (_hasMounted && cleanupFn) {
            cleanupFn();
        }

        // Load module
        const pageModule = await result.route.load(result.params);

        // Mount new page
        if (mountFn) {
            mountFn(container, pageModule);
            _hasMounted = true;
        }

        _dispatchRouteChange({
            path,
            params: result.params,
            matched: true
        });
    }

    /**
     * Start the router — match initial route and begin listening.
     */
    async function start() {
        if (_started) return;
        _started = true;

        // Wire navigate() to use our resolver
        _setNavigationResolver(_resolve);

        // Listen for popstate (back/forward)
        _unlisten = listen((path) => {
            _resolve(path);
        });

        // Initial route
        await _resolve(current());
    }

    /**
     * Tear down the router — remove listeners, clear state.
     */
    function destroy() {
        if (_unlisten) {
            _unlisten();
            _unlisten = null;
        }
        _setNavigationResolver(null);
        _started = false;
    }

    return { start, destroy };
}
