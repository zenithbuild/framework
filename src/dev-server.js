// ---------------------------------------------------------------------------
// dev-server.js — Zenith CLI V0
// ---------------------------------------------------------------------------
// Development server with in-memory compilation and file watching.
//
// - Compiles pages on demand
// - Rebuilds on file change
// - Injects HMR client script
// - Server route resolution uses manifest matching
//
// V0: Uses Node.js http module + fs.watch. No external deps.
// ---------------------------------------------------------------------------

import { createServer } from 'node:http';
import { watch } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join, extname } from 'node:path';
import { build } from './build.js';
import {
    executeServerRoute,
    injectSsrPayload,
    loadRouteManifest,
    resolveWithinDist,
    toStaticFilePath
} from './preview.js';
import { resolveRequestRoute } from './server/resolve-request-route.js';

const MIME_TYPES = {
    '.html': 'text/html',
    '.js': 'application/javascript',
    '.css': 'text/css',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.svg': 'image/svg+xml'
};

const HMR_CLIENT_SCRIPT = `
<script>
// Zenith HMR Client V0
(function() {
    const es = new EventSource('/__zenith_hmr');
    es.onmessage = function(event) {
        if (event.data === 'reload') {
            window.location.reload();
        }
    };
    es.onerror = function() {
        setTimeout(function() { window.location.reload(); }, 1000);
    };
})();
</script>`;

/**
 * Create and start a development server.
 *
 * @param {{ pagesDir: string, outDir: string, port?: number, config?: object }} options
 * @returns {Promise<{ server: import('http').Server, port: number, close: () => void }>}
 */
