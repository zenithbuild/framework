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
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { normalizeBasePath } from './base-path.js';
import { resolveBuildAdapter } from './adapters/resolve-adapter.js';
import { createDevBuildSession } from './dev-build-session.js';
import { generateManifest } from './manifest.js';
import { buildComponentRegistry } from './resolve-components.js';
import { createStartupProfiler } from './startup-profile.js';
import { createSilentLogger } from './ui/logger.js';
import { createTrustedOriginResolver, publicHost } from './request-origin.js';
import { supportsTargetRouteCheck } from './route-check-support.js';
import { loadRouteSurfaceState } from './preview.js';
import { syncCssStateFromBuild } from './dev-server/css-state.js';
import {
    buildNotFoundPayload,
    classifyNotFound,
    infer404Cause,
    looksLikeJsonRequest,
    renderNotFoundHtml,
    traceNotFound
} from './dev-server/not-found.js';
import { createDevRequestHandler } from './dev-server/request-handler.js';
import { createDevWatcher } from './dev-server/watcher.js';
import { listenWithPortFallback } from './dev-server/port-fallback.js';
import { loadDevGlobalMiddlewareSource } from './global-middleware-runtime-source.js';
import { STATIC_MIME_TYPES } from './static-mime.js';

const SCOPED_SERVER_DATA_LOWERING_HELPER_UNAVAILABLE =
    '[Zenith:ScopedServerData] Server-output lowering helper is unavailable. Run the CLI build step before packaging scoped server data modules.';

const IMAGE_RUNTIME_TAG_RE = new RegExp(
    '<' + 'script\\b[^>]*\\bid=(["\'])zenith-image-runtime\\1[^>]*>[\\s\\S]*?<\\/' + 'script>',
    'i'
);
const EVENT_STREAM_MIME = ['text', 'event-stream'].join('/');
const LEGACY_DEV_STREAM_PATH = ['/__zenith', '_hmr'].join('');
let scopedServerDataLoweringPromise = null;

function resolveScopedServerDataLoweringPath() {
    const moduleDir = dirname(fileURLToPath(import.meta.url));
    return [
        join(moduleDir, 'scoped-server-data', 'lowering.js'),
        join(moduleDir, '..', 'dist', 'scoped-server-data', 'lowering.js')
    ].find((candidate) => existsSync(candidate)) || null;
}

async function getScopedServerDataLowering() {
    const helperPath = resolveScopedServerDataLoweringPath();
    if (!helperPath) {
        throw new Error(SCOPED_SERVER_DATA_LOWERING_HELPER_UNAVAILABLE);
    }
    if (!scopedServerDataLoweringPromise) {
        scopedServerDataLoweringPromise = import(pathToFileURL(helperPath).href);
    }
    return scopedServerDataLoweringPromise;
}

function appendSetCookieHeaders(headers, setCookies = []) {
    if (Array.isArray(setCookies) && setCookies.length > 0) {
        headers['Set-Cookie'] = setCookies.slice();
    }
    return headers;
}

// Note: V0 HMR script injection has been moved to the runtime client.
// This server purely hosts the V1 HMR contract endpoints.

/**
 * Create and start a development server.
 *
 * @param {{ pagesDir: string, outDir: string, projectRoot?: string, port?: number, host?: string, config?: object, logger?: object | null }} options
 * @returns {Promise<{ server: import('http').Server, port: number, requestedPort: number, portFallback: object | null, close: () => void }>}
 */
