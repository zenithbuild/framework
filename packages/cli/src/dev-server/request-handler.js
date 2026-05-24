import { readFile } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { appLocalRedirectLocation, imageEndpointPath, routeCheckPath, stripBasePath } from '../base-path.js';
import { readRequestBodyBuffer } from '../request-body.js';
import { buildResourceResponseDescriptor } from '../resource-response.js';
import { clientFacingRouteMessage, logServerException } from '../server-error.js';
import {
    executeServerRoute,
    injectSsrPayload,
    resolveWithinDist,
    toStaticFilePath
} from '../preview.js';
import { materializeImageMarkup } from '../images/materialize.js';
import { injectImageRuntimePayload } from '../images/payload.js';
import { handleImageRequest } from '../images/service.js';
import { resolveRequestRoute } from '../server/resolve-request-route.js';
import { respondWithDevBuildError } from './build-error-response.js';
import { handleRouteCheckRequest } from './route-check.js';

function respondWithMiddlewareSourceError(res, error) {
    logServerException('dev server route execution failed', error);
    res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end(clientFacingRouteMessage(500));
}

export function createDevRequestHandler(options) {
    const {
        outDir,
        projectRoot,
        imageConfig,
        configuredBasePath,
        routeCheckEnabled,
        isStaticExportTarget,
        logger,
        verboseLogging,
        buildSession,
        state,
        serverOrigin,
        loadRoutesForRequests,
        loadGlobalMiddlewareForRequests,
        readFileForRequest,
        trace404,
        looksLikeJsonRequest,
        classifyNotFound,
        infer404Cause,
        buildNotFoundPayload,
        renderNotFoundHtml,
        appendSetCookieHeaders,
        MIME_TYPES,
        EVENT_STREAM_MIME,
        LEGACY_DEV_STREAM_PATH,
        IMAGE_RUNTIME_TAG_RE
    } = options;

    return async function handleDevRequest(req, res) {
        const url = new URL(req.url, serverOrigin());
        const pathname = url.pathname;

        // Legacy HMR endpoint (deprecated but kept alive to avoid breaking old caches instantly)
        if (pathname === LEGACY_DEV_STREAM_PATH) {
            res.writeHead(200, {
                'Content-Type': EVENT_STREAM_MIME,
                'Cache-Control': 'no-store',
                'Connection': 'keep-alive',
                'X-Zenith-Deprecated': 'true'
            });
            logger.warn('legacy HMR endpoint in use', {
                hint: 'use /__zenith_dev/events',
                onceKey: 'legacy-hmr-endpoint'
            });
            res.write(': connected\n\n');
            state.hmrClients.push(res);
            req.on('close', () => {
                const idx = state.hmrClients.indexOf(res);
                if (idx !== -1) state.hmrClients.splice(idx, 1);
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
                serverUrl: serverOrigin(),
                buildId: state.buildId,
                status: state.buildStatus,
                lastBuildMs: state.lastBuildMs,
                durationMs: state.durationMs,
                cssHref: state.currentCssHref,
                error: state.buildError
            }));
            return;
        }

        // V1 Dev Events Endpoint (SSE)
        if (pathname === '/__zenith_dev/events') {
            res.writeHead(200, {
                'Content-Type': EVENT_STREAM_MIME,
                'Cache-Control': 'no-store',
                'Connection': 'keep-alive',
                'X-Accel-Buffering': 'no'
            });
            res.write('retry: 1000\n');
            res.write('event: connected\ndata: {}\n\n');
            state.hmrClients.push(res);
            req.on('close', () => {
                const idx = state.hmrClients.indexOf(res);
                if (idx !== -1) state.hmrClients.splice(idx, 1);
            });
            return;
        }

        if (pathname === '/__zenith_dev/styles.css') {
            if (state.buildStatus === 'error') {
                const reason = typeof state.buildError?.message === 'string' && state.buildError.message.length > 0
                    ? state.buildError.message
                    : 'initial build failed';
                const summary = reason.length > 280 ? `${reason.slice(0, 277)}...` : reason;
                res.writeHead(503, {
                    'Content-Type': 'text/css; charset=utf-8',
                    'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
                    'Pragma': 'no-cache',
                    'Expires': '0',
                    'X-Zenith-Dev-Error': 'build-failed'
                });
                res.end(`/* zenith-dev: css unavailable because build failed */\n/* cause: ${summary} */\n/* expected href: ${state.currentCssHref || '<none>'} */`);
                return;
            }
            if (typeof state.currentCssContent === 'string' && state.currentCssContent.length > 0) {
                res.writeHead(200, {
                    'Content-Type': 'text/css; charset=utf-8',
                    'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
                    'Pragma': 'no-cache',
                    'Expires': '0'
                });
                res.end(state.currentCssContent);
                return;
            }
            if (typeof state.currentCssAssetPath === 'string' && state.currentCssAssetPath.length > 0) {
                try {
                    const css = await readFile(join(outDir, state.currentCssAssetPath), 'utf8');
                    if (typeof css === 'string' && css.length > 0) {
                        state.currentCssContent = css;
                    }
                } catch {
                    // keep serving last known CSS body below
                }
            }
            if (typeof state.currentCssContent !== 'string') {
                state.currentCssContent = '';
            }
            if (state.currentCssContent.length === 0) {
                state.currentCssContent = '/* zenith-dev: css pending */';
            }
            res.writeHead(200, {
                'Content-Type': 'text/css; charset=utf-8',
                'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
                'Pragma': 'no-cache',
                'Expires': '0'
            });
            res.end(state.currentCssContent);
            return;
        }

        if (pathname === imageEndpointPath(configuredBasePath)) {
            if (isStaticExportTarget) {
                throw new Error('not found');
            }
            await handleImageRequest(req, res, {
                requestUrl: url,
                projectRoot,
                config: imageConfig
            });
            return;
        }

        if (pathname === routeCheckPath(configuredBasePath)) {
            await handleRouteCheckRequest({
                req,
                res,
                url,
                configuredBasePath,
                routeCheckEnabled,
                state,
                loadRoutesForRequests
            });
            return;
        }

        let resolvedPathFor404 = null;
        let staticRootFor404 = null;
        try {
            const canonicalPath = stripBasePath(pathname, configuredBasePath);
            if (!state.initialBuildSettled && state.buildStatus === 'building') {
                const pendingPayload = {
                    kind: 'zenith_dev_build_pending',
                    requestedPath: pathname,
                    buildId: state.buildId,
                    buildStatus: state.buildStatus,
                    hint: 'Initial build is still running. Retry shortly or inspect /__zenith_dev/state.'
                };
                if (looksLikeJsonRequest(req, pathname)) {
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
                const assetPath = isStaticExportTarget
                    ? resolveWithinDist(outDir, pathname)
                    : join(outDir, canonicalPath);
                resolvedPathFor404 = assetPath;
                staticRootFor404 = outDir;
                if (!assetPath) {
                    throw new Error('not found');
                }
                const asset = await readFileForRequest(assetPath);
                const mime = MIME_TYPES[requestExt] || 'application/octet-stream';
                res.writeHead(200, { 'Content-Type': mime });
                res.end(asset);
                return;
            }

            const routes = await loadRoutesForRequests();
            const canonicalUrl = new URL(url.toString());
            canonicalUrl.pathname = canonicalPath;
            const resolvedResource = resolveRequestRoute(canonicalUrl, routes.resourceRoutes || []);
            if (resolvedResource.matched && resolvedResource.route) {
                let globalMiddleware = null;
                try {
                    globalMiddleware = loadGlobalMiddlewareForRequests
                        ? await loadGlobalMiddlewareForRequests()
                        : null;
                } catch (error) {
                    respondWithMiddlewareSourceError(res, error);
                    return;
                }
                const requestMethod = req.method || 'GET';
                const requestBodyBuffer =
                    requestMethod === 'GET' || requestMethod === 'HEAD'
                        ? null
                        : await readRequestBodyBuffer(req);
                const execution = await executeServerRoute({
                    source: resolvedResource.route.server_script || '',
                    sourcePath: resolvedResource.route.server_script_path || '',
                    params: resolvedResource.params,
                    requestUrl: url.toString(),
                    requestMethod,
                    requestHeaders: req.headers,
                    requestBodyBuffer,
                    routePattern: resolvedResource.route.path,
                    routeFile: resolvedResource.route.server_script_path || '',
                    routeId: resolvedResource.route.route_id || '',
                    routeKind: 'resource',
                    globalMiddlewareSource: globalMiddleware?.source || '',
                    globalMiddlewareSourcePath: globalMiddleware?.sourcePath || ''
                });
                const descriptor = buildResourceResponseDescriptor(
                    execution?.result,
                    configuredBasePath,
                    Array.isArray(execution?.setCookies) ? execution.setCookies : []
                );
                res.writeHead(descriptor.status, appendSetCookieHeaders(descriptor.headers, descriptor.setCookies));
                if ((req.method || 'GET').toUpperCase() === 'HEAD') {
                    res.end();
                    return;
                }
                res.end(descriptor.body);
                return;
            }

            if (state.buildStatus === 'error' && (!requestExt || requestExt === '.html')) {
                respondWithDevBuildError({
                    req,
                    res,
                    pathname,
                    state,
                    looksLikeJsonRequest
                });
                return;
            }

            const resolved = resolveRequestRoute(canonicalUrl, routes.pageRoutes || []);
            let filePath = null;

            if (isStaticExportTarget) {
                filePath = toStaticFilePath(outDir, pathname);
            } else if (resolved.matched && resolved.route) {
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
                filePath = null;
            }

            resolvedPathFor404 = filePath;
            staticRootFor404 = outDir;

            if (!filePath) {
                throw new Error('not found');
            }

            let ssrPayload = null;
            let routeExecution = null;
            if (resolved.matched && resolved.route?.server_script && resolved.route.prerender !== true) {
                let globalMiddleware = null;
                try {
                    globalMiddleware = loadGlobalMiddlewareForRequests
                        ? await loadGlobalMiddlewareForRequests()
                        : null;
                } catch (error) {
                    respondWithMiddlewareSourceError(res, error);
                    return;
                }
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
                        requestBodyBuffer,
                        routePattern: resolved.route.path,
                        routeFile: resolved.route.server_script_path || '',
                        routeId: resolved.route.route_id || '',
                        globalMiddlewareSource: globalMiddleware?.source || '',
                        globalMiddlewareSourcePath: globalMiddleware?.sourcePath || ''
                    });
                } catch (error) {
                    logServerException('dev server route execution failed', error);
                    ssrPayload = {
                        __zenith_error: {
                            status: 500,
                            code: 'LOAD_FAILED',
                            message: error instanceof Error ? error.message : String(error || '')
                        }
                    };
                }

                const traceResult = routeExecution?.trace || { guard: 'none', action: 'none', load: 'none' };
                const routeId = resolved.route.route_id || '';
                const setCookies = Array.isArray(routeExecution?.setCookies) ? routeExecution.setCookies : [];
                if (verboseLogging) {
                    logger.router(
                        `${routeId || resolved.route.path} guard=${traceResult.guard} action=${traceResult.action} load=${traceResult.load}`
                    );
                }

                const result = routeExecution?.result;
                if (result && result.kind === 'redirect') {
                    const status = Number.isInteger(result.status) ? result.status : 302;
                    res.writeHead(status, appendSetCookieHeaders({
                        Location: appLocalRedirectLocation(result.location, configuredBasePath),
                        'Cache-Control': 'no-store'
                    }, setCookies));
                    res.end('');
                    return;
                }
                if (result && result.kind === 'deny') {
                    const status = Number.isInteger(result.status) ? result.status : 403;
                    res.writeHead(status, appendSetCookieHeaders({ 'Content-Type': 'text/plain; charset=utf-8' }, setCookies));
                    res.end(clientFacingRouteMessage(status, result.message));
                    return;
                }
                if (result && result.kind === 'data' && result.data && typeof result.data === 'object' && !Array.isArray(result.data)) {
                    ssrPayload = result.data;
                }
            }

            let content = await readFileForRequest(filePath, 'utf8');
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
            if (!IMAGE_RUNTIME_TAG_RE.test(content)) {
                content = injectImageRuntimePayload(content, buildSession.getImageRuntimePayload());
            }
            res.writeHead(Number.isInteger(routeExecution?.status) ? routeExecution.status : 200, appendSetCookieHeaders({
                'Content-Type': 'text/html'
            }, Array.isArray(routeExecution?.setCookies) ? routeExecution.setCookies : []));
            res.end(content);
        } catch (error) {
            const category = classifyNotFound(pathname);
            const cause = infer404Cause(category, state.buildStatus);
            const payload = buildNotFoundPayload({
                pathname,
                category,
                cause,
                buildId: state.buildId,
                buildStatus: state.buildStatus,
                configuredBasePath,
                currentCssHref: state.currentCssHref
            });
            if (state.buildStatus === 'error' && typeof state.buildError?.message === 'string') {
                payload.buildError = state.buildError.message.length > 600
                    ? `${state.buildError.message.slice(0, 597)}...`
                    : state.buildError.message;
            }
            const displayCategory = category === 'page' ? 'page' : 'asset';
            logger.warn(
                `404 ${displayCategory}: ${pathname} (buildId=${state.buildId}) -> cause: ${payload.cause || cause || 'not found'}`
            );
            trace404(req, url, {
                reason: 'not_found',
                category,
                cause: payload.cause || cause || 'not_found',
                staticRoot: staticRootFor404,
                resolvedPath: resolvedPathFor404,
                error: error instanceof Error ? error.message : String(error || '')
            });
            if (looksLikeJsonRequest(req, pathname)) {
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
            res.end(renderNotFoundHtml(payload));
            return;
        }
    };
}
