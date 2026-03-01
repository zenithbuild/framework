// ---------------------------------------------------------------------------
// dev-server.js — Zenith CLI V0
// ---------------------------------------------------------------------------
// Development server with in-memory compilation and file watching.
//
// - Compiles pages on demand
// - Rebuilds on file change
// - Exposes V1 HMR endpoints consumed by runtime dev client
// - Server route resolution uses manifest matching
//
// V0: Uses Node.js http module + fs.watch. No external deps.
// ---------------------------------------------------------------------------

import { createServer } from 'node:http';
import { existsSync, watch } from 'node:fs';
import { readFile, stat } from 'node:fs/promises';
import { basename, dirname, extname, isAbsolute, join, relative, resolve } from 'node:path';
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

// Note: V0 HMR script injection has been moved to the runtime client.
// This server purely hosts the V1 HMR contract endpoints.

/**
 * Create and start a development server.
 *
 * @param {{ pagesDir: string, outDir: string, port?: number, host?: string, config?: object }} options
 * @returns {Promise<{ server: import('http').Server, port: number, close: () => void }>}
 */
export async function createDevServer(options) {
    const {
        pagesDir,
        outDir,
        port = 3000,
        host = '127.0.0.1',
        config = {}
    } = options;

    const resolvedPagesDir = resolve(pagesDir);
    const resolvedOutDir = resolve(outDir);
    const resolvedOutDirTmp = resolve(dirname(resolvedOutDir), `${basename(resolvedOutDir)}.tmp`);
    const pagesParentDir = dirname(resolvedPagesDir);
    const projectRoot = basename(pagesParentDir) === 'src'
        ? dirname(pagesParentDir)
        : pagesParentDir;
    const watchRoots = new Set([pagesParentDir]);

    /** @type {import('http').ServerResponse[]} */
    const hmrClients = [];
    /** @type {import('fs').FSWatcher[]} */
    let _watchers = [];
    const sseHeartbeat = setInterval(() => {
        for (const client of hmrClients) {
            try {
                client.write(': ping\n\n');
            } catch {
                // client disconnected
            }
        }
    }, 15000);

    let buildId = 0;
    let pendingBuildId = 0;
    let buildStatus = 'ok'; // 'ok' | 'error' | 'building'
    let lastBuildMs = Date.now();
    let durationMs = 0;
    let buildError = null;
    const traceEnabled = config.devTrace === true || process.env.ZENITH_DEV_TRACE === '1';

    // Stable dev CSS endpoint points to this backing asset.
    let currentCssAssetPath = '';
    let currentCssHref = '';
    let currentCssContent = '';
    let actualPort = port;

    function _publicHost() {
        if (host === '0.0.0.0' || host === '::') {
            return '127.0.0.1';
        }
        return host;
    }

    function _serverOrigin() {
        return `http://${_publicHost()}:${actualPort}`;
    }

    function _trace(event, payload = {}) {
        if (!traceEnabled) return;
        try {
            const timestamp = new Date().toISOString();
            console.log(`[zenith-dev][${timestamp}] ${event} ${JSON.stringify(payload)}`);
        } catch {
            // tracing must never break the dev server
        }
    }

    function _classifyPath(pathname) {
        if (pathname.startsWith('/__zenith_dev/events')) return 'dev_events';
        if (pathname.startsWith('/__zenith_dev/state')) return 'dev_state';
        if (pathname.startsWith('/__zenith_dev/styles.css')) return 'dev_styles';
        if (pathname.startsWith('/assets/')) return 'asset';
        return 'other';
    }

    function _trace404(req, url, details = {}) {
        _trace('http_404', {
            method: req.method || 'GET',
            url: `${url.pathname}${url.search}`,
            classify: _classifyPath(url.pathname),
            ...details
        });
    }

    function _pickCssAsset(assets) {
        if (!Array.isArray(assets) || assets.length === 0) {
            return '';
        }
        const cssAssets = assets
            .filter((entry) => typeof entry === 'string' && entry.endsWith('.css'))
            .map((entry) => entry.startsWith('/') ? entry : `/${entry}`);
        if (cssAssets.length === 0) {
            return '';
        }
        const preferred = cssAssets.find((entry) => /\/styles(\.|\/|$)/.test(entry));
        return preferred || cssAssets[0];
    }

    function _delay(ms) {
        return new Promise((resolveDelay) => setTimeout(resolveDelay, ms));
    }

    async function _waitForCssFile(absolutePath, retries = 16, delayMs = 40) {
        for (let i = 0; i <= retries; i++) {
            try {
                const info = await stat(absolutePath);
                if (info.isFile()) {
                    return true;
                }
            } catch {
                // keep retrying
            }
            if (i < retries) {
                await _delay(delayMs);
            }
        }
        return false;
    }

    async function _syncCssStateFromBuild(buildResult, nextBuildId) {
        currentCssHref = `/__zenith_dev/styles.css?buildId=${nextBuildId}`;
        const candidate = _pickCssAsset(buildResult?.assets);
        if (!candidate) {
            _trace('css_sync_skipped', { reason: 'no_css_asset', buildId: nextBuildId });
            return false;
        }

        const absoluteCssPath = join(outDir, candidate);
        const ready = await _waitForCssFile(absoluteCssPath);
        if (!ready) {
            _trace('css_sync_skipped', {
                reason: 'css_not_ready',
                buildId: nextBuildId,
                cssAsset: candidate,
                resolvedPath: absoluteCssPath
            });
            return false;
        }

        let cssContent = '';
        try {
            cssContent = await readFile(absoluteCssPath, 'utf8');
        } catch {
            _trace('css_sync_skipped', {
                reason: 'css_read_failed',
                buildId: nextBuildId,
                cssAsset: candidate,
                resolvedPath: absoluteCssPath
            });
            return false;
        }
        if (typeof cssContent !== 'string') {
            _trace('css_sync_skipped', {
                reason: 'css_invalid_type',
                buildId: nextBuildId,
                cssAsset: candidate,
                resolvedPath: absoluteCssPath
            });
            return false;
        }
        if (cssContent.length === 0) {
            _trace('css_sync_skipped', {
                reason: 'css_empty',
                buildId: nextBuildId,
                cssAsset: candidate,
                resolvedPath: absoluteCssPath
            });
            cssContent = '/* zenith-dev: empty css */';
        }

        currentCssAssetPath = candidate;
        currentCssContent = cssContent;
        return true;
    }

    function _broadcastEvent(type, payload = {}) {
        const eventBuildId = Number.isInteger(payload.buildId) ? payload.buildId : buildId;
        const data = JSON.stringify({
            buildId: eventBuildId,
            ...payload
        });
        _trace('sse_emit', {
            type,
            buildId: eventBuildId,
            status: buildStatus,
            cssHref: currentCssHref,
            changedFiles: Array.isArray(payload.changedFiles) ? payload.changedFiles : undefined
        });
        for (const client of hmrClients) {
            try {
                client.write(`event: ${type}\ndata: ${data}\n\n`);
            } catch {
                // client disconnected
            }
        }
    }

    // Initial build
    try {
        const initialBuild = await build({ pagesDir, outDir, config });
        await _syncCssStateFromBuild(initialBuild, buildId);
    } catch (err) {
        buildStatus = 'error';
        buildError = { message: err instanceof Error ? err.message : String(err) };
    }

    const server = createServer(async (req, res) => {
        const requestBase = typeof req.headers.host === 'string' && req.headers.host.length > 0
            ? `http://${req.headers.host}`
            : _serverOrigin();
        const url = new URL(req.url, requestBase);
        let pathname = url.pathname;

        // Legacy HMR endpoint (deprecated but kept alive to avoid breaking old caches instantly)
        if (pathname === '/__zenith_hmr') {
            res.writeHead(200, {
                'Content-Type': 'text/event-stream',
                'Cache-Control': 'no-store',
                'Connection': 'keep-alive',
                'X-Zenith-Deprecated': 'true'
            });
            console.warn('[zenith] Warning: /__zenith_hmr is legacy; use /__zenith_dev/events');
            res.write(': connected\n\n');
            hmrClients.push(res);
            req.on('close', () => {
                const idx = hmrClients.indexOf(res);
                if (idx !== -1) hmrClients.splice(idx, 1);
            });
            return;
        }

        // V1 Dev State Endpoint
        if (pathname === '/__zenith_dev/state') {
            res.writeHead(200, {
                'Content-Type': 'application/json',
                'Cache-Control': 'no-store'
            });
            res.end(JSON.stringify({
                serverUrl: _serverOrigin(),
                buildId,
                status: buildStatus,
                lastBuildMs,
                durationMs,
                cssHref: currentCssHref,
                error: buildError
            }));
            return;
        }

        // V1 Dev Events Endpoint (SSE)
        if (pathname === '/__zenith_dev/events') {
            res.writeHead(200, {
                'Content-Type': 'text/event-stream',
                'Cache-Control': 'no-store',
                'Connection': 'keep-alive',
                'X-Accel-Buffering': 'no'
            });
            res.write('retry: 1000\n');
            res.write('event: connected\ndata: {}\n\n');
            hmrClients.push(res);
            req.on('close', () => {
                const idx = hmrClients.indexOf(res);
                if (idx !== -1) hmrClients.splice(idx, 1);
            });
            return;
        }

        if (pathname === '/__zenith_dev/styles.css') {
            if (typeof currentCssContent === 'string' && currentCssContent.length > 0) {
                res.writeHead(200, {
                    'Content-Type': 'text/css; charset=utf-8',
                    'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
                    'Pragma': 'no-cache',
                    'Expires': '0'
                });
                res.end(currentCssContent);
                return;
            }
            if (typeof currentCssAssetPath === 'string' && currentCssAssetPath.length > 0) {
                try {
                    const css = await readFile(join(outDir, currentCssAssetPath), 'utf8');
                    if (typeof css === 'string' && css.length > 0) {
                        currentCssContent = css;
                    }
                } catch {
                    // keep serving last known CSS body below
                }
            }
            if (typeof currentCssContent !== 'string') {
                currentCssContent = '';
            }
            if (currentCssContent.length === 0) {
                currentCssContent = '/* zenith-dev: css pending */';
            }
            res.writeHead(200, {
                'Content-Type': 'text/css; charset=utf-8',
                'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
                'Pragma': 'no-cache',
                'Expires': '0'
            });
            res.end(currentCssContent);
            return;
        }

        if (pathname === '/__zenith/route-check') {
            try {
                // Security: Require explicitly designated header to prevent public oracle probing
                if (req.headers['x-zenith-route-check'] !== '1') {
                    res.writeHead(403, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: 'forbidden', message: 'invalid request context' }));
                    return;
                }

                const targetPath = String(url.searchParams.get('path') || '/');

                // Security: Prevent protocol/domain injection in path
                if (targetPath.includes('://') || targetPath.startsWith('//') || /[\r\n]/.test(targetPath)) {
                    res.writeHead(400, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: 'invalid_path_format' }));
                    return;
                }

                const targetUrl = new URL(targetPath, url.origin);
                if (targetUrl.origin !== url.origin) {
                    res.writeHead(400, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: 'external_route_evaluation_forbidden' }));
                    return;
                }

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
                    routeId: resolvedCheck.route.route_id || '',
                    guardOnly: true
                });
                // Security: Enforce relative or same-origin redirects
                if (checkResult && checkResult.result && checkResult.result.kind === 'redirect') {
                    const loc = String(checkResult.result.location || '/');
                    if (loc.includes('://') || loc.startsWith('//')) {
                        try {
                            const parsedLoc = new URL(loc);
                            if (parsedLoc.origin !== targetUrl.origin) {
                                checkResult.result.location = '/'; // Fallback to root for open redirect attempt
                            }
                        } catch {
                            checkResult.result.location = '/';
                        }
                    }
                }

                res.writeHead(200, {
                    'Content-Type': 'application/json',
                    'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
                    'Pragma': 'no-cache',
                    'Expires': '0',
                    'Vary': 'Cookie'
                });
                res.end(JSON.stringify({
                    result: checkResult?.result || checkResult,
                    routeId: resolvedCheck.route.route_id || '',
                    to: targetUrl.toString()
                }));
                return;
            } catch {
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'route_check_failed' }));
                return;
            }
        }

        let resolvedPathFor404 = null;
        let staticRootFor404 = null;
        try {
            const requestExt = extname(pathname);
            if (requestExt && requestExt !== '.html') {
                const assetPath = join(outDir, pathname);
                resolvedPathFor404 = assetPath;
                staticRootFor404 = outDir;
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

            resolvedPathFor404 = filePath;
            staticRootFor404 = outDir;

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
                    ssrPayload = {
                        __zenith_error: {
                            code: 'LOAD_FAILED',
                            message: error instanceof Error ? error.message : String(error)
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
            res.writeHead(200, { 'Content-Type': 'text/html' });
            res.end(content);
        } catch {
            _trace404(req, url, {
                reason: 'not_found',
                staticRoot: staticRootFor404,
                resolvedPath: resolvedPathFor404
            });
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

    let _buildDebounce = null;
    let _queuedFiles = new Set();
    let _buildInFlight = false;

    function _isWithin(parent, child) {
        const rel = relative(parent, child);
        return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel));
    }

    function _toDisplayPath(absPath) {
        const rel = relative(projectRoot, absPath);
        if (rel === '') return '.';
        if (!rel.startsWith('..') && !isAbsolute(rel)) {
            return rel;
        }
        return absPath;
    }

    function _shouldIgnoreChange(absPath) {
        if (_isWithin(resolvedOutDir, absPath)) {
            return true;
        }
        if (_isWithin(resolvedOutDirTmp, absPath)) {
            return true;
        }
        const rel = relative(projectRoot, absPath);
        if (rel.startsWith('..') || isAbsolute(rel)) {
            return false;
        }
        const segments = rel.split(/[\\/]+/g);
        return segments.includes('node_modules')
            || segments.includes('.git')
            || segments.includes('.zenith')
            || segments.includes('target')
            || segments.includes('.turbo');
    }

    /**
     * Start watching source roots for changes.
     */
    function _startWatcher() {
        const triggerBuildDrain = (delayMs = 50) => {
            if (_buildDebounce !== null) {
                clearTimeout(_buildDebounce);
            }
            _buildDebounce = setTimeout(() => {
                _buildDebounce = null;
                void drainBuildQueue();
            }, delayMs);
        };

        const drainBuildQueue = async () => {
            if (_buildInFlight) {
                return;
            }
            const changed = Array.from(_queuedFiles).map(_toDisplayPath).sort();
            if (changed.length === 0) {
                return;
            }
            _queuedFiles.clear();

            _buildInFlight = true;
            const cycleBuildId = pendingBuildId + 1;
            pendingBuildId = cycleBuildId;
            buildStatus = 'building';
            _broadcastEvent('build_start', { buildId: cycleBuildId, changedFiles: changed });

            const startTime = Date.now();
            const previousCssAssetPath = currentCssAssetPath;
            const previousCssContent = currentCssContent;
            try {
                const buildResult = await build({ pagesDir, outDir, config });
                const cssReady = await _syncCssStateFromBuild(buildResult, cycleBuildId);
                const cssChanged = cssReady && (
                    currentCssAssetPath !== previousCssAssetPath ||
                    currentCssContent !== previousCssContent
                );
                buildId = cycleBuildId;
                buildStatus = 'ok';
                buildError = null;
                lastBuildMs = Date.now();
                durationMs = lastBuildMs - startTime;

                _broadcastEvent('build_complete', {
                    buildId: cycleBuildId,
                    durationMs,
                    status: buildStatus,
                    cssHref: currentCssHref,
                    changedFiles: changed
                }
                );
                _trace('state_snapshot', {
                    status: buildStatus,
                    buildId: cycleBuildId,
                    cssHref: currentCssHref,
                    durationMs,
                    changedFiles: changed
                });

                if (cssChanged && currentCssHref.length > 0) {
                    _broadcastEvent('css_update', { href: currentCssHref, changedFiles: changed });
                }

                const onlyCss = changed.length > 0 && changed.every((f) => f.endsWith('.css'));
                if (!onlyCss) {
                    _broadcastEvent('reload', { changedFiles: changed });
                } else {
                    _trace('css_only_update', {
                        buildId: cycleBuildId,
                        cssHref: currentCssHref,
                        cssChanged,
                        changedFiles: changed
                    });
                }
            } catch (err) {
                const fullError = err instanceof Error ? err.message : String(err);
                buildStatus = 'error';
                buildError = { message: fullError.length > 10000 ? fullError.slice(0, 10000) + '... (truncated)' : fullError };
                lastBuildMs = Date.now();
                durationMs = lastBuildMs - startTime;

                _broadcastEvent('build_error', { buildId: cycleBuildId, ...buildError, changedFiles: changed });
                _trace('state_snapshot', {
                    status: buildStatus,
                    buildId,
                    cssHref: currentCssHref,
                    durationMs,
                    error: buildError
                });
            } finally {
                _buildInFlight = false;
                if (_queuedFiles.size > 0) {
                    triggerBuildDrain(20);
                }
            }
        };

        const roots = Array.from(watchRoots);
        for (const root of roots) {
            if (!existsSync(root)) continue;
            try {
                const watcher = watch(root, { recursive: true }, (_eventType, filename) => {
                    if (!filename) {
                        return;
                    }
                    const changedPath = resolve(root, String(filename));
                    if (_shouldIgnoreChange(changedPath)) {
                        return;
                    }
                    _queuedFiles.add(changedPath);
                    triggerBuildDrain();
                });
                _watchers.push(watcher);
            } catch {
                // fs.watch recursive may not be supported on this platform/root
            }
        }
    }

    return new Promise((resolve) => {
        server.listen(port, host, () => {
            actualPort = server.address().port;
            _startWatcher();

            resolve({
                server,
                port: actualPort,
                close: () => {
                    clearInterval(sseHeartbeat);
                    for (const watcher of _watchers) {
                        try {
                            watcher.close();
                        } catch {
                            // ignore close errors
                        }
                    }
                    _watchers = [];
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
