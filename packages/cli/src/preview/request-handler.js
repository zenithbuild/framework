import { readFile } from 'node:fs/promises';
import { dirname, extname, join } from 'node:path';
import { appLocalRedirectLocation, imageEndpointPath, routeCheckPath, stripBasePath } from '../base-path.js';
import { materializeImageMarkup } from '../images/materialize.js';
import { createImageRuntimePayload, injectImageRuntimePayload } from '../images/payload.js';
import { handleImageRequest } from '../images/service.js';
import { readRequestBodyBuffer } from '../request-body.js';
import { buildResourceResponseDescriptor } from '../resource-response.js';
import { clientFacingRouteMessage, logServerException, sanitizeRouteResult } from '../server-error.js';
import { resolveRequestRoute } from '../server/resolve-request-route.js';
import { STATIC_MIME_TYPES } from '../static-mime.js';
import { loadPreviewGlobalMiddlewareSource } from '../global-middleware-runtime-source.js';
import { loadRouteSurfaceState } from './manifest.js';
import { injectSsrPayload } from './payload.js';
import { fileExists, resolveWithinDist, toStaticFilePath } from './paths.js';
import { executeServerRoute, routeIdFromSourcePath } from './server-runner.js';

const IMAGE_RUNTIME_TAG_RE = /<script\b[^>]*\bid=(["'])zenith-image-runtime\1[^>]*>[\s\S]*?<\/script>/i;

function appendSetCookieHeaders(headers, setCookies = []) {
  if (Array.isArray(setCookies) && setCookies.length > 0) {
    headers['Set-Cookie'] = setCookies.slice();
  }
  return headers;
}

function respondWithMiddlewareSourceError(res, error) {
  logServerException('preview server route execution failed', error);
  res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end(clientFacingRouteMessage(500));
}

function hasRouteScopedServerData(route) {
  return route?.has_scoped_server_data === true &&
    Array.isArray(route?.scoped_server_data) &&
    route.scoped_server_data.length > 0;
}

async function loadPreviewScopedServerRoutes(serverModuleBaseDir) {
  try {
    const parsed = JSON.parse(await readFile(join(serverModuleBaseDir, 'manifest.json'), 'utf8'));
    return Array.isArray(parsed?.routes) ? parsed.routes : [];
  } catch {
    return [];
  }
}

function mergePreviewScopedServerRoutes(routeState, serverRoutes) {
  const scopedByPath = new Map(
    (Array.isArray(serverRoutes) ? serverRoutes : [])
      .filter((route) => hasRouteScopedServerData(route))
      .map((route) => [route.path, route])
  );
  if (scopedByPath.size === 0) {
    return routeState;
  }
  return {
    ...routeState,
    pageRoutes: (Array.isArray(routeState.pageRoutes) ? routeState.pageRoutes : []).map((route) => {
      const scoped = scopedByPath.get(route.path);
      if (!scoped) {
        return route;
      }
      return {
        ...route,
        has_scoped_server_data: true,
        scoped_server_data: scoped.scoped_server_data
      };
    })
  };
}

export function createPreviewRequestHandler(options) {
  const {
    distDir,
    projectRoot,
    config,
    logger,
    verboseLogging,
    configuredBasePath,
    routeCheckEnabled,
    isStaticExportTarget,
    serverOrigin
  } = options;

  async function loadImageManifest() {
    try {
      const manifestRaw = await readFile(join(distDir, '_zenith', 'image', 'manifest.json'), 'utf8');
      const parsed = JSON.parse(manifestRaw);
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
      return {};
    }
  }

  async function loadGlobalMiddlewareForRoute() {
    return loadPreviewGlobalMiddlewareSource({ projectRoot, distDir });
  }

  return async function previewRequestHandler(req, res) {
    const url = new URL(req.url, serverOrigin());
    const serverModuleBaseDir = join(dirname(distDir), 'server');
    const routeState = mergePreviewScopedServerRoutes(
      await loadRouteSurfaceState(distDir, configuredBasePath),
      await loadPreviewScopedServerRoutes(serverModuleBaseDir)
    );
    const { basePath, pageRoutes, resourceRoutes } = routeState;
    const canonicalPath = stripBasePath(url.pathname, basePath);

    try {
      if (url.pathname === routeCheckPath(basePath)) {
        if (!routeCheckEnabled) {
          res.writeHead(501, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
          res.end(JSON.stringify({ error: 'route_check_unsupported' }));
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
        const canonicalTargetPath = stripBasePath(targetUrl.pathname, basePath);
        if (canonicalTargetPath === null) {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'route_not_found' }));
          return;
        }
        const canonicalTargetUrl = new URL(targetUrl.toString());
        canonicalTargetUrl.pathname = canonicalTargetPath;
        const resolvedCheck = resolveRequestRoute(canonicalTargetUrl, pageRoutes);
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
          routeId: resolvedCheck.route.route_id || routeIdFromSourcePath(resolvedCheck.route.server_script_path || ''),
          guardOnly: true
        });
        // Security: Enforce relative or same-origin redirects
        if (checkResult && checkResult.result && checkResult.result.kind === 'redirect') {
          const loc = appLocalRedirectLocation(checkResult.result.location || '/', basePath);
          checkResult.result.location = loc;
          if (loc.includes('://') || loc.startsWith('//')) {
            try {
              const parsedLoc = new URL(loc);
              if (parsedLoc.origin !== targetUrl.origin) {
                checkResult.result.location = appLocalRedirectLocation('/', basePath);
              }
            } catch {
              checkResult.result.location = appLocalRedirectLocation('/', basePath);
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
      }

      if (url.pathname === imageEndpointPath(basePath)) {
        if (isStaticExportTarget) {
          throw new Error('not found');
        }
        await handleImageRequest(req, res, {
          requestUrl: url,
          projectRoot,
          config: config.images
        });
        return;
      }

      if (canonicalPath === null) {
        throw new Error('not found');
      }

      if (extname(canonicalPath) && extname(canonicalPath) !== '.html') {
        const staticPath = isStaticExportTarget
          ? resolveWithinDist(distDir, url.pathname)
          : resolveWithinDist(distDir, canonicalPath);
        if (!staticPath || !(await fileExists(staticPath))) {
          throw new Error('not found');
        }
        const content = await readFile(staticPath);
        const mime = STATIC_MIME_TYPES[extname(staticPath)] || 'application/octet-stream';
        res.writeHead(200, { 'Content-Type': mime });
        res.end(content);
        return;
      }

      if (isStaticExportTarget) {
        const directHtmlPath = toStaticFilePath(distDir, url.pathname);
        if (!directHtmlPath || !(await fileExists(directHtmlPath))) {
          throw new Error('not found');
        }
        const html = await readFile(directHtmlPath, 'utf8');
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(html);
        return;
      }

      const canonicalUrl = new URL(url.toString());
      canonicalUrl.pathname = canonicalPath;
      const resolvedResource = resolveRequestRoute(canonicalUrl, resourceRoutes);
      if (resolvedResource.matched && resolvedResource.route) {
        let globalMiddleware = null;
        try {
          globalMiddleware = await loadGlobalMiddlewareForRoute();
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
          routeId: resolvedResource.route.route_id || routeIdFromSourcePath(resolvedResource.route.server_script_path || ''),
          routeKind: 'resource',
          globalMiddlewareSource: globalMiddleware?.source || '',
          globalMiddlewareSourcePath: globalMiddleware?.sourcePath || ''
        });
        const descriptor = buildResourceResponseDescriptor(execution?.result, basePath, Array.isArray(execution?.setCookies) ? execution.setCookies : []);
        res.writeHead(descriptor.status, appendSetCookieHeaders(descriptor.headers, descriptor.setCookies));
        if ((req.method || 'GET').toUpperCase() === 'HEAD') {
          res.end();
          return;
        }
        res.end(descriptor.body);
        return;
      }

      const resolved = resolveRequestRoute(canonicalUrl, pageRoutes);
      let htmlPath = null;

      if (resolved.matched && resolved.route) {
        if (verboseLogging) {
          logger.router(
            `${req.method || 'GET'} ${url.pathname} -> ${resolved.route.path} params=${JSON.stringify(resolved.params)}`
          );
        }
        const output = resolved.route.output.startsWith('/')
          ? resolved.route.output.slice(1)
          : resolved.route.output;
        htmlPath = resolveWithinDist(distDir, output);
      } else {
        htmlPath = toStaticFilePath(distDir, url.pathname);
      }

      if (!htmlPath || !(await fileExists(htmlPath))) {
        throw new Error('not found');
      }

      let ssrPayload = null;
      let routeExecution = null;
      if (
        resolved.matched &&
        resolved.route?.prerender !== true &&
        (resolved.route?.server_script || hasRouteScopedServerData(resolved.route))
      ) {
        let globalMiddleware = null;
        try {
          globalMiddleware = await loadGlobalMiddlewareForRoute();
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
            routeId: resolved.route.route_id || routeIdFromSourcePath(resolved.route.server_script_path || ''),
            globalMiddlewareSource: globalMiddleware?.source || '',
            globalMiddlewareSourcePath: globalMiddleware?.sourcePath || '',
            scopedServerData: Array.isArray(resolved.route.scoped_server_data)
              ? resolved.route.scoped_server_data
              : [],
            scopedServerModuleBaseDir: serverModuleBaseDir
          });
        } catch (error) {
          logServerException('preview server route execution failed', error);
          ssrPayload = {
            __zenith_error: {
              status: 500,
              code: 'LOAD_FAILED',
              message: error instanceof Error ? error.message : String(error || '')
            }
          };
        }

        const trace = routeExecution?.trace || { guard: 'none', action: 'none', load: 'none' };
        const routeId = resolved.route.route_id || routeIdFromSourcePath(resolved.route.server_script_path || '');
        const setCookies = Array.isArray(routeExecution?.setCookies) ? routeExecution.setCookies : [];
        if (verboseLogging) {
          logger.router(`${routeId} guard=${trace.guard} action=${trace.action} load=${trace.load}`);
        }

        const result = routeExecution?.result;
        if (result && result.kind === 'redirect') {
          const status = Number.isInteger(result.status) ? result.status : 302;
          res.writeHead(status, appendSetCookieHeaders({
            Location: appLocalRedirectLocation(result.location, basePath),
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

      let html = await readFile(htmlPath, 'utf8');
      if (resolved.matched) {
        html = await materializeImageMarkup({
          html,
          payload: createImageRuntimePayload(config.images, await loadImageManifest(), 'endpoint', basePath),
          imageMaterialization: Array.isArray(resolved.route?.image_materialization)
            ? resolved.route.image_materialization
            : []
        });
      }
      if (ssrPayload) {
        html = injectSsrPayload(html, ssrPayload);
      }
      if (!IMAGE_RUNTIME_TAG_RE.test(html)) {
        html = injectImageRuntimePayload(
          html,
          createImageRuntimePayload(config.images, await loadImageManifest(), 'endpoint', basePath)
        );
      }

      res.writeHead(Number.isInteger(routeExecution?.status) ? routeExecution.status : 200, appendSetCookieHeaders({
        'Content-Type': 'text/html'
      }, Array.isArray(routeExecution?.setCookies) ? routeExecution.setCookies : []));
      res.end(html);
    } catch {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('404 Not Found');
    }
  };
}
