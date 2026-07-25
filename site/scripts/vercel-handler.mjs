/**
 * Vercel Function entry point for Zenith site.
 *
 * This file is copied to .vercel/output/functions/zenith-handler.func/index.js
 * by the vercel-adapter. It receives Web API Request objects and returns
 * Web API Response objects, reusing Zenith's existing route rendering logic
 * (including injectSsrPayload) for SSR data injection at request time.
 */

import { readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { renderRouteRequest, executeRouteRequest, renderResourceRouteRequest } from './dist/server/runtime/route-render.js';
import { resolveRequestRoute } from './dist/server/runtime/resolve-request-route.js';
import {
  normalizeBasePath,
  stripBasePath,
  routeCheckPath,
  appLocalRedirectLocation,
} from './dist/server/base-path.js';
import { defaultRouteDenyMessage } from './dist/server/server-error.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

let contextPromise = null;

async function loadContext() {
  if (contextPromise) return contextPromise;
  contextPromise = (async () => {
    const distDir = join(__dirname, 'dist');
    const serverDir = join(distDir, 'server');
    const config = JSON.parse(await readFile(join(serverDir, 'config.json'), 'utf8'));
    const buildManifestPath = join(serverDir, config.build_manifest || '../manifest.json');
    const buildManifest = JSON.parse(await readFile(buildManifestPath, 'utf8'));
    const serverManifest = JSON.parse(await readFile(join(serverDir, 'manifest.json'), 'utf8'));
    const allRoutes = Array.isArray(serverManifest.routes) ? serverManifest.routes : [];
    const basePath = normalizeBasePath(config.base_path || '/');

    // Detect global middleware module path
    let globalMiddlewareModulePath = null;
    const mwModule = serverManifest?.global_middleware?.module;
    if (typeof mwModule === 'string' && mwModule.trim()) {
      globalMiddlewareModulePath = join(serverDir, mwModule);
    }

    return {
      distDir,
      serverDir,
      staticDir: join(serverDir, config.static_dir || '../static'),
      buildRoutes: Array.isArray(buildManifest.routes) ? buildManifest.routes : [],
      pageServerRoutes: allRoutes.filter((r) => r?.route_kind !== 'resource'),
      resourceServerRoutes: allRoutes.filter((r) => r?.route_kind === 'resource'),
      globalMiddlewareModulePath,
      images: config.images || {},
      basePath,
    };
  })();
  return contextPromise;
}

function sanitizeRouteResult(result) {
  if (!result || typeof result !== 'object') return result;
  const { kind, status, location, message } = result;
  const out = { kind };
  if (Number.isInteger(status)) out.status = status;
  if (typeof location === 'string') out.location = location;
  if (typeof message === 'string') out.message = message;
  return out;
}

function normalizeRouteCheckResult(result, targetUrl, basePath) {
  if (!result || result.kind !== 'redirect') return result;
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

async function handleRouteCheck(request, url, context) {
  if (request.headers.get('x-zenith-route-check') !== '1') {
    return new Response(JSON.stringify({ error: 'forbidden', message: 'invalid request context' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const targetPath = String(url.searchParams.get('path') || '/');
  if (targetPath.includes('://') || targetPath.startsWith('//') || /[\r\n]/.test(targetPath)) {
    return new Response(JSON.stringify({ error: 'invalid_path_format' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const targetUrl = new URL(targetPath, url.origin);
  if (targetUrl.origin !== url.origin) {
    return new Response(JSON.stringify({ error: 'external_route_evaluation_forbidden' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const canonicalPath = stripBasePath(targetUrl.pathname, context.basePath);
  if (canonicalPath === null) {
    return new Response(JSON.stringify({ error: 'route_not_found' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const canonicalTargetUrl = new URL(targetUrl.toString());
  canonicalTargetUrl.pathname = canonicalPath;

  const buildResolved = resolveRequestRoute(canonicalTargetUrl, context.buildRoutes);
  if (!buildResolved.matched || !buildResolved.route) {
    return new Response(JSON.stringify({ error: 'route_not_found' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  let result = { kind: 'allow' };
  let routeId = buildResolved.route.path || '';

  const serverResolved = resolveRequestRoute(canonicalTargetUrl, context.pageServerRoutes);
  if (serverResolved.matched && serverResolved.route) {
    routeId = serverResolved.route.route_id || serverResolved.route.name || serverResolved.route.path || routeId;
    try {
      const routeDir = join(context.serverDir, 'routes', serverResolved.route.name);
      const execution = await executeRouteRequest({
        request,
        route: serverResolved.route,
        params: serverResolved.params,
        routeModulePath: join(routeDir, 'route', 'entry.js'),
        guardOnly: true,
      });
      result = normalizeRouteCheckResult(execution.result, targetUrl, context.basePath);
    } catch (error) {
      console.error('[Zenith Vercel] route-check failed:', error.message);
      result = { kind: 'deny', status: 500, message: defaultRouteDenyMessage(500) };
    }
  }

  return new Response(JSON.stringify({
    result: sanitizeRouteResult(result),
    routeId,
    to: targetUrl.toString(),
  }), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
      Pragma: 'no-cache',
      Expires: '0',
      Vary: 'Cookie',
    },
  });
}

async function handlePageRoute(request, url, canonicalUrl, context) {
  const serverResolved = resolveRequestRoute(canonicalUrl, context.pageServerRoutes);
  if (!serverResolved.matched || !serverResolved.route) return null;

  const routeDir = join(context.serverDir, 'routes', serverResolved.route.name);
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
    imageConfig: serverResolved.route.image_config || context.images,
  });
  return response;
}

async function handleResourceRoute(request, url, canonicalUrl, context) {
  const resourceResolved = resolveRequestRoute(canonicalUrl, context.resourceServerRoutes);
  if (!resourceResolved.matched || !resourceResolved.route) return null;

  const routeDir = join(context.serverDir, 'routes', resourceResolved.route.name);
  const response = await renderResourceRouteRequest({
    request,
    route: resourceResolved.route,
    params: resourceResolved.params,
    routeModulePath: join(routeDir, 'route', 'entry.js'),
    globalMiddlewareModulePath: context.globalMiddlewareModulePath,
  });
  return response;
}

export default async function handler(request) {
  try {
    const context = await loadContext();
    const url = new URL(request.url);
    const canonicalPath = stripBasePath(url.pathname, context.basePath);

    // Route check endpoint
    if (url.pathname === routeCheckPath(context.basePath)) {
      return await handleRouteCheck(request, url, context);
    }

    // Image endpoint — return 404 for now (pre-generated variants are served statically)
    if (canonicalPath === '/_zenith/image') {
      return new Response('Image endpoint not available', { status: 404 });
    }

    if (canonicalPath === null) {
      return new Response('404 Not Found', {
        status: 404,
        headers: { 'Content-Type': 'text/plain; charset=utf-8' },
      });
    }

    const canonicalUrl = new URL(url.toString());
    canonicalUrl.pathname = canonicalPath;

    // Try resource routes
    const resourceResponse = await handleResourceRoute(request, url, canonicalUrl, context);
    if (resourceResponse) return resourceResponse;

    // Try page routes (with SSR data injection)
    const pageResponse = await handlePageRoute(request, url, canonicalUrl, context);
    if (pageResponse) return pageResponse;

    // Fallback: 404
    return new Response('404 Not Found', {
      status: 404,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    });
  } catch (error) {
    console.error('[Zenith Vercel] handler error:', error.message);
    return new Response(defaultRouteDenyMessage(500), {
      status: 500,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    });
  }
}
