import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { attachRouteAuth } from '../auth/route-auth.js';
import { appLocalRedirectLocation, normalizeBasePath, prependBasePath } from '../base-path.js';
import { createImageRuntimePayload, injectImageRuntimePayload } from '../images/payload.js';
import { materializeImageMarkup } from '../images/materialize.js';
import { buildResourceResponseDescriptor } from '../resource-response.js';
import { clientFacingRouteMessage, defaultRouteDenyMessage, logServerException } from '../server-error.js';
import { allow, data, deny, download, invalid, json, redirect, text } from '../server-contract.js';
import { executeMatchedRoutePipeline } from '../server-contract/resolve.js';

const MODULE_CACHE = new Map();
const GLOBAL_MIDDLEWARE_MODULE_CACHE = new Map();
const INTERNAL_QUERY_PREFIX = '__zenith_param_';

function parseCookies(rawCookieHeader) {
    const out = Object.create(null);
    const raw = String(rawCookieHeader || '');
    if (!raw) {
        return out;
    }
    const pairs = raw.split(';');
    for (const part of pairs) {
        const eq = part.indexOf('=');
        if (eq <= 0) {
            continue;
        }
        const key = part.slice(0, eq).trim();
        if (!key) {
            continue;
        }
        const value = part.slice(eq + 1).trim();
        try {
            out[key] = decodeURIComponent(value);
        } catch {
            out[key] = value;
        }
    }
    return out;
}

