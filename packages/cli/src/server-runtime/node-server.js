import { createServer } from 'node:http';
import { Readable } from 'node:stream';
import { access, readFile } from 'node:fs/promises';
import { dirname, extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { appLocalRedirectLocation, imageEndpointPath, normalizeBasePath, routeCheckPath, stripBasePath } from '../base-path.js';
import { handleImageRequest } from '../images/service.js';
import { createTrustedOriginResolver } from '../request-origin.js';
import { defaultRouteDenyMessage, logServerException, sanitizeRouteResult } from '../server-error.js';
import { executeRouteRequest, renderResourceRouteRequest, renderRouteRequest } from './route-render.js';
import { resolveRequestRoute } from './resolve-request-route.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PUBLIC_ORIGIN_ENV = 'ZENITH_PUBLIC_ORIGIN';

const MIME_TYPES = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.png': 'image/png',
    '.jpeg': 'image/jpeg',
    '.jpg': 'image/jpeg',
    '.svg': 'image/svg+xml',
    '.webp': 'image/webp',
    '.avif': 'image/avif',
    '.gif': 'image/gif',
    '.txt': 'text/plain; charset=utf-8',
    '.ico': 'image/x-icon',
    '.woff': 'font/woff',
    '.woff2': 'font/woff2',
    '.ttf': 'font/ttf',
    '.otf': 'font/otf',
    '.webmanifest': 'application/manifest+json'
};

let runtimeContextPromise = null;

async function fileExists(filePath) {
    try {
        await access(filePath);
        return true;
    } catch {
        return false;
    }
}

async function readJson(filePath, fallback) {
    try {
        return JSON.parse(await readFile(filePath, 'utf8'));
    } catch {
        return fallback;
    }
}

function resolveWithinRoot(rootDir, requestPath) {
    let decoded = requestPath;
    try {
        decoded = decodeURIComponent(requestPath);
    } catch {
        return null;
    }

    const normalized = normalize(decoded).replace(/\\/g, '/');
    const relativePath = normalized.replace(/^\/+/, '');
    const root = resolve(rootDir);
    const candidate = resolve(root, relativePath);
    if (candidate === root || candidate.startsWith(`${root}${sep}`)) {
        return candidate;
    }
    return null;
}

function resolveManifestMiddlewareModulePath(serverDir, serverManifest) {
    const modulePath = serverManifest?.global_middleware?.module;
    if (typeof modulePath !== 'string' || modulePath.trim().length === 0) {
        return null;
    }

    const normalized = normalize(modulePath).replace(/\\/g, '/');
    if (normalized === '..' || normalized.startsWith('../') || normalized.startsWith('/')) {
        throw new Error('[Zenith:Middleware] Invalid global middleware module path in server manifest.');
    }

    const root = resolve(serverDir);
    const candidate = resolve(root, normalized);
    if (candidate !== root && candidate.startsWith(`${root}${sep}`)) {
        return candidate;
    }
    throw new Error('[Zenith:Middleware] Invalid global middleware module path in server manifest.');
}

function toStaticFilePath(staticDir, pathname) {
    let resolvedPath = pathname;
    if (resolvedPath === '/') {
        resolvedPath = '/index.html';
    } else if (!extname(resolvedPath)) {
        resolvedPath += '/index.html';
    }
    return resolveWithinRoot(staticDir, resolvedPath);
}

async function createWebRequest(req, url) {
    const init = {
        method: req.method || 'GET',
        headers: new Headers()
    };

    for (const [key, rawValue] of Object.entries(req.headers || {})) {
        if (Array.isArray(rawValue)) {
            for (const value of rawValue) {
                init.headers.append(key, String(value));
            }
            continue;
        }
        if (rawValue !== undefined) {
            init.headers.set(key, String(rawValue));
        }
    }

    const method = String(init.method || 'GET').toUpperCase();
    if (method !== 'GET' && method !== 'HEAD') {
        const bodyChunks = [];
        for await (const chunk of req) {
            bodyChunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        }
        init.body = Readable.toWeb(Readable.from(bodyChunks));
        init.duplex = 'half';
    }

    return new Request(url.toString(), init);
}

function getSetCookieValues(response) {
    if (typeof response?.headers?.getSetCookie === 'function') {
        return response.headers.getSetCookie();
    }
    const value = response?.headers?.get?.('set-cookie');
    return typeof value === 'string' && value.length > 0 ? [value] : [];
}

async function sendFetchResponse(res, response, method) {
    res.statusCode = response.status;
    const setCookies = getSetCookieValues(response);
    if (setCookies.length > 0) {
        res.setHeader('set-cookie', setCookies);
    }
    for (const [key, value] of response.headers.entries()) {
        if (key.toLowerCase() === 'set-cookie') {
            continue;
        }
        res.setHeader(key, value);
    }

    if (String(method || 'GET').toUpperCase() === 'HEAD' || !response.body) {
        res.end();
        return;
    }

    try {
        const bodyStream = Readable.fromWeb(response.body);
        bodyStream.pipe(res);
        bodyStream.on('error', (err) => {
            logServerException('node response stream failed', err);
            if (!res.headersSent) {
                res.statusCode = 500;
                res.end();
            } else {
                res.destroy();
            }
        });
    } catch (err) {
        logServerException('node response pipe creation failed', err);
        if (!res.headersSent) {
            res.statusCode = 500;
            res.end();
        } else {
            res.destroy();
        }
    }
}

