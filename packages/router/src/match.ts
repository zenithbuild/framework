// ---------------------------------------------------------------------------
// match.ts — Zenith Router V0
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

type RouteParams = Record<string, string>;

type RouteEntry = {
    path: string;
    load: (params: RouteParams) => unknown;
};

type MatchResult = {
    route: RouteEntry;
    params: RouteParams;
};

/**
 * Match a pathname against a single route definition.
 */
export function matchPath(routePath: string, pathname: string): { matched: boolean; params: RouteParams } {
    const routeSegments = splitPath(routePath);
    const pathSegments = splitPath(pathname);

    const params: RouteParams = {};
    let routeIndex = 0;
    let pathIndex = 0;

    while (routeIndex < routeSegments.length) {
        const routeSeg = routeSegments[routeIndex] || '';
        if (routeSeg.startsWith('*')) {
            const optionalCatchAll = routeSeg.endsWith('?');
            const paramName = optionalCatchAll ? routeSeg.slice(1, -1) : routeSeg.slice(1);
            if (routeIndex !== routeSegments.length - 1) {
                return { matched: false, params: {} };
            }

            const rest = pathSegments.slice(pathIndex);
            const rootRequiredCatchAll = !optionalCatchAll && routeSegments.length === 1;
            if (rest.length === 0 && !optionalCatchAll && !rootRequiredCatchAll) {
                return { matched: false, params: {} };
            }

            params[paramName] = normalizeCatchAll(rest);
            pathIndex = pathSegments.length;
            routeIndex = routeSegments.length;
            break;
        }

        if (pathIndex >= pathSegments.length) {
            return { matched: false, params: {} };
        }

        const pathSeg = pathSegments[pathIndex] || '';
        if (routeSeg.startsWith(':')) {
            params[routeSeg.slice(1)] = pathSeg;
        } else if (routeSeg !== pathSeg) {
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
 */
export function matchRoute(routes: RouteEntry[], pathname: string): MatchResult | null {
    const ordered = [...routes].sort((a, b) => compareRouteSpecificity(a.path, b.path));
    for (const route of ordered) {
        const result = matchPath(route.path, pathname);
        if (result.matched) {
            return { route, params: result.params };
        }
    }

    return null;
}

function splitPath(path: string): string[] {
    return path.split('/').filter(Boolean);
}

function normalizeCatchAll(segments: string[]): string {
    return segments.filter(Boolean).join('/');
}

function compareRouteSpecificity(a: string, b: string): number {
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
    for (let index = 0; index < max; index += 1) {
        const aWeight = segmentWeight(aSegs[index]);
        const bWeight = segmentWeight(bSegs[index]);
        if (aWeight !== bWeight) {
            return bWeight - aWeight;
        }
    }

    if (aSegs.length !== bSegs.length) {
        return bSegs.length - aSegs.length;
    }

    return a.localeCompare(b);
}

function routeClass(segments: string[]): number {
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

function segmentWeight(segment: string | undefined): number {
    if (!segment) return 0;
    if (segment.startsWith('*')) return 1;
    if (segment.startsWith(':')) return 2;
    return 3;
}
