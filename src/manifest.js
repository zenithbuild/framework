// ---------------------------------------------------------------------------
// manifest.js — Zenith CLI V0
// ---------------------------------------------------------------------------
// File-based manifest engine.
//
// Scans a /pages directory and produces a deterministic RouteManifest.
//
// Rules:
//   - index.zen → parent directory path
//   - [param].zen → :param dynamic segment
//   - Static routes sort before dynamic routes
//   - Alphabetical within each category
//   - No nested params, no optionals, no wildcards
// ---------------------------------------------------------------------------

import { readdir, stat } from 'node:fs/promises';
import { join, relative, sep, basename, extname, dirname } from 'node:path';

/**
 * @typedef {{ path: string, file: string }} ManifestEntry
 */

/**
 * Scan a pages directory and produce a deterministic RouteManifest.
 *
 * @param {string} pagesDir - Absolute path to /pages directory
 * @param {string} [extension='.zen'] - File extension to scan for
 * @returns {Promise<ManifestEntry[]>}
 */
export async function generateManifest(pagesDir, extension = '.zen') {
    const entries = await _scanDir(pagesDir, pagesDir, extension);

    // Validate: no repeated param names in any single route
    for (const entry of entries) {
        _validateParams(entry.path);
    }

    // Sort: static first, dynamic after, alpha within each category
    return _sortEntries(entries);
}

/**
 * Recursively scan a directory for page files.
 *
 * @param {string} dir - Current directory
 * @param {string} root - Root pages directory
 * @param {string} ext - Extension to match
 * @returns {Promise<ManifestEntry[]>}
 */
async function _scanDir(dir, root, ext) {
    /** @type {ManifestEntry[]} */
    const entries = [];

    let items;
    try {
        items = await readdir(dir);
    } catch {
        return entries;
    }

    // Sort items for deterministic traversal
    items.sort();

    for (const item of items) {
        const fullPath = join(dir, item);
        const info = await stat(fullPath);

        if (info.isDirectory()) {
            const nested = await _scanDir(fullPath, root, ext);
            entries.push(...nested);
        } else if (item.endsWith(ext)) {
            const routePath = _fileToRoute(fullPath, root, ext);
            entries.push({ path: routePath, file: relative(root, fullPath) });
        }
    }

    return entries;
}

/**
 * Convert a file path to a route path.
 *
 * pages/index.zen       → /
 * pages/about.zen       → /about
 * pages/users/[id].zen  → /users/:id
 * pages/docs/api/index.zen → /docs/api
 *
 * @param {string} filePath - Absolute file path
 * @param {string} root - Root pages directory
 * @param {string} ext - Extension
 * @returns {string}
 */
function _fileToRoute(filePath, root, ext) {
    const rel = relative(root, filePath);
    const withoutExt = rel.slice(0, -ext.length);

    // Normalize path separators
    const segments = withoutExt.split(sep).filter(Boolean);

    // Convert segments
    const routeSegments = segments.map((seg) => {
        // [param] → :param
        const paramMatch = seg.match(/^\[([a-zA-Z_][a-zA-Z0-9_]*)\]$/);
        if (paramMatch) {
            return ':' + paramMatch[1];
        }
        return seg;
    });

    // Remove trailing 'index'
    if (routeSegments.length > 0 && routeSegments[routeSegments.length - 1] === 'index') {
        routeSegments.pop();
    }

    const route = '/' + routeSegments.join('/');
    return route;
}

/**
 * Validate that a route path has no repeated param names.
 *
 * @param {string} routePath
 * @throws {Error} If repeated params found
 */
function _validateParams(routePath) {
    const segments = routePath.split('/').filter(Boolean);
    const paramNames = new Set();

    for (const seg of segments) {
        if (seg.startsWith(':')) {
            const name = seg.slice(1);
            if (paramNames.has(name)) {
                throw new Error(
                    `[Zenith CLI] Repeated param name ':${name}' in route '${routePath}'`
                );
            }
            paramNames.add(name);
        }
    }
}

/**
 * Check if a route contains any dynamic segments.
 *
 * @param {string} routePath
 * @returns {boolean}
 */
function _isDynamic(routePath) {
    return routePath.split('/').some((seg) => seg.startsWith(':'));
}

/**
 * Sort manifest entries: static first, dynamic after, alpha within each.
 *
 * @param {ManifestEntry[]} entries
 * @returns {ManifestEntry[]}
 */
function _sortEntries(entries) {
    const statics = entries.filter((e) => !_isDynamic(e.path));
    const dynamics = entries.filter((e) => _isDynamic(e.path));

    statics.sort((a, b) => a.path.localeCompare(b.path));
    dynamics.sort((a, b) => a.path.localeCompare(b.path));

    return [...statics, ...dynamics];
}

/**
 * Generate a JavaScript module string from manifest entries.
 * Used for writing the manifest file to disk.
 *
 * @param {ManifestEntry[]} entries
 * @returns {string}
 */
export function serializeManifest(entries) {
    const lines = entries.map((e) => {
        const hasParams = _isDynamic(e.path);
        const loader = hasParams
            ? `(params) => import('./pages/${e.file}')`
            : `() => import('./pages/${e.file}')`;
        return `  { path: '${e.path}', load: ${loader} }`;
    });

    return `export default [\n${lines.join(',\n')}\n];\n`;
}