async function sendStaticFile(res, filePath, method) {
    const body = await readFile(filePath);
    const contentType = MIME_TYPES[extname(filePath)] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': contentType });
    if (String(method || 'GET').toUpperCase() === 'HEAD') {
        res.end();
        return;
    }
    res.end(body);
}

function normalizeRouteCheckResult(result, targetUrl, basePath) {
    if (!result || result.kind !== 'redirect') {
        return result;
    }

    const location = appLocalRedirectLocation(result.location, basePath);
    if (location.includes('://') || location.startsWith('//')) {
        try {
            const redirectUrl = new URL(location);
            if (redirectUrl.origin !== targetUrl.origin) {
                return { ...result, location: appLocalRedirectLocation('/', basePath) };
            }
        } catch {
            return { ...result, location: appLocalRedirectLocation('/', basePath) };
        }
    }
    return { ...result, location };
}

async function loadRuntimeContext(options = {}) {
    if (!options.distDir && runtimeContextPromise) {
        return runtimeContextPromise;
    }

    const load = async () => {
        const distDir = options.distDir ? resolve(options.distDir) : resolve(__dirname, '..', '..');
        const serverDir = join(distDir, 'server');
        const config = await readJson(join(serverDir, 'config.json'), {
            base_path: '/',
            static_dir: '../static',
            build_manifest: '../manifest.json',
            images: {}
        });
        const buildManifest = await readJson(join(serverDir, config.build_manifest || '../manifest.json'), {
            routes: [],
            base_path: '/'
        });
        const serverManifest = await readJson(join(serverDir, 'manifest.json'), { routes: [] });
        const allServerRoutes = Array.isArray(serverManifest.routes) ? serverManifest.routes : [];
        const globalMiddlewareModulePath = resolveManifestMiddlewareModulePath(serverDir, serverManifest);

        return {
            distDir,
            serverDir,
            staticDir: resolve(serverDir, config.static_dir || '../static'),
            buildManifest,
            buildRoutes: Array.isArray(buildManifest.routes) ? buildManifest.routes : [],
            serverRoutes: allServerRoutes,
            pageServerRoutes: allServerRoutes.filter((route) => route?.route_kind !== 'resource'),
            resourceServerRoutes: allServerRoutes.filter((route) => route?.route_kind === 'resource'),
            globalMiddlewareModulePath,
            images: config.images || {},
            basePath: normalizeBasePath(config.base_path || '/')
        };
    };

    const promise = load();
    if (!options.distDir) {
        runtimeContextPromise = promise;
    }
    return promise;
}

async function handleRouteCheck(req, res, url, context) {
    if (req.headers['x-zenith-route-check'] !== '1') {
        res.writeHead(403, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'forbidden', message: 'invalid request context' }));
        return;
    }

    const targetPath = String(url.searchParams.get('path') || '/');
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

    const canonicalPath = stripBasePath(targetUrl.pathname, context.basePath);
    if (canonicalPath === null) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'route_not_found' }));
        return;
    }

    const canonicalTargetUrl = new URL(targetUrl.toString());
    canonicalTargetUrl.pathname = canonicalPath;
    const buildResolved = resolveRequestRoute(canonicalTargetUrl, context.buildRoutes);
    if (!buildResolved.matched || !buildResolved.route) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'route_not_found' }));
        return;
    }

    let result = { kind: 'allow' };
    let routeId = buildResolved.route.path || '';
    const serverResolved = resolveRequestRoute(canonicalTargetUrl, context.pageServerRoutes);
    if (serverResolved.matched && serverResolved.route) {
        routeId = serverResolved.route.route_id || serverResolved.route.name || serverResolved.route.path || routeId;
        try {
            const request = await createWebRequest(req, targetUrl);
            const routeDir = join(context.serverDir, 'routes', serverResolved.route.name);
            const execution = await executeRouteRequest({
                request,
                route: serverResolved.route,
                params: serverResolved.params,
                routeModulePath: join(routeDir, 'route', 'entry.js'),
                guardOnly: true
            });
            result = normalizeRouteCheckResult(execution.result, targetUrl, context.basePath);
        } catch (error) {
            logServerException('node route-check failed', error);
            result = {
                kind: 'deny',
                status: 500,
                message: defaultRouteDenyMessage(500)
            };
        }
    }

    res.writeHead(200, {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
        Pragma: 'no-cache',
        Expires: '0',
        Vary: 'Cookie'
    });
    res.end(JSON.stringify({
        result: sanitizeRouteResult(result),
        routeId,
        to: targetUrl.toString()
    }));
}

