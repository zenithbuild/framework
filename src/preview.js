// ---------------------------------------------------------------------------
// preview.js — Zenith CLI V0
// ---------------------------------------------------------------------------
// Static preview server.
//
// Serves /dist folder only.
// No compilation. No bundling. Pure static.
// Verifies build output is independent of dev mode.
// ---------------------------------------------------------------------------

import { createServer } from 'node:http';
import { access, readFile } from 'node:fs/promises';
import { extname, join, normalize, resolve, sep } from 'node:path';

const MIME_TYPES = {
    '.html': 'text/html',
    '.js': 'application/javascript',
    '.css': 'text/css',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.svg': 'image/svg+xml'
};

/**
 * Create and start a static preview server.
 *
 * @param {{ distDir: string, port?: number }} options
 * @returns {Promise<{ server: import('http').Server, port: number, close: () => void }>}
 */
export async function createPreviewServer(options) {
    const { distDir, port = 4000 } = options;
    const dynamicRoutes = await loadDynamicRouteManifest(distDir);

    const server = createServer(async (req, res) => {
        const url = new URL(req.url, `http://localhost:${port}`);
        const filePath = await resolvePreviewPath(distDir, url.pathname, dynamicRoutes);

        try {
            if (!filePath) {
                throw new Error('not found');
            }
            const content = await readFile(filePath);
            const ext = extname(filePath);
            const mime = MIME_TYPES[ext] || 'application/octet-stream';

            res.writeHead(200, { 'Content-Type': mime });
            res.end(content);
        } catch {
            res.writeHead(404, { 'Content-Type': 'text/plain' });
            res.end('404 Not Found');
        }
    });

    return new Promise((resolve) => {
        server.listen(port, () => {
            const actualPort = server.address().port;
            resolve({
                server,
                port: actualPort,
                close: () => { server.close(); }
            });
        });
    });
}

async function resolvePreviewPath(distDir, requestPathname, dynamicRoutes) {
    const directPath = toStaticFilePath(distDir, requestPathname);
    if (directPath && await fileExists(directPath)) {
        return directPath;
    }

    if (extname(requestPathname)) {
        return null;
    }

    const routeEntry = matchDynamicRoute(requestPathname, dynamicRoutes);
    if (!routeEntry) {
        return null;
    }

    const output = routeEntry.output.startsWith('/')
        ? routeEntry.output.slice(1)
        : routeEntry.output;
    const rewrittenPath = resolveWithinDist(distDir, output);
    if (rewrittenPath && await fileExists(rewrittenPath)) {
        return rewrittenPath;
    }

    return null;
}

function toStaticFilePath(distDir, pathname) {
    let resolved = pathname;
    if (resolved === '/') {
        resolved = '/index.html';
    } else if (!extname(resolved)) {
        resolved += '/index.html';
    }
    return resolveWithinDist(distDir, resolved);
}

function resolveWithinDist(distDir, requestPath) {
    let decoded = requestPath;
    try {
        decoded = decodeURIComponent(requestPath);
    } catch {
        return null;
    }

    const normalized = normalize(decoded).replace(/\\/g, '/');
    const relative = normalized.replace(/^\/+/, '');
    const root = resolve(distDir);
    const candidate = resolve(root, relative);
    if (candidate === root || candidate.startsWith(`${root}${sep}`)) {
        return candidate;
    }
    return null;
}

function splitPath(pathname) {
    return pathname.split('/').filter(Boolean);
}

function matchDynamicRoute(pathname, routes) {
    const target = splitPath(pathname);
    for (let i = 0; i < routes.length; i++) {
        const route = routes[i];
        const pattern = splitPath(route.path);
        if (pattern.length !== target.length) {
            continue;
        }

        let matched = true;
        for (let j = 0; j < pattern.length; j++) {
            const segment = pattern[j];
            if (segment.startsWith(':')) {
                continue;
            }
            if (segment !== target[j]) {
                matched = false;
                break;
            }
        }

        if (matched) {
            return route;
        }
    }

    return null;
}

async function loadDynamicRouteManifest(distDir) {
    const manifestPath = join(distDir, 'assets', 'router-manifest.json');
    try {
        const source = await readFile(manifestPath, 'utf8');
        const parsed = JSON.parse(source);
        const routes = Array.isArray(parsed?.routes) ? parsed.routes : [];
        return routes
            .filter((entry) =>
                entry &&
                typeof entry === 'object' &&
                typeof entry.path === 'string' &&
                typeof entry.output === 'string' &&
                entry.path.includes(':')
            )
            .sort((a, b) => a.path.localeCompare(b.path));
    } catch {
        return [];
    }
}

async function fileExists(fullPath) {
    try {
        await access(fullPath);
        return true;
    } catch {
        return false;
    }
}
