import { createHash } from 'node:crypto';

export function normalizeRouteName(routePath) {
    if (routePath === '/') {
        return 'index';
    }
    return routePath
        .replace(/^\//, '')
        .replace(/\/+/g, '_')
        .replace(/:/g, 'param_')
        .replace(/\*/g, 'splat_')
        .replace(/\?/g, 'opt')
        .replace(/[^a-zA-Z0-9_]/g, '_')
        .replace(/_+/g, '_')
        .replace(/^_+|_+$/g, '') || 'route';
}

function routeNameHash(route) {
    return createHash('sha256')
        .update(`${route.route_kind || 'page'}:${route.path || ''}`)
        .digest('hex')
        .slice(0, 8);
}

export function assignServerRouteNames(routes) {
    const used = new Set();
    return routes.map((route) => {
        const baseName = normalizeRouteName(route.path);
        let name = baseName;
        if (used.has(name)) {
            name = `${baseName}_${routeNameHash(route)}`;
        }
        let suffix = 2;
        while (used.has(name)) {
            name = `${baseName}_${routeNameHash(route)}_${suffix}`;
            suffix += 1;
        }
        used.add(name);
        return { route, name };
    });
}
