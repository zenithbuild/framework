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
//   - [...slug].zen → *slug catch-all segment (must be terminal, 1+ segments;
//                     root '/*slug' may match '/' in router matcher)
//   - [[...slug]].zen → *slug? optional catch-all segment (must be terminal, 0+ segments)
//   - Deterministic precedence: static > :param > *catchall
//   - Tie-breaker: lexicographic route path
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
    _validateManifestConflicts(entries);

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
 * pages/docs/[...slug].zen → /docs/*slug
 * pages/[[...slug]].zen → /*slug?
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
        // [[...param]] → *param? (optional catch-all)
        const optionalCatchAllMatch = seg.match(/^\[\[\.\.\.([a-zA-Z_][a-zA-Z0-9_]*)\]\]$/);
        if (optionalCatchAllMatch) {
            return '*' + optionalCatchAllMatch[1] + '?';
        }

        // [...param] → *param (required catch-all)
        const catchAllMatch = seg.match(/^\[\.\.\.([a-zA-Z_][a-zA-Z0-9_]*)\]$/);
        if (catchAllMatch) {
            return '*' + catchAllMatch[1];
        }

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

    for (let i = 0; i < segments.length; i++) {
        const seg = segments[i];
        if (seg.startsWith(':') || seg.startsWith('*')) {
            const rawName = seg.slice(1);
            const isCatchAll = seg.startsWith('*');
            const optionalCatchAll = isCatchAll && rawName.endsWith('?');
            const name = optionalCatchAll ? rawName.slice(0, -1) : rawName;
            const label = isCatchAll ? `*${rawName}` : `:${name}`;
            if (paramNames.has(name)) {
                throw new Error(
                    `[Zenith CLI] Repeated param name '${label}' in route '${routePath}'`
                );
            }
            if (isCatchAll && i !== segments.length - 1) {
                throw new Error(
                    `[Zenith CLI] Catch-all segment '${label}' must be the last segment in route '${routePath}'`
                );
            }
            paramNames.add(name);
        }
    }
}

/**
 * Reject duplicate or structurally ambiguous routes across different files.
 *
 * @param {ManifestEntry[]} entries
 */
function _validateManifestConflicts(entries) {
    /** @type {Map<string, ManifestEntry>} */
    const exactPaths = new Map();
    /** @type {Map<string, ManifestEntry>} */
    const structural = new Map();

    for (const entry of entries) {
        const existingExact = exactPaths.get(entry.path);
        if (existingExact) {
            throw new Error(
                `[Zenith CLI] Duplicate route path '${entry.path}' generated by '${existingExact.file}' and '${entry.file}'`
            );
        }
        exactPaths.set(entry.path, entry);

        const signature = _routeConflictSignature(entry.path);
        const existingStructural = structural.get(signature);
        if (existingStructural && existingStructural.path !== entry.path) {
            throw new Error(
                `[Zenith CLI] Ambiguous route patterns '${existingStructural.path}' (${existingStructural.file}) and '${entry.path}' (${entry.file}) match the same URL shape`
            );
        }
        if (!existingStructural) {
            structural.set(signature, entry);
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
    return routePath.split('/').some((seg) => seg.startsWith(':') || seg.startsWith('*'));
}

/**
 * Sort manifest entries by deterministic route precedence.
 *
 * @param {ManifestEntry[]} entries
 * @returns {ManifestEntry[]}
 */
function _sortEntries(entries) {
    return [...entries].sort((a, b) => compareRouteSpecificity(a.path, b.path));
}

/**
 * Normalize a route path so structurally equivalent param names conflict.
 *
 * @param {string} routePath
 * @returns {string}
 */
function _routeConflictSignature(routePath) {
    const segments = routePath.split('/').filter(Boolean).map((segment) => {
        if (segment.startsWith('*')) {
            return segment.endsWith('?') ? '*?' : '*';
        }
        if (segment.startsWith(':')) {
            return ':';
        }
        return segment;
    });
    return '/' + segments.join('/');
}

/**
 * Deterministic route precedence:
 *   static segment > param segment > catch-all segment.
 * Tie-breakers: segment count (more specific first), then lexicographic path.
 *
 * @param {string} a
 * @param {string} b
 * @returns {number}
 */
function compareRouteSpecificity(a, b) {
    if (a === '/' && b !== '/') return -1;
    if (b === '/' && a !== '/') return 1;

    const aSegs = a.split('/').filter(Boolean);
    const bSegs = b.split('/').filter(Boolean);
    const aClass = routeClass(aSegs);
    const bClass = routeClass(bSegs);
    if (aClass !== bClass) {
        return bClass - aClass;
    }

    const max = Math.min(aSegs.length, bSegs.length);

    for (let i = 0; i < max; i++) {
        const aWeight = segmentWeight(aSegs[i]);
        const bWeight = segmentWeight(bSegs[i]);
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
function routeClass(segments) {
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
function segmentWeight(segment) {
    if (!segment) return 0;
    if (segment.startsWith('*')) return 1;
    if (segment.startsWith(':')) return 2;
    return 3;
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
