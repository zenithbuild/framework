// ---------------------------------------------------------------------------
// path.js — Zenith Core V0
// ---------------------------------------------------------------------------
// Path normalization utilities. Pure transforms — no filesystem access.
//
// - Normalizes separators (\ → /)
// - Converts [param] → :param
// - Extracts params from route strings
// - Validates no repeated param names
// - Strips file extensions
// ---------------------------------------------------------------------------

/**
 * Normalize path separators to forward slashes.
 *
 * @param {string} filePath
 * @returns {string}
 */
export function normalizeSeparators(filePath) {
    return filePath.replace(/\\/g, '/');
}

/**
 * Convert a file-system path to a route path.
 *
 * Rules:
 * - Normalize separators
 * - Strip the extension
 * - Convert [param] → :param
 * - index files → parent path
 * - Ensure leading /
 *
 * @param {string} filePath  Relative path from pages dir (e.g. "users/[id].zen")
 * @param {string} [extension='.zen']
 * @returns {string}
 */
export function fileToRoute(filePath, extension = '.zen') {
    let route = normalizeSeparators(filePath);

    // Strip extension
    if (route.endsWith(extension)) {
        route = route.slice(0, -extension.length);
    }

    // Convert [param] → :param
    route = route.replace(/\[([^\]]+)\]/g, ':$1');

    // Handle index → parent
    if (route === 'index') {
        return '/';
    }
    if (route.endsWith('/index')) {
        route = route.slice(0, -'/index'.length);
    }

    // Ensure leading /
    if (!route.startsWith('/')) {
        route = '/' + route;
    }

    return route;
}

/**
 * Extract parameter names from a route path.
 *
 * @param {string} routePath  e.g. "/users/:id/posts/:postId"
 * @returns {string[]}  e.g. ["id", "postId"]
 */
export function extractParams(routePath) {
    const params = [];
    const segments = routePath.split('/');
    for (const segment of segments) {
        if (segment.startsWith(':')) {
            params.push(segment.slice(1));
        }
    }
    return params;
}

/**
 * Check if a route path contains dynamic segments.
 *
 * @param {string} routePath
 * @returns {boolean}
 */
export function isDynamic(routePath) {
    return routePath.includes(':');
}

/**
 * Validate that a route path has no repeated parameter names.
 * Throws on violation.
 *
 * @param {string} routePath
 */
export function validateRouteParams(routePath) {
    const params = extractParams(routePath);
    const seen = new Set();
    for (const param of params) {
        if (seen.has(param)) {
            throw new Error(
                `[Zenith:Path] Repeated parameter name ":${param}" in route "${routePath}"`
            );
        }
        seen.add(param);
    }
}

/**
 * Canonicalize a route path.
 * Strips trailing slashes (except root), normalizes separators.
 *
 * @param {string} routePath
 * @returns {string}
 */
export function canonicalize(routePath) {
    let path = normalizeSeparators(routePath);

    // Remove trailing slash (unless root)
    if (path.length > 1 && path.endsWith('/')) {
        path = path.slice(0, -1);
    }

    // Ensure leading slash
    if (!path.startsWith('/')) {
        path = '/' + path;
    }

    return path;
}
