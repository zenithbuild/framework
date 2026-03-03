// ---------------------------------------------------------------------------
// match.js — Zenith Router V0
// ---------------------------------------------------------------------------
// Deterministic path matching engine.
//
// Algorithm:
//   1. Split pathname and route path by '/'
//   2. Walk segments:
//      - ':param' → extract one segment into params object
//      - '*slug'  → extract remaining segments (must be terminal, 1+ segments,
//                   except root catch-all '/*slug' which allows 0+)
//      - '*slug?' → optional catch-all (must be terminal, 0+ segments)
//      - literal  → exact string comparison
//   3. Deterministic precedence: static > :param > *catchall
//
// No regex.
// ---------------------------------------------------------------------------

/**
 * @typedef {{ path: string, load: Function }} RouteEntry
 * @typedef {{ route: RouteEntry, params: Record<string, string> }} MatchResult
 */

/**
 * Match a pathname against a single route definition.
 *
 * @param {string} routePath - The route pattern (e.g. '/users/:id')
 * @param {string} pathname  - The actual URL path (e.g. '/users/42')
 * @returns {{ matched: boolean, params: Record<string, string> }}
 */
export function matchPath(routePath, pathname) {
    const routeSegments = _splitPath(routePath);
    const pathSegments = _splitPath(pathname);

    /** @type {Record<string, string>} */
    const params = {};
    let routeIndex = 0;
    let pathIndex = 0;

    while (routeIndex < routeSegments.length) {
        const routeSeg = routeSegments[routeIndex] || '';
        if (routeSeg.startsWith('*')) {
            // Catch-all must be terminal.
            const optionalCatchAll = routeSeg.endsWith('?');
            const paramName = optionalCatchAll
                ? routeSeg.slice(1, -1)
                : routeSeg.slice(1);
            if (routeIndex !== routeSegments.length - 1) {
                return { matched: false, params: {} };
            }
            const rest = pathSegments.slice(pathIndex);
            const rootRequiredCatchAll = !optionalCatchAll && routeSegments.length === 1;
            if (rest.length === 0 && !optionalCatchAll && !rootRequiredCatchAll) {
                return { matched: false, params: {} };
            }
            params[paramName] = _normalizeCatchAll(rest);
            pathIndex = pathSegments.length;
            routeIndex = routeSegments.length;
            break;
        }

        if (pathIndex >= pathSegments.length) {
            return { matched: false, params: {} };
        }

        const pathSeg = pathSegments[pathIndex] || '';
        if (routeSeg.startsWith(':')) {
            // Dynamic param — extract value as string
            const paramName = routeSeg.slice(1);
            params[paramName] = pathSeg;
        } else if (routeSeg !== pathSeg) {
            // Literal mismatch
            return { matched: false, params: {} };
        }

        routeIndex += 1;
        pathIndex += 1;
    }

    if (routeIndex !== routeSegments.length || pathIndex !== pathSegments.length) {
        return { matched: false, params: {} };
    }

    return { matched: true, params };
}

/**
 * Match a pathname against an ordered array of route definitions.
 * Returns the first match (deterministic, first-match-wins).
 *
 * @param {RouteEntry[]} routes - Ordered route manifest
 * @param {string} pathname     - The URL path to match
 * @returns {MatchResult | null}
 */
export function matchRoute(routes, pathname) {
    const ordered = [...routes].sort((a, b) => _compareRouteSpecificity(a.path, b.path));
    for (let i = 0; i < ordered.length; i++) {
        const route = ordered[i];
        const result = matchPath(route.path, pathname);

        if (result.matched) {
            return { route, params: result.params };
        }
    }

    return null;
}

/**
 * Split a path string into non-empty segments.
 *
 * @param {string} path
 * @returns {string[]}
 */
function _splitPath(path) {
    return path.split('/').filter(Boolean);
}

/**
 * Catch-all params are normalized as slash-joined, non-empty path segments.
 * Segments keep raw URL-encoded bytes (no decodeURIComponent).
 *
 * @param {string[]} segments
 * @returns {string}
 */
function _normalizeCatchAll(segments) {
    return segments.filter(Boolean).join('/');
}

/**
 * @param {string} a
 * @param {string} b
 * @returns {number}
 */
function _compareRouteSpecificity(a, b) {
    if (a === '/' && b !== '/') return -1;
    if (b === '/' && a !== '/') return 1;

    const aSegs = _splitPath(a);
    const bSegs = _splitPath(b);
    const aClass = _routeClass(aSegs);
    const bClass = _routeClass(bSegs);
    if (aClass !== bClass) {
        return bClass - aClass;
    }

    const max = Math.min(aSegs.length, bSegs.length);

    for (let i = 0; i < max; i++) {
        const aWeight = _segmentWeight(aSegs[i]);
        const bWeight = _segmentWeight(bSegs[i]);
        if (aWeight !== bWeight) {
            return bWeight - aWeight;
        }
    }

    if (aSegs.length !== bSegs.length) {
        return bSegs.length - aSegs.length;
    }

    return a.localeCompare(b);
}

/**
 * @param {string[]} segments
 * @returns {number}
 */
function _routeClass(segments) {
    let hasParam = false;
    let hasCatchAll = false;
    for (const segment of segments) {
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

/**
 * @param {string | undefined} segment
 * @returns {number}
 */
function _segmentWeight(segment) {
    if (!segment) return 0;
    if (segment.startsWith('*')) return 1;
    if (segment.startsWith(':')) return 2;
    return 3;
}
