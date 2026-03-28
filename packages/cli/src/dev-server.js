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
import { performance } from 'node:perf_hooks';
import { basename, dirname, extname, isAbsolute, join, relative, resolve } from 'node:path';
import { appLocalRedirectLocation, imageEndpointPath, normalizeBasePath, routeCheckPath, stripBasePath } from './base-path.js';
import { resolveBuildAdapter } from './adapters/resolve-adapter.js';
import { createDevBuildSession } from './dev-build-session.js';
import { createStartupProfiler } from './startup-profile.js';
import { createSilentLogger } from './ui/logger.js';
import { readChangeFingerprint } from './dev-watch.js';
import { createTrustedOriginResolver, publicHost } from './request-origin.js';
import { encodeRequestBodyBase64, readRequestBodyBuffer } from './request-body.js';
import { supportsTargetRouteCheck } from './route-check-support.js';
import { clientFacingRouteMessage, defaultRouteDenyMessage, logServerException, sanitizeRouteResult } from './server-error.js';
import {
    executeServerRoute,
    injectSsrPayload,
    loadRouteManifest,
    resolveWithinDist,
    toStaticFilePath
} from './preview.js';
import { materializeImageMarkup } from './images/materialize.js';
import { injectImageRuntimePayload } from './images/payload.js';
import { handleImageRequest } from './images/service.js';
import { resolveRequestRoute } from './server/resolve-request-route.js';

const MIME_TYPES = {
    '.html': 'text/html',
    '.js': 'application/javascript',
    '.css': 'text/css',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpeg': 'image/jpeg',
    '.jpg': 'image/jpeg',
    '.svg': 'image/svg+xml',
    '.webp': 'image/webp',
    '.avif': 'image/avif',
    '.gif': 'image/gif'
};

// Note: V0 HMR script injection has been moved to the runtime client.
// This server purely hosts the V1 HMR contract endpoints.

/**
 * Create and start a development server.
 *
 * @param {{ pagesDir: string, outDir: string, port?: number, host?: string, config?: object, logger?: object | null }} options
 * @returns {Promise<{ server: import('http').Server, port: number, close: () => void }>}
 */