export async function createDevServer(options) {
    const {
        pagesDir,
        outDir,
        port = 3000,
        config = {}
    } = options;

    /** @type {import('http').ServerResponse[]} */
    const hmrClients = [];
    let _watcher = null;

    // Initial build
    await build({ pagesDir, outDir, config });

    const server = createServer(async (req, res) => {
        const url = new URL(req.url, `http://localhost:${port}`);
        let pathname = url.pathname;

        // HMR endpoint
        if (pathname === '/__zenith_hmr') {
            res.writeHead(200, {
                'Content-Type': 'text/event-stream',
                'Cache-Control': 'no-cache',
                'Connection': 'keep-alive'
            });
            // Flush headers by sending initial comment
            res.write(': connected\n\n');
            hmrClients.push(res);
            req.on('close', () => {
                const idx = hmrClients.indexOf(res);
                if (idx !== -1) hmrClients.splice(idx, 1);
            });
            return;
        }

        if (pathname === '/__zenith/route-check') {
            try {
                const targetPath = String(url.searchParams.get('path') || '/');
                const targetUrl = new URL(targetPath, `http://localhost:${port}`);
                const routes = await loadRouteManifest(outDir);
                const resolvedCheck = resolveRequestRoute(targetUrl, routes);
                if (!resolvedCheck.matched || !resolvedCheck.route) {
                    res.writeHead(404, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: 'route_not_found' }));
                    return;
                }

                const checkResult = await executeServerRoute({
                    source: resolvedCheck.route.server_script || '',
                    sourcePath: resolvedCheck.route.server_script_path || '',
                    params: resolvedCheck.params,
                    requestUrl: targetUrl.toString(),
                    requestMethod: req.method || 'GET',
                    requestHeaders: req.headers,
                    routePattern: resolvedCheck.route.path,
                    routeFile: resolvedCheck.route.server_script_path || '',
                    routeId: resolvedCheck.route.route_id || ''
                });
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify(checkResult));
                return;
            } catch {
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'route_check_failed' }));
                return;
            }
        }

        try {
            const requestExt = extname(pathname);
            if (requestExt && requestExt !== '.html') {
                const assetPath = join(outDir, pathname);
                const asset = await readFile(assetPath);
                const mime = MIME_TYPES[requestExt] || 'application/octet-stream';
                res.writeHead(200, { 'Content-Type': mime });
                res.end(asset);
                return;
            }

            const routes = await loadRouteManifest(outDir);
            const resolved = resolveRequestRoute(url, routes);
            let filePath = null;

            if (resolved.matched && resolved.route) {
                console.log(`[zenith] Request: ${pathname} | Route: ${resolved.route.path} | Params: ${JSON.stringify(resolved.params)}`);
                const output = resolved.route.output.startsWith('/')
                    ? resolved.route.output.slice(1)
                    : resolved.route.output;
                filePath = resolveWithinDist(outDir, output);
            } else {
                filePath = toStaticFilePath(outDir, pathname);
            }

            if (!filePath) {
                throw new Error('not found');
            }

            let ssrPayload = null;
            if (resolved.matched && resolved.route?.server_script && resolved.route.prerender !== true) {
                let routeExecution = null;
                try {
                    routeExecution = await executeServerRoute({
                        source: resolved.route.server_script,
                        sourcePath: resolved.route.server_script_path || '',
                        params: resolved.params,
                        requestUrl: url.toString(),
                        requestMethod: req.method || 'GET',
                        requestHeaders: req.headers,
                        routePattern: resolved.route.path,
                        routeFile: resolved.route.server_script_path || '',
                        routeId: resolved.route.route_id || ''
                    });
                } catch (error) {
                    routeExecution = {
                        result: {
                            kind: 'deny',
                            status: 500,
                            message: error instanceof Error ? error.message : String(error)
                        },
                        trace: {
                            guard: 'none',
                            load: 'deny'
                        }
                    };
                }

                const trace = routeExecution?.trace || { guard: 'none', load: 'none' };
                const routeId = resolved.route.route_id || '';
                console.log(`[Zenith] guard(${routeId || resolved.route.path}) -> ${trace.guard}`);
                console.log(`[Zenith] load(${routeId || resolved.route.path}) -> ${trace.load}`);

                const result = routeExecution?.result;
                if (result && result.kind === 'redirect') {
                    const status = Number.isInteger(result.status) ? result.status : 302;
                    res.writeHead(status, {
                        Location: result.location,
                        'Cache-Control': 'no-store'
                    });
                    res.end('');
                    return;
                }
                if (result && result.kind === 'deny') {
                    const status = Number.isInteger(result.status) ? result.status : 403;
                    res.writeHead(status, { 'Content-Type': 'text/plain; charset=utf-8' });
                    res.end(result.message || (status === 401 ? 'Unauthorized' : 'Forbidden'));
                    return;
                }
                if (result && result.kind === 'data' && result.data && typeof result.data === 'object' && !Array.isArray(result.data)) {
                    ssrPayload = result.data;
                }
            }

            let content = await readFile(filePath, 'utf8');
            if (ssrPayload) {
                content = injectSsrPayload(content, ssrPayload);
            }
            content = content.replace('</body>', `${HMR_CLIENT_SCRIPT}</body>`);
            res.writeHead(200, { 'Content-Type': 'text/html' });
            res.end(content);
        } catch {
            res.writeHead(404, { 'Content-Type': 'text/plain' });
            res.end('404 Not Found');
        }
    });

    /**
     * Broadcast HMR reload to all connected clients.
     */
    function _broadcastReload() {
        for (const client of hmrClients) {
            try {
                client.write('data: reload\n\n');
            } catch {
                // client disconnected
            }
        }
    }

    /**
     * Start watching the pages directory for changes.
     */
    function _startWatcher() {
        try {
            _watcher = watch(pagesDir, { recursive: true }, async (eventType, filename) => {
                if (!filename) return;

                // Rebuild
                await build({ pagesDir, outDir, config });
                _broadcastReload();
            });
        } catch {
            // fs.watch may not support recursive on all platforms
        }
    }

    return new Promise((resolve) => {
        server.listen(port, () => {
            const actualPort = server.address().port;
            _startWatcher();

            resolve({
                server,
                port: actualPort,
                close: () => {
                    if (_watcher) {
                        _watcher.close();
                        _watcher = null;
                    }
                    for (const client of hmrClients) {
                        try { client.end(); } catch { }
                    }
                    hmrClients.length = 0;
                    server.close();
                }
            });
        });
    });
}
