import { normalizeBasePath, prependBasePath } from '../base-path.js';

interface StaticRoute {
    path: string;
    html: string;
}

interface VercelRoute {
    src: string;
    dest: string;
}

function splitRouteSegments(routePath: string): string[] {
    return String(routePath || '').split('/').filter(Boolean);
}

function escapeRegex(value: string): string {
    return String(value).replace(/[|\\{}()[\]^$+*?.-]/g, '\\$&');
}

function buildNetlifyPatternSegment(segment: string): string {
    if (segment.startsWith(':')) {
        return segment;
    }
    return segment;
}

export function createNetlifyBasePathAssetRules(basePath: string): string[] {
    const normalizedBasePath = normalizeBasePath(basePath);
    if (normalizedBasePath === '/') {
        return [];
    }
    return [
        `${prependBasePath(normalizedBasePath, '/assets/*')} /assets/:splat 200`,
        `${prependBasePath(normalizedBasePath, '/_zenith/image/local/*')} /_zenith/image/local/:splat 200`
    ];
}

export function createNetlifyImageEndpointRule(basePath: string): string {
    return `${prependBasePath(basePath, '/_zenith/image')} /.netlify/functions/__zenith_image 200!`;
}

export function createNetlifyRewriteRules(route: StaticRoute, basePath = '/'): string[] {
    const segments = splitRouteSegments(route.path);
    if (segments.length === 0) {
        return [`${prependBasePath(basePath, '/')} ${route.html} 200`];
    }

    const terminal = segments[segments.length - 1];
    const prefixSegments = segments.slice(0, -1).map(buildNetlifyPatternSegment);
    const prefix = prefixSegments.length > 0 ? `/${prefixSegments.join('/')}` : '';

    if (terminal.startsWith('*') && terminal.endsWith('?')) {
        const exactPath = prefix || '/';
        const splatPath = prefix ? `${prefix}/*` : '/*';
        return [
            `${prependBasePath(basePath, exactPath)} ${route.html} 200`,
            `${prependBasePath(basePath, splatPath)} ${route.html} 200`
        ];
    }

    if (terminal.startsWith('*')) {
        const splatPath = prefix ? `${prefix}/*` : '/*';
        return [`${prependBasePath(basePath, splatPath)} ${route.html} 200`];
    }

    const path = `/${segments.map(buildNetlifyPatternSegment).join('/')}`;
    return [`${prependBasePath(basePath, path)} ${route.html} 200`];
}

export function createVercelBasePathAssetRoutes(basePath: string): VercelRoute[] {
    const normalizedBasePath = normalizeBasePath(basePath);
    if (normalizedBasePath === '/') {
        return [];
    }
    const escaped = escapeRegex(normalizedBasePath);
    return [
        {
            src: `^${escaped}/assets/(.+)$`,
            dest: '/assets/$1'
        },
        {
            src: `^${escaped}/_zenith/image/local/(.+)$`,
            dest: '/_zenith/image/local/$1'
        }
    ];
}

export function createVercelImageEndpointRoute(basePath: string): VercelRoute {
    return {
        src: createVercelRouteSource('/_zenith/image', basePath),
        dest: '/__zenith/image'
    };
}

export function createVercelRouteSource(routePath: string, basePath = '/'): string {
    const segments = splitRouteSegments(routePath);
    if (segments.length === 0) {
        const rootPath = prependBasePath(basePath, '/');
        return rootPath === '/' ? '^/?$' : `^${escapeRegex(rootPath)}/?$`;
    }

    let pattern = `^${escapeRegex(normalizeBasePath(basePath) === '/' ? '' : normalizeBasePath(basePath))}`;
    for (const segment of segments) {
        if (segment.startsWith(':')) {
            pattern += '/([^/]+)';
            continue;
        }
        if (segment.startsWith('*') && segment.endsWith('?')) {
            pattern += '(?:/(.*))?';
            continue;
        }
        if (segment.startsWith('*')) {
            pattern += '/(.+)';
            continue;
        }
        pattern += `/${escapeRegex(segment)}`;
    }
    pattern += '/?$';
    return pattern;
}