async function handleNodeRequest(req, res, context, serverOrigin) {
    const url = new URL(req.url || '/', serverOrigin);
    const canonicalPath = stripBasePath(url.pathname, context.basePath);

    if (url.pathname === routeCheckPath(context.basePath)) {
        await handleRouteCheck(req, res, url, context);
        return;
    }

    if (url.pathname === imageEndpointPath(context.basePath)) {
        await handleImageRequest(req, res, {
            requestUrl: url,
            projectRoot: context.distDir,
            config: context.images
        });
        return;
    }

    if (canonicalPath === null) {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('404 Not Found');
        return;
    }

    const canonicalUrl = new URL(url.toString());
    canonicalUrl.pathname = canonicalPath;

    if (extname(canonicalPath) && extname(canonicalPath) !== '.html') {
        const assetPath = resolveWithinRoot(context.staticDir, canonicalPath);
        if (!assetPath || !(await fileExists(assetPath))) {
            res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
            res.end('404 Not Found');
            return;
        }
        await sendStaticFile(res, assetPath, req.method);
        return;
    }

    const resourceResolved = resolveRequestRoute(canonicalUrl, context.resourceServerRoutes);
    if (resourceResolved.matched && resourceResolved.route) {
        const routeDir = join(context.serverDir, 'routes', resourceResolved.route.name);
        const request = await createWebRequest(req, url);
        const response = await renderResourceRouteRequest({
            request,
            route: resourceResolved.route,
            params: resourceResolved.params,
            routeModulePath: join(routeDir, 'route', 'entry.js'),
            globalMiddlewareModulePath: context.globalMiddlewareModulePath
        });
        await sendFetchResponse(res, response, req.method);
        return;
    }

    const serverResolved = resolveRequestRoute(canonicalUrl, context.pageServerRoutes);
    if (serverResolved.matched && serverResolved.route) {
        const routeDir = join(context.serverDir, 'routes', serverResolved.route.name);
        const request = await createWebRequest(req, url);
        const response = await renderRouteRequest({
            request,
            route: serverResolved.route,
            params: serverResolved.params,
            routeModulePath: join(routeDir, 'route', 'entry.js'),
            globalMiddlewareModulePath: context.globalMiddlewareModulePath,
            shellHtmlPath: join(routeDir, 'route', 'page.html'),
            imageManifestPath: serverResolved.route.image_manifest_file
                ? join(routeDir, 'route', serverResolved.route.image_manifest_file)
                : null,
            imageConfig: serverResolved.route.image_config || context.images
        });
        await sendFetchResponse(res, response, req.method);
        return;
    }

    const buildResolved = resolveRequestRoute(canonicalUrl, context.buildRoutes);
    if (buildResolved.matched && buildResolved.route) {
        const htmlPath = resolveWithinRoot(context.staticDir, buildResolved.route.html);
        if (htmlPath && await fileExists(htmlPath)) {
            await sendStaticFile(res, htmlPath, req.method);
            return;
        }
    }

    const fallbackHtmlPath = toStaticFilePath(context.staticDir, canonicalPath);
    if (fallbackHtmlPath && await fileExists(fallbackHtmlPath)) {
        await sendStaticFile(res, fallbackHtmlPath, req.method);
        return;
    }

    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('404 Not Found');
}

function createNodeRequestHandler(context, resolveServerOrigin) {
    return async (req, res) => {
        try {
            await handleNodeRequest(req, res, context, resolveServerOrigin());
        } catch (error) {
            logServerException('node request handler failed', error);
            res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
            res.end(defaultRouteDenyMessage(500));
        }
    };
}

export async function createRequestHandler(options = {}) {
    const context = await loadRuntimeContext(options);
    const publicOrigin = options.publicOrigin ?? process.env[PUBLIC_ORIGIN_ENV];
    const resolveServerOrigin = createTrustedOriginResolver({
        publicOrigin,
        host: options.host || '127.0.0.1',
        port: Number.isInteger(options.port) ? options.port : undefined,
        label: 'createRequestHandler()'
    });
    resolveServerOrigin();
    return createNodeRequestHandler(context, resolveServerOrigin);
}

export async function createNodeServer(options = {}) {
    const {
        port = 3000,
        host = '127.0.0.1'
    } = options;
    const context = await loadRuntimeContext(options);
    let actualPort = Number.isInteger(port) && port > 0 ? port : 0;
    const publicOrigin = options.publicOrigin ?? process.env[PUBLIC_ORIGIN_ENV];
    const resolveServerOrigin = createTrustedOriginResolver({
        publicOrigin,
        host,
        getPort: () => actualPort,
        label: 'createNodeServer()'
    });
    const handler = createNodeRequestHandler(context, resolveServerOrigin);
    const server = createServer((req, res) => {
        void handler(req, res);
    });

    return new Promise((resolveServer) => {
        server.listen(port, host, () => {
            const address = server.address();
            actualPort = address && typeof address === 'object' ? address.port : port;
            resolveServer({
                server,
                port: actualPort,
                close: () => server.close()
            });
        });
    });
}
