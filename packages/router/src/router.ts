// ---------------------------------------------------------------------------
// router.ts — Zenith Router V0
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

import { _dispatchRouteChange } from './events.js';
import { current, listen } from './history.js';
import { matchRoute } from './match.js';
import { _setNavigationResolver } from './navigate.js';

type RouteParams = Record<string, string>;
type RouteLoader = (params: RouteParams) => unknown | Promise<unknown>;
type RouteDefinition = {
    path: string;
    load: RouteLoader;
};
type MountFn = (target: HTMLElement, pageModule: unknown) => void;
type CleanupFn = () => void;

type RouterConfig = {
    routes: RouteDefinition[];
    container: HTMLElement;
    mount?: unknown;
    cleanup?: unknown;
};

type RouterInstance = {
    start: () => Promise<void>;
    destroy: () => void;
};

export function createRouter(config: RouterConfig): RouterInstance {
    const { routes, container } = config;

    const mountFn = typeof config.mount === 'function' ? (config.mount as MountFn) : null;
    const cleanupFn = typeof config.cleanup === 'function' ? (config.cleanup as CleanupFn) : null;

    if (!container || !(container instanceof HTMLElement)) {
        throw new Error('[Zenith Router] createRouter() requires an HTMLElement container');
    }

    if (!Array.isArray(routes) || routes.length === 0) {
        throw new Error('[Zenith Router] createRouter() requires a non-empty routes array');
    }

    let unlisten: (() => void) | null = null;
    let started = false;
    let hasMounted = false;

    async function resolvePath(path: string): Promise<void> {
        const result = matchRoute(routes, path);

        if (!result) {
            _dispatchRouteChange({ path, matched: false });
            return;
        }

        if (hasMounted && cleanupFn) {
            cleanupFn();
        }

        const pageModule = await result.route.load(result.params);
        if (mountFn) {
            mountFn(container, pageModule);
            hasMounted = true;
        }

        _dispatchRouteChange({
            path,
            params: result.params,
            matched: true
        });
    }

    async function start(): Promise<void> {
        if (started) return;
        started = true;

        _setNavigationResolver(resolvePath);
        unlisten = listen((path) => {
            void resolvePath(path);
        });

        await resolvePath(current());
    }

    function destroy(): void {
        if (unlisten) {
            unlisten();
            unlisten = null;
        }
        _setNavigationResolver(null);
        started = false;
    }

    return { start, destroy };
}