export async function createDevServer(options) {
    const startupProfile = createStartupProfiler('cli-dev-server');
    const {
        pagesDir,
        outDir,
        projectRoot: providedProjectRoot = null,
        port = 3000,
        host = '127.0.0.1',
        config = {},
        logger: providedLogger = null
    } = options;
    const logger = providedLogger || createSilentLogger();
    const buildSession = createDevBuildSession({ pagesDir, outDir, config, logger });
    const configuredBasePath = normalizeBasePath(config.basePath || '/');
    const resolvedTarget = resolveBuildAdapter(config).target;
    const routeCheckEnabled = supportsTargetRouteCheck(resolvedTarget);
    const isStaticExportTarget = resolvedTarget === 'static-export';
    const compilerOpts = { typescriptDefault: config.typescriptDefault === true, experimentalEmbeddedMarkup: config.embeddedMarkupExpressions === true, strictDomLints: config.strictDomLints === true };

    const resolvedPagesDir = resolve(pagesDir);
    const resolvedOutDir = resolve(outDir);
    const resolvedOutDirTmp = resolve(dirname(resolvedOutDir), `${basename(resolvedOutDir)}.tmp`);
    const pagesParentDir = dirname(resolvedPagesDir);
    const inferredProjectRoot = basename(pagesParentDir) === 'src'
        ? dirname(pagesParentDir)
        : pagesParentDir;
    const projectRoot = resolve(providedProjectRoot || inferredProjectRoot);
    const watchRoots = new Set([projectRoot, pagesParentDir]);

    /** @type {import('http').ServerResponse[]} */
    const hmrClients = [];
    const sseHeartbeat = setInterval(() => {
        for (const client of hmrClients) {
            try {
                client.write(': ping\n\n');
            } catch {
                // client disconnected
            }
        }
    }, 15000);

    const state = {
        buildId: 0,
        pendingBuildId: 0,
        buildStatus: 'building',
        lastBuildMs: Date.now(),
        durationMs: 0,
        buildError: null,
        initialBuildSettled: false,
        currentCssAssetPath: '',
        currentCssHref: '',
        currentCssContent: '',
        currentRouteState: { pageRoutes: [], resourceRoutes: [] }
    };
    const traceEnabled = process.env.ZENITH_DEV_TRACE === '1';
    const verboseLogging = traceEnabled || logger.mode?.logLevel === 'verbose';

    let actualPort = port;
    const resolveServerOrigin = createTrustedOriginResolver({
        host,
        getPort: () => actualPort,
        label: 'dev server'
    });
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

    function _trace404(req, url, details = {}) {
        traceNotFound(_trace, req, url, details);
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
        const attempts = state.buildStatus === 'building' ? 200 : 1;
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

    async function _syncCssStateFromBuild(buildResult, nextBuildId) {
        return syncCssStateFromBuild({
            buildResult,
            nextBuildId,
            outDir,
            state,
            trace: _trace
        });
    }

    async function _loadRoutesForRequests() {
        if (
            state.buildStatus === 'building' &&
            (
                (Array.isArray(state.currentRouteState.pageRoutes) && state.currentRouteState.pageRoutes.length > 0) ||
                (Array.isArray(state.currentRouteState.resourceRoutes) && state.currentRouteState.resourceRoutes.length > 0)
            )
        ) {
            return state.currentRouteState;
        }
        try {
            const routeState = await loadRouteSurfaceState(outDir, configuredBasePath);
            if (
                (Array.isArray(routeState.pageRoutes) && routeState.pageRoutes.length > 0) ||
                (Array.isArray(routeState.resourceRoutes) && routeState.resourceRoutes.length > 0)
            ) {
                const mergedRouteState = await _mergeDevScopedServerData(routeState);
                state.currentRouteState = mergedRouteState;
                return mergedRouteState;
            }
        } catch (error) {
            if (
                !(Array.isArray(state.currentRouteState.pageRoutes) && state.currentRouteState.pageRoutes.length > 0) &&
                !(Array.isArray(state.currentRouteState.resourceRoutes) && state.currentRouteState.resourceRoutes.length > 0)
            ) {
                throw error;
            }
        }
        return state.currentRouteState;
    }

    async function _mergeDevScopedServerData(routeState) {
        const scopedByPath = await _loadDevScopedServerDataByPath();
        if (scopedByPath.size === 0) {
            return routeState;
        }
        return {
            ...routeState,
            pageRoutes: (Array.isArray(routeState.pageRoutes) ? routeState.pageRoutes : []).map((route) => {
                const scoped = scopedByPath.get(route.path);
                return scoped ? { ...route, ...scoped } : route;
            })
        };
    }

    async function _loadDevScopedServerDataByPath() {
        const srcDir = resolve(resolvedPagesDir, '..');
        const registry = buildComponentRegistry(srcDir);
        const manifest = await generateManifest(resolvedPagesDir, '.zen', {
            srcDir,
            registry,
            compilerOpts
        });
        const pageEntries = manifest.filter((entry) =>
            entry?.route_kind !== 'resource' &&
            entry?.has_scoped_server_data === true &&
            Array.isArray(entry?.scoped_server_data) &&
            entry.scoped_server_data.length > 0
        );
        const scopedByPath = new Map();
        if (pageEntries.length === 0) {
            return scopedByPath;
        }

        const lowering = await getScopedServerDataLowering();
        for (const entry of pageEntries) {
            const pageFile = resolve(resolvedPagesDir, entry.file);
            const pageSource = await readFile(pageFile, 'utf8');
            const lowered = lowering.lowerRouteScopedServerData({
                pageSource,
                pageFile,
                registry,
                srcDir,
                projectRoot,
                compilerOpts,
                scopedServerData: entry.scoped_server_data
            });
            scopedByPath.set(entry.path, {
                has_scoped_server_data: true,
                scoped_server_data: lowered.scopedServerData,
                scoped_server_modules: lowered.modules.map((module) => ({
                    module: module.module,
                    source: module.source,
                    sourcePath: module.sourcePath
                }))
            });
        }
        return scopedByPath;
    }

    async function _loadGlobalMiddlewareForRequests() {
        return loadDevGlobalMiddlewareSource({
            projectRoot,
            pagesDir: resolvedPagesDir,
            target: resolvedTarget
        });
    }

    function _broadcastEvent(type, payload = {}) {
        const eventBuildId = Number.isInteger(payload.buildId) ? payload.buildId : state.buildId;
        const data = JSON.stringify({
            buildId: eventBuildId,
            ...payload
        });
        _trace('sse_emit', {
            type,
            buildId: eventBuildId,
            status: state.buildStatus,
            cssHref: state.currentCssHref,
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
        state.buildStatus = 'building';
        state.buildError = null;
        const startTime = Date.now();
        startupProfile.emit('initial_build_start', { buildId: state.buildId });
        try {
            logger.build('Initial build (id=0)', { onceKey: 'dev-initial-build' });
            const initialBuild = await buildSession.build();
            const cssReady = await _syncCssStateFromBuild(initialBuild, state.buildId);
            state.currentRouteState = await _mergeDevScopedServerData(await loadRouteSurfaceState(outDir, configuredBasePath));
            state.buildStatus = 'ok';
            state.buildError = null;
            state.lastBuildMs = Date.now();
            state.durationMs = state.lastBuildMs - startTime;
            if (cssReady && state.currentCssHref.length > 0) {
                logger.css(`ready (${state.currentCssHref})`, {
                    onceKey: `css-ready:${state.buildId}:${state.currentCssHref}`
                });
            }
            _trace('state_snapshot', {
                status: state.buildStatus,
                buildId: state.buildId,
                cssHref: state.currentCssHref,
                durationMs: state.durationMs
            });
            startupProfile.emit('initial_build_complete', {
                buildId: state.buildId,
                status: state.buildStatus,
                durationMs: state.durationMs,
                cssReady,
                routes: (Array.isArray(state.currentRouteState.pageRoutes) ? state.currentRouteState.pageRoutes.length : 0) +
                    (Array.isArray(state.currentRouteState.resourceRoutes) ? state.currentRouteState.resourceRoutes.length : 0)
            });
        } catch (err) {
            state.buildStatus = 'error';
            state.buildError = { message: err instanceof Error ? err.message : String(err) };
            state.lastBuildMs = Date.now();
            state.durationMs = state.lastBuildMs - startTime;
            logger.error('initial build failed', {
                hint: 'fix the error and restart dev',
                error: err
            });
            _trace('state_snapshot', {
                status: state.buildStatus,
                buildId: state.buildId,
                durationMs: state.durationMs,
                error: state.buildError
            });
            startupProfile.emit('initial_build_complete', {
                buildId: state.buildId,
                status: state.buildStatus,
                durationMs: state.durationMs,
                error: state.buildError?.message || ''
            });
        } finally {
            state.initialBuildSettled = true;
        }
    }

    state.hmrClients = hmrClients;

    const server = createServer(createDevRequestHandler({
        outDir,
        projectRoot,
        imageConfig: config.images,
        configuredBasePath,
        routeCheckEnabled,
        isStaticExportTarget,
        logger,
        verboseLogging,
        buildSession,
        state,
        serverOrigin: _serverOrigin,
        loadRoutesForRequests: _loadRoutesForRequests,
        loadGlobalMiddlewareForRequests: _loadGlobalMiddlewareForRequests,
        readFileForRequest: _readFileForRequest,
        trace404: _trace404,
        looksLikeJsonRequest,
        classifyNotFound,
        infer404Cause,
        buildNotFoundPayload,
        renderNotFoundHtml,
        appendSetCookieHeaders,
        MIME_TYPES: STATIC_MIME_TYPES,
        EVENT_STREAM_MIME,
        LEGACY_DEV_STREAM_PATH,
        IMAGE_RUNTIME_TAG_RE
    }));

    const watcherController = createDevWatcher({
        watchRoots,
        resolvedOutDir,
        resolvedOutDirTmp,
        projectRoot,
        rebuildDebounceMs,
        queuedRebuildDebounceMs,
        buildSession,
        outDir,
        configuredBasePath,
        logger,
        startupProfile,
        state,
        syncCssStateFromBuild: _syncCssStateFromBuild,
        broadcastEvent: _broadcastEvent,
        trace: _trace
    });

    const closeServer = () => {
        clearInterval(sseHeartbeat);
        watcherController.close();
        for (const client of hmrClients) {
            try { client.end(); } catch { }
        }
        hmrClients.length = 0;
        try { server.close(); } catch { }
    };

    try {
        const listenResult = await listenWithPortFallback({ server, port, host });
        actualPort = listenResult.port;
        startupProfile.emit('server_bound', {
            host: _publicHost(),
            port: actualPort,
            buildStatus: state.buildStatus
        });
        _trace('server_bound', {
            host: _publicHost(),
            port: actualPort,
            buildStatus: state.buildStatus
        });

        await _runInitialBuild();
        watcherController.start();
        return {
            server,
            port: actualPort,
            requestedPort: listenResult.requestedPort,
            portFallback: listenResult.portFallback,
            close: closeServer
        };
    } catch (error) {
        closeServer();
        throw error;
    }
}