export async function createDevServer(options) {
    const startupProfile = createStartupProfiler('cli-dev-server');
    const {
        pagesDir,
        outDir,
        port = 3000,
        host = '127.0.0.1',
        config = {},
        logger: providedLogger = null
    } = options;
    const logger = providedLogger || createSilentLogger();
    const buildSession = createDevBuildSession({ pagesDir, outDir, config, logger });
    const configuredBasePath = normalizeBasePath(config.basePath || '/');
    const routeCheckEnabled = supportsTargetRouteCheck(resolveBuildAdapter(config).target);

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
    let buildStatus = 'building'; // 'ok' | 'error' | 'building'
    let lastBuildMs = Date.now();
    let durationMs = 0;
    let buildError = null;
    let initialBuildSettled = false;
    const traceEnabled = config.devTrace === true || process.env.ZENITH_DEV_TRACE === '1';
    const verboseLogging = traceEnabled || logger.mode?.logLevel === 'verbose';

    // Stable dev CSS endpoint points to this backing asset.
    let currentCssAssetPath = '';
    let currentCssHref = '';
    let currentCssContent = '';
    let actualPort = port;
    const resolveServerOrigin = createTrustedOriginResolver({
        host,
        getPort: () => actualPort,
        label: 'dev server'
    });
    let currentRoutes = [];
    const rebuildDebounceMs = 5;
    const queuedRebuildDebounceMs = 5;

    function _publicHost() {
        return publicHost(host);
    }

    function _serverOrigin() {
        return resolveServerOrigin();
    }

    function _trace(event, payload = {}) {
        if (!traceEnabled) return;
        try {
            const detail = Object.keys(payload).length > 0
                ? `${event} ${JSON.stringify(payload)}`
                : event;
            logger.verbose('BUILD', detail);
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

    function _classifyNotFound(pathname) {
        const lower = String(pathname || '').toLowerCase();
        if (lower.startsWith('/__zenith_dev/')) return 'dev_internal';
        if (lower.startsWith('/__zenith/')) return 'zenith_internal';
        if (
            lower.startsWith('/_assets/')
            || lower.startsWith('/assets/')
            || lower.endsWith('.css')
            || lower.endsWith('.js')
            || lower.endsWith('.map')
            || lower.endsWith('.json')
        ) {
            return 'asset';
        }
        return 'page';
    }

    function _routeFileHint(pathname) {
        const normalized = String(pathname || '/').replace(/\/+$/, '');
        if (normalized === '' || normalized === '/') {
            return 'src/pages/index.zen';
        }
        return `src/pages${normalized}.zen`;
    }

    function _infer404Cause(category) {
        if (category === 'dev_internal' || category === 'zenith_internal') {
            if (buildStatus === 'error') {
                return 'initial build failed';
            }
            return 'unknown Zenith dev endpoint';
        }
        if (category === 'asset') {
            if (buildStatus === 'error') {
                return 'initial build failed';
            }
            return 'asset not emitted by latest build';
        }
        return null;
    }

    function _looksLikeJsonRequest(req, pathname) {
        const accept = String(req.headers.accept || '').toLowerCase();
        const secFetchDest = String(req.headers['sec-fetch-dest'] || '').toLowerCase();
        if (accept.includes('application/json') || accept.includes('application/problem+json')) {
            return true;
        }
        if (pathname.endsWith('.json')) {
            return true;
        }
        return secFetchDest === 'empty';
    }

    function _isBuildSwapReadError(error) {
        const code = typeof error?.code === 'string' ? error.code : '';
        return code === 'ENOENT' || code === 'ENOTDIR';
    }

    function _delay(ms) {
        return new Promise((resolveDelay) => {
            setTimeout(resolveDelay, ms);
        });
    }

    async function _readFileForRequest(filePath, encoding = undefined) {
        const attempts = buildStatus === 'building' ? 200 : 1;
        let lastError = null;
        for (let attempt = 0; attempt < attempts; attempt += 1) {
            try {
                return encoding === undefined
                    ? await readFile(filePath)
                    : await readFile(filePath, encoding);
            } catch (error) {
                lastError = error;
                if (!_isBuildSwapReadError(error) || attempt === attempts - 1) {
                    throw error;
                }
                await _delay(50);
            }
        }
        throw lastError;
    }

    function _buildNotFoundPayload(pathname, category, cause) {
        const hintedPath = category === 'page'
            ? (stripBasePath(pathname, configuredBasePath) || pathname)
            : pathname;
        const payload = {
            kind: 'zenith_dev_not_found',
            category,
            requestedPath: pathname,
            buildId,
            buildStatus,
            cause: cause || ''
        };

        if (category === 'asset') {
            payload.hint = buildStatus === 'error'
                ? 'Dev server is running but initial build failed; fix compile errors and refresh.'
                : 'Check emitted assets in dist and verify the requested path.';
            if (pathname.endsWith('.css')) {
                payload.expectedCssHref = currentCssHref || null;
                payload.hint = buildStatus === 'error'
                    ? `Dev server is running but initial build failed; expected CSS at ${currentCssHref || '<none>'}.`
                    : `Requested CSS is missing; expected current href ${currentCssHref || '<none>'}.`;
            }
            return payload;
        }

        if (category === 'dev_internal' || category === 'zenith_internal') {
            payload.hint = buildStatus === 'error'
                ? 'Dev server is running but initial build failed; restart after fixing compile errors.'
                : 'Check Zenith dev endpoint path and dev client version.';
            payload.docsLink = '/docs/documentation/contracts/hmr-v1-contract.md';
            return payload;
        }

        const routeFile = _routeFileHint(hintedPath);
        payload.routeFile = routeFile;
        payload.cause = `no route file found at ${routeFile}`;
        payload.hint = `Create ${routeFile} or verify router manifest output.`;
        return payload;
    }

    function _renderNotFoundHtml(payload) {
        const escaped = (value) => String(value || '')
            .replaceAll('&', '&amp;')
            .replaceAll('<', '&lt;')
            .replaceAll('>', '&gt;');
        const details = [
            `Requested: ${payload.requestedPath}`,
            `Category: ${payload.category}`,
            `Build: ${payload.buildStatus} (id=${payload.buildId})`,
            `Cause: ${payload.cause}`,
            payload.expectedCssHref ? `Expected CSS href: ${payload.expectedCssHref}` : '',
            `Hint: ${payload.hint || 'Inspect dev server output.'}`,
            payload.docsLink ? `Docs: ${payload.docsLink}` : ''
        ].filter(Boolean).join('\n');
        return [
            '<!DOCTYPE html>',
            '<html><head><meta charset="utf-8"><title>Zenith Dev 404</title></head>',
            '<body style="font-family: ui-monospace, SFMono-Regular, Menlo, monospace; padding: 20px; background: #101216; color: #e6edf3;">',
            '<h1 style="margin-top:0;">Zenith Dev 404</h1>',
            `<pre style="white-space: pre-wrap; line-height: 1.5;">${escaped(details)}</pre>`,
            '</body></html>'
        ].join('');
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
        const devStable = cssAssets.find((entry) => entry.endsWith('/styles.dev.css'));
        if (devStable) {
            return devStable;
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

    async function _loadRoutesForRequests() {
        if (buildStatus === 'building' && Array.isArray(currentRoutes) && currentRoutes.length > 0) {
            return currentRoutes;
        }
        try {
            const routes = await loadRouteManifest(outDir);
            if (Array.isArray(routes) && routes.length > 0) {
                currentRoutes = routes;
                return routes;
            }
        } catch (error) {
            if (!(Array.isArray(currentRoutes) && currentRoutes.length > 0)) {
                throw error;
            }
        }
        return currentRoutes;
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

    async function _runInitialBuild() {
        buildStatus = 'building';
        buildError = null;
        const startTime = Date.now();
        startupProfile.emit('initial_build_start', { buildId });
        try {
            logger.build('Initial build (id=0)', { onceKey: 'dev-initial-build' });
            const initialBuild = await buildSession.build();
            const cssReady = await _syncCssStateFromBuild(initialBuild, buildId);
            currentRoutes = await loadRouteManifest(outDir);
            buildStatus = 'ok';
            buildError = null;
            lastBuildMs = Date.now();
            durationMs = lastBuildMs - startTime;
            if (cssReady && currentCssHref.length > 0) {
                logger.css(`ready (${currentCssHref})`, { onceKey: `css-ready:${buildId}:${currentCssHref}` });
            }
            _trace('state_snapshot', {
                status: buildStatus,
                buildId,
                cssHref: currentCssHref,
                durationMs
            });
            startupProfile.emit('initial_build_complete', {
                buildId,
                status: buildStatus,
                durationMs,
                cssReady,
                routes: Array.isArray(currentRoutes) ? currentRoutes.length : 0
            });
        } catch (err) {
            buildStatus = 'error';
            buildError = { message: err instanceof Error ? err.message : String(err) };
            lastBuildMs = Date.now();
            durationMs = lastBuildMs - startTime;
            logger.error('initial build failed', {
                hint: 'fix the error and restart dev',
                error: err
            });
            _trace('state_snapshot', {
                status: buildStatus,
                buildId,
                durationMs,
                error: buildError
            });
            startupProfile.emit('initial_build_complete', {
                buildId,
                status: buildStatus,
                durationMs,
                error: buildError?.message || ''
            });
        } finally {
            initialBuildSettled = true;
        }
    }

    const server = createServer(async (req, res) => {
        const url = new URL(req.url, _serverOrigin());
        let pathname = url.pathname;

        // Legacy HMR endpoint (deprecated but kept alive to avoid breaking old caches instantly)
        if (pathname === '/__zenith_hmr') {
            res.writeHead(200, {
                'Content-Type': 'text/event-stream',
                'Cache-Control': 'no-store',
                'Connection': 'keep-alive',
                'X-Zenith-Deprecated': 'true'
            });
            logger.warn('legacy HMR endpoint in use', {
                hint: 'use /__zenith_dev/events',
                onceKey: 'legacy-hmr-endpoint'
            });
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
            if (buildStatus === 'error') {
                const reason = typeof buildError?.message === 'string' && buildError.message.length > 0
                    ? buildError.message
                    : 'initial build failed';
                const summary = reason.length > 280 ? `${reason.slice(0, 277)}...` : reason;
                res.writeHead(503, {
                    'Content-Type': 'text/css; charset=utf-8',
                    'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
                    'Pragma': 'no-cache',
                    'Expires': '0',
                    'X-Zenith-Dev-Error': 'build-failed'
                });
                res.end(`/* zenith-dev: css unavailable because build failed */\n/* cause: ${summary} */\n/* expected href: ${currentCssHref || '<none>'} */`);
                return;
            }
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

        if (pathname === imageEndpointPath(configuredBasePath)) {
            await handleImageRequest(req, res, {
                requestUrl: url,
                projectRoot,
                config: config.images
            });
            return;
        }

        if (pathname === routeCheckPath(configuredBasePath)) {
            try {
                if (!routeCheckEnabled) {
                    res.writeHead(501, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
                    res.end(JSON.stringify({ error: 'route_check_unsupported' }));
                    return;
                }
                if (!initialBuildSettled && buildStatus === 'building') {
                    res.writeHead(503, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
                    res.end(JSON.stringify({
                        error: 'initial_build_pending',
                        message: 'initial build still in progress'
                    }));
                    return;
                }

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
                const canonicalTargetPath = stripBasePath(targetUrl.pathname, configuredBasePath);
                if (canonicalTargetPath === null) {
                    res.writeHead(404, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: 'route_not_found' }));
                    return;
                }
                const canonicalTargetUrl = new URL(targetUrl.toString());
                canonicalTargetUrl.pathname = canonicalTargetPath;

                const routes = await _loadRoutesForRequests();
                const resolvedCheck = resolveRequestRoute(canonicalTargetUrl, routes);
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
                    const loc = appLocalRedirectLocation(checkResult.result.location || '/', configuredBasePath);
                    checkResult.result.location = loc;
                    if (loc.includes('://') || loc.startsWith('//')) {
                        try {
                            const parsedLoc = new URL(loc);
                            if (parsedLoc.origin !== targetUrl.origin) {
                                checkResult.result.location = appLocalRedirectLocation('/', configuredBasePath);
                            }
                        } catch {
                            checkResult.result.location = appLocalRedirectLocation('/', configuredBasePath);
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
                    result: sanitizeRouteResult(checkResult?.result || checkResult),
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
            const canonicalPath = stripBasePath(pathname, configuredBasePath);
            if (!initialBuildSettled && buildStatus === 'building') {
                const pendingPayload = {
                    kind: 'zenith_dev_build_pending',
                    requestedPath: pathname,
                    buildId,
                    buildStatus,
                    hint: 'Initial build is still running. Retry shortly or inspect /__zenith_dev/state.'
                };
                if (_looksLikeJsonRequest(req, pathname)) {
                    res.writeHead(503, {
                        'Content-Type': 'application/json',
                        'Cache-Control': 'no-store'
                    });
                    res.end(JSON.stringify(pendingPayload));
                    return;
                }
                res.writeHead(503, {
                    'Content-Type': 'text/html; charset=utf-8',
                    'Cache-Control': 'no-store'
                });
                res.end([
                    '<!DOCTYPE html>',
                    '<html><head><meta charset="utf-8"><title>Zenith Dev Building</title></head>',
                    '<body style="font-family: ui-monospace, SFMono-Regular, Menlo, monospace; padding: 20px; background: #101216; color: #e6edf3;">',
                    '<h1 style="margin-top:0;">Zenith Dev Building</h1>',
                    `<pre style="white-space: pre-wrap; line-height: 1.5;">Requested: ${pathname}\nStatus: initial build running\nHint: ${pendingPayload.hint}</pre>`,
                    '</body></html>'
                ].join(''));
                return;
            }

            if (canonicalPath === null) {
                throw new Error('not found');
            }

            const requestExt = extname(canonicalPath);
            if (requestExt && requestExt !== '.html') {
                const assetPath = join(outDir, canonicalPath);
                resolvedPathFor404 = assetPath;
                staticRootFor404 = outDir;
                const asset = await _readFileForRequest(assetPath);
                const mime = MIME_TYPES[requestExt] || 'application/octet-stream';
                res.writeHead(200, { 'Content-Type': mime });
                res.end(asset);
                return;
            }

            const routes = await _loadRoutesForRequests();
            const canonicalUrl = new URL(url.toString());
            canonicalUrl.pathname = canonicalPath;
            const resolved = resolveRequestRoute(canonicalUrl, routes);
            let filePath = null;

            if (resolved.matched && resolved.route) {
                if (verboseLogging) {
                    logger.router(
                        `${req.method || 'GET'} ${pathname} -> ${resolved.route.path} params=${JSON.stringify(resolved.params)}`
                    );
                }
                const output = resolved.route.output.startsWith('/')
                    ? resolved.route.output.slice(1)
                    : resolved.route.output;
                filePath = resolveWithinDist(outDir, output);
            } else {
                filePath = toStaticFilePath(outDir, canonicalPath);
            }

            resolvedPathFor404 = filePath;
            staticRootFor404 = outDir;

            if (!filePath) {
                throw new Error('not found');
            }

            let ssrPayload = null;
            let routeExecution = null;
            if (resolved.matched && resolved.route?.server_script && resolved.route.prerender !== true) {
                try {
                    const requestMethod = req.method || 'GET';
                    const requestBodyBuffer =
                        requestMethod === 'GET' || requestMethod === 'HEAD'
                            ? null
                            : await readRequestBodyBuffer(req);
                    routeExecution = await executeServerRoute({
                        source: resolved.route.server_script,
                        sourcePath: resolved.route.server_script_path || '',
                        params: resolved.params,
                        requestUrl: url.toString(),
                        requestMethod,
                        requestHeaders: req.headers,
                        requestBodyBase64: encodeRequestBodyBase64(requestBodyBuffer),
                        routePattern: resolved.route.path,
                        routeFile: resolved.route.server_script_path || '',
                        routeId: resolved.route.route_id || ''
                    });
                } catch (error) {
                    logServerException('dev server route execution failed', error);
                    res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
                    res.end(defaultRouteDenyMessage(500));
                    return;
                }

                const trace = routeExecution?.trace || { guard: 'none', action: 'none', load: 'none' };
                const routeId = resolved.route.route_id || '';
                if (verboseLogging) {
                    logger.router(
                        `${routeId || resolved.route.path} guard=${trace.guard} action=${trace.action} load=${trace.load}`
                    );
                }

                const result = routeExecution?.result;
                if (result && result.kind === 'redirect') {
                    const status = Number.isInteger(result.status) ? result.status : 302;
                    res.writeHead(status, {
                        Location: appLocalRedirectLocation(result.location, configuredBasePath),
                        'Cache-Control': 'no-store'
                    });
                    res.end('');
                    return;
                }
                if (result && result.kind === 'deny') {
                    const status = Number.isInteger(result.status) ? result.status : 403;
                    res.writeHead(status, { 'Content-Type': 'text/plain; charset=utf-8' });
                    res.end(clientFacingRouteMessage(status, result.message));
                    return;
                }
                if (result && result.kind === 'data' && result.data && typeof result.data === 'object' && !Array.isArray(result.data)) {
                    ssrPayload = result.data;
                }
            }

            let content = await _readFileForRequest(filePath, 'utf8');
            if (resolved.matched) {
                content = await materializeImageMarkup({
                    html: content,
                    payload: buildSession.getImageRuntimePayload(),
                    imageMaterialization: Array.isArray(resolved.route?.image_materialization)
                        ? resolved.route.image_materialization
                        : []
                });
            }
            if (ssrPayload) {
                content = injectSsrPayload(content, ssrPayload);
            }
            content = injectImageRuntimePayload(content, buildSession.getImageRuntimePayload());
            res.writeHead(Number.isInteger(routeExecution?.status) ? routeExecution.status : 200, {
                'Content-Type': 'text/html'
            });
            res.end(content);
        } catch (error) {
            const category = _classifyNotFound(pathname);
            const cause = _infer404Cause(category);
            const payload = _buildNotFoundPayload(pathname, category, cause);
            if (buildStatus === 'error' && typeof buildError?.message === 'string') {
                payload.buildError = buildError.message.length > 600
                    ? `${buildError.message.slice(0, 597)}...`
                    : buildError.message;
            }
            const displayCategory = category === 'page' ? 'page' : 'asset';
            logger.warn(
                `404 ${displayCategory}: ${pathname} (buildId=${buildId}) -> cause: ${payload.cause || cause || 'not found'}`
            );
            _trace404(req, url, {
                reason: 'not_found',
                category,
                cause: payload.cause || cause || 'not_found',
                staticRoot: staticRootFor404,
                resolvedPath: resolvedPathFor404,
                error: error instanceof Error ? error.message : String(error || '')
            });
            if (_looksLikeJsonRequest(req, pathname)) {
                res.writeHead(404, {
                    'Content-Type': 'application/json',
                    'Cache-Control': 'no-store'
                });
                res.end(JSON.stringify(payload));
                return;
            }
            res.writeHead(404, {
                'Content-Type': 'text/html; charset=utf-8',
                'Cache-Control': 'no-store'
            });
            res.end(_renderNotFoundHtml(payload));
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
    const _lastQueuedFingerprints = new Map();
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
        const watcherStartedAt = performance.now();
        const triggerBuildDrain = (delayMs = rebuildDebounceMs) => {
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
            const changedFiles = Array.from(_queuedFiles);
            const changed = changedFiles.map(_toDisplayPath).sort();
            if (changed.length === 0) {
                return;
            }
            _queuedFiles.clear();

            _buildInFlight = true;
            const cycleBuildId = pendingBuildId + 1;
            pendingBuildId = cycleBuildId;
            buildStatus = 'building';
            logger.build(`Rebuild (id=${cycleBuildId})`);
            _broadcastEvent('build_start', { buildId: cycleBuildId, changedFiles: changed });

            const startTime = Date.now();
            const previousCssAssetPath = currentCssAssetPath;
            const previousCssContent = currentCssContent;
            const onlyCss = changed.length > 0 && changed.every((f) => f.endsWith('.css'));
            try {
                const buildResult = await buildSession.build({ changedFiles, logger });
                const cssReady = await _syncCssStateFromBuild(buildResult, cycleBuildId);
                if (!onlyCss) {
                    currentRoutes = await loadRouteManifest(outDir);
                }
                const cssChanged = cssReady && (
                    currentCssAssetPath !== previousCssAssetPath ||
                    currentCssContent !== previousCssContent
                );
                buildId = cycleBuildId;
                buildStatus = 'ok';
                buildError = null;
                lastBuildMs = Date.now();
                durationMs = lastBuildMs - startTime;
                logger.build(`Complete (id=${cycleBuildId}, ${durationMs}ms)`);

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
                    logger.css(`ready (${currentCssHref})`);
                    logger.hmr(`css_update (buildId=${cycleBuildId})`);
                    _broadcastEvent('css_update', { href: currentCssHref, changedFiles: changed });
                }

                if (!onlyCss) {
                    logger.hmr(`reload (buildId=${cycleBuildId})`);
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
                logger.error('rebuild failed', {
                    hint: 'fix the error and save again',
                    error: err
                });

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
                    triggerBuildDrain(queuedRebuildDebounceMs);
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
                    void (async () => {
                        const fingerprint = await readChangeFingerprint(changedPath);
                        if (_lastQueuedFingerprints.get(changedPath) === fingerprint) {
                            return;
                        }
                        _lastQueuedFingerprints.set(changedPath, fingerprint);
                        _queuedFiles.add(changedPath);
                        triggerBuildDrain();
                    })();
                });
                _watchers.push(watcher);
            } catch {
                // fs.watch recursive may not be supported on this platform/root
            }
        }
        startupProfile.emit('watcher_ready', {
            roots: roots.length,
            activeWatchers: _watchers.length,
            durationMs: startupProfile.roundMs(performance.now() - watcherStartedAt)
        });
    }

    const closeServer = () => {
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
    };

    return new Promise((resolve, reject) => {
        let settled = false;

        server.once('error', (error) => {
            if (!settled) {
                settled = true;
                reject(error);
            }
        });

        server.listen(port, host, async () => {
            actualPort = server.address().port;
            startupProfile.emit('server_bound', {
                host: _publicHost(),
                port: actualPort,
                buildStatus
            });
            _trace('server_bound', {
                host: _publicHost(),
                port: actualPort,
                buildStatus
            });

            try {
                await _runInitialBuild();
                _startWatcher();
                if (!settled) {
                    settled = true;
                    resolve({
                        server,
                        port: actualPort,
                        close: closeServer
                    });
                }
            } catch (error) {
                if (!settled) {
                    settled = true;
                    reject(error);
                }
            }
        });
    });
}