function escapeInlineJson(payload) {
    return JSON.stringify(payload)
        .replace(/</g, '\\u003C')
        .replace(/>/g, '\\u003E')
        .replace(/\//g, '\\u002F')
        .replace(/\u2028/g, '\\u2028')
        .replace(/\u2029/g, '\\u2029');
}

function appendSetCookieHeaders(headers, setCookies = []) {
    for (const value of Array.isArray(setCookies) ? setCookies : []) {
        headers.append('Set-Cookie', value);
    }
    return headers;
}

function createTextResponse(status, message, setCookies = []) {
    const headers = new Headers({
        'Content-Type': 'text/plain; charset=utf-8'
    });
    appendSetCookieHeaders(headers, setCookies);
    return new Response(message || defaultRouteDenyMessage(status), {
        status,
        headers
    });
}

function createResourceResponse(result, basePath, setCookies = []) {
    const descriptor = buildResourceResponseDescriptor(result, basePath, setCookies);
    const headers = new Headers(descriptor.headers);
    appendSetCookieHeaders(headers, descriptor.setCookies);
    return new Response(descriptor.body, {
        status: descriptor.status,
        headers
    });
}

function injectSsrPayload(html, payload) {
    const serialized = escapeInlineJson(payload);
    const scriptTag = `<script id="zenith-ssr-data">window.__zenith_ssr_data = ${serialized};</script>`;
    const existingTagRe = /<script\b[^>]*\bid=(["'])zenith-ssr-data\1[^>]*>[\s\S]*?<\/script>/i;

    if (existingTagRe.test(html)) {
        return html.replace(existingTagRe, scriptTag);
    }
    if (/<\/head>/i.test(html)) {
        return html.replace(/<\/head>/i, `${scriptTag}</head>`);
    }
    const bodyOpen = html.match(/<body\b[^>]*>/i);
    if (bodyOpen) {
        return html.replace(bodyOpen[0], `${bodyOpen[0]}${scriptTag}`);
    }
    return `${scriptTag}${html}`;
}

function splitRoutePath(routePath) {
    return String(routePath || '').split('/').filter(Boolean);
}

export function buildPublicPath(routePath, params = {}, basePath = '/') {
    const segments = splitRoutePath(routePath);
    if (segments.length === 0) {
        return prependBasePath(basePath, '/');
    }

    const materialized = [];
    for (const segment of segments) {
        if (segment.startsWith(':')) {
            const value = String(params[segment.slice(1)] || '');
            materialized.push(value);
            continue;
        }
        if (segment.startsWith('*')) {
            const optional = segment.endsWith('?');
            const key = optional ? segment.slice(1, -1) : segment.slice(1);
            const value = String(params[key] || '').trim();
            if (!value) {
                continue;
            }
            materialized.push(...value.split('/').filter(Boolean));
            continue;
        }
        materialized.push(segment);
    }
    return prependBasePath(basePath, `/${materialized.join('/')}`);
}

export function extractInternalParams(requestUrl, route) {
    const url = requestUrl instanceof URL ? requestUrl : new URL(String(requestUrl));
    const params = {};
    for (const key of route.params || []) {
        const queryKey = `${INTERNAL_QUERY_PREFIX}${key}`;
        if (url.searchParams.has(queryKey)) {
            params[key] = url.searchParams.get(queryKey) || '';
        }
    }
    return params;
}

function buildPublicUrl(requestUrl, route, params) {
    const incoming = requestUrl instanceof URL ? requestUrl : new URL(String(requestUrl));
    const publicUrl = new URL(incoming.toString());
    publicUrl.pathname = buildPublicPath(route.path, params, normalizeBasePath(route.base_path || '/'));

    const filtered = new URLSearchParams();
    for (const [key, value] of incoming.searchParams.entries()) {
        if (key.startsWith(INTERNAL_QUERY_PREFIX)) {
            continue;
        }
        filtered.append(key, value);
    }
    publicUrl.search = filtered.toString();
    return publicUrl;
}

async function loadImageManifest(imageManifestPath) {
    if (!imageManifestPath) {
        return {};
    }
    try {
        return JSON.parse(await readFile(imageManifestPath, 'utf8'));
    } catch {
        return {};
    }
}

async function loadRouteExports(routeModulePath) {
    const cacheKey = pathToFileURL(routeModulePath).href;
    if (MODULE_CACHE.has(cacheKey)) {
        return MODULE_CACHE.get(cacheKey);
    }
    const mod = await import(cacheKey);
    const value = mod && typeof mod === 'object' ? mod : {};
    MODULE_CACHE.set(cacheKey, value);
    return value;
}

async function loadGlobalMiddleware(globalMiddlewareModulePath) {
    if (!globalMiddlewareModulePath) {
        return null;
    }
    const cacheKey = globalMiddlewareModulePath;
    if (GLOBAL_MIDDLEWARE_MODULE_CACHE.has(cacheKey)) {
        return GLOBAL_MIDDLEWARE_MODULE_CACHE.get(cacheKey);
    }
    const mod = await import(pathToFileURL(globalMiddlewareModulePath).href);
    const middlewareFn = mod?.default;
    if (typeof middlewareFn !== 'function') {
        throw new Error('[Zenith:Middleware] Compiled global middleware module must default export a function.');
    }
    GLOBAL_MIDDLEWARE_MODULE_CACHE.set(cacheKey, middlewareFn);
    return middlewareFn;
}

function createRouteContext({ request, route, params, publicUrl, guardOnly = false }) {
    const requestHeaders = Object.fromEntries(request.headers.entries());
    const ctx = {
        params: { ...params },
        url: publicUrl,
        headers: { ...requestHeaders },
        cookies: parseCookies(request.headers.get('cookie') || ''),
        request,
        method: request.method,
        route: {
            id: route.route_id || route.path,
            pattern: route.path,
            file: route.file || route.server_script_path || route.route_id || route.path
        },
        env: {},
        action: null,
        allow,
        redirect,
        deny,
        invalid,
        data,
        json,
        text,
        download
    };
    attachRouteAuth(ctx, {
        requestUrl: publicUrl,
        guardOnly,
        redirect,
        deny
    });
    return ctx;
}

/**
 * @param {{
 *   request: Request,
 *   route: { path: string, params?: string[], route_id?: string | null, server_script_path?: string | null, file?: string | null },
 *   params: Record<string, string>,
 *   routeModulePath: string,
 *   globalMiddlewareModulePath?: string | null,
 *   guardOnly?: boolean
 * }} options
 * @returns {Promise<{ publicUrl: URL, result: { kind: string, [key: string]: unknown }, trace: { guard: string, action: string, load: string }, status?: number, setCookies?: string[] }>}
 */
export async function executeRouteRequest(options) {
    const {
        request,
        route,
        params,
        routeModulePath,
        globalMiddlewareModulePath = null,
        guardOnly = false
    } = options;

    const publicUrl = buildPublicUrl(request.url, route, params);
    const ctx = createRouteContext({ request, route, params, publicUrl, guardOnly });
    const exports = await loadRouteExports(routeModulePath);
    const globalMiddleware = await loadGlobalMiddleware(globalMiddlewareModulePath);
    const resolved = await executeMatchedRoutePipeline({
        exports,
        ctx,
        filePath: route.file || route.server_script_path || route.path,
        guardOnly,
        routeKind: route.route_kind === 'resource' ? 'resource' : 'page',
        globalMiddleware
    });

    return {
        publicUrl,
        result: resolved.result,
        trace: resolved.trace,
        status: resolved.status,
        setCookies: Array.isArray(resolved.setCookies) ? resolved.setCookies : []
    };
}

/**
 * @param {{
 *   request: Request,
 *   route: { path: string, params?: string[], route_id?: string | null, server_script_path?: string | null, file?: string | null },
 *   params: Record<string, string>,
 *   routeModulePath: string,
 *   globalMiddlewareModulePath?: string | null,
 *   shellHtmlPath: string,
 *   imageManifestPath?: string | null,
 *   imageConfig?: Record<string, unknown>
 * }} options
 * @returns {Promise<Response>}
 */
export async function renderRouteRequest(options) {
    const {
        request,
        route,
        params,
        routeModulePath,
        globalMiddlewareModulePath = null,
        shellHtmlPath,
        imageManifestPath = null,
        imageConfig = {}
    } = options;

    try {
        const {
            publicUrl,
            result,
            status,
            setCookies = []
        } = await executeRouteRequest({
            request,
            route,
            params,
            routeModulePath,
            globalMiddlewareModulePath
        });

        if (result.kind === 'redirect') {
            const headers = new Headers({
                Location: appLocalRedirectLocation(result.location, route.base_path || '/'),
                'Cache-Control': 'no-store'
            });
            appendSetCookieHeaders(headers, setCookies);
            return new Response('', {
                status: Number.isInteger(result.status) ? result.status : 302,
                headers
            });
        }

        if (result.kind === 'deny') {
            const status = Number.isInteger(result.status) ? result.status : 403;
            return createTextResponse(status, clientFacingRouteMessage(status, result.message), setCookies);
        }

        const ssrPayload = result.kind === 'data' && result.data && typeof result.data === 'object' && !Array.isArray(result.data)
            ? result.data
            : {};

        const localImages = await loadImageManifest(imageManifestPath);
        const imagePayload = createImageRuntimePayload(
            imageConfig,
            localImages,
            'passthrough',
            route.base_path || '/'
        );

        let html = await readFile(shellHtmlPath, 'utf8');
        html = await materializeImageMarkup({
            html,
            payload: imagePayload,
            imageMaterialization: Array.isArray(route.image_materialization)
                ? route.image_materialization
                : []
        });
        html = injectSsrPayload(html, ssrPayload);
        html = injectImageRuntimePayload(html, imagePayload);

        const headers = new Headers({
            'Content-Type': 'text/html; charset=utf-8'
        });
        appendSetCookieHeaders(headers, setCookies);
        return new Response(html, {
            status: Number.isInteger(status) ? status : 200,
            headers
        });
    } catch (error) {
        logServerException('node route render failed', error);
        return createTextResponse(500, defaultRouteDenyMessage(500));
    }
}

/**
 * @param {{
 *   request: Request,
 *   route: { path: string, params?: string[], route_id?: string | null, server_script_path?: string | null, file?: string | null, route_kind?: string | null, base_path?: string | null },
 *   params: Record<string, string>,
 *   routeModulePath: string,
 *   globalMiddlewareModulePath?: string | null
 * }} options
 * @returns {Promise<Response>}
 */
export async function renderResourceRouteRequest(options) {
    const {
        request,
        route,
        params,
        routeModulePath,
        globalMiddlewareModulePath = null
    } = options;

    try {
        const { result, setCookies = [] } = await executeRouteRequest({
            request,
            route: { ...route, route_kind: 'resource' },
            params,
            routeModulePath,
            globalMiddlewareModulePath
        });
        return createResourceResponse(result, route.base_path || '/', setCookies);
    } catch (error) {
        logServerException('node resource route render failed', error);
        return createTextResponse(500, defaultRouteDenyMessage(500));
    }
}
