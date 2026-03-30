// server-contract.js — Zenith CLI V0
// ---------------------------------------------------------------------------
// Shared validation and payload resolution logic for <script server> blocks.

import { assertValidDownloadResult, createDownloadResult } from './download-result.js';

const ALLOWED_KEYS = new Set(['data', 'load', 'guard', 'action', 'prerender', 'exportPaths', 'ssr_data', 'props', 'ssr']);
const RESOURCE_ALLOWED_KEYS = new Set(['load', 'guard', 'action']);
const ROUTE_RESULT_KINDS = new Set(['allow', 'redirect', 'deny', 'data', 'invalid', 'json', 'text', 'download']);
const AUTH_CONTROL_FLOW_FLAG = '__zenith_auth_control_flow';
const STAGED_SET_COOKIES_KEY = '__zenith_staged_set_cookies';

export function allow() {
    return { kind: 'allow' };
}

export function redirect(location, status = 302) {
    return {
        kind: 'redirect',
        location: String(location || ''),
        status: Number.isInteger(status) ? status : 302
    };
}

export function deny(status = 403, message = undefined) {
    return {
        kind: 'deny',
        status: Number.isInteger(status) ? status : 403,
        message: typeof message === 'string' ? message : undefined
    };
}

export function data(payload) {
    return { kind: 'data', data: payload };
}

export function invalid(payload, status = 400) {
    return {
        kind: 'invalid',
        data: payload,
        status: Number.isInteger(status) ? status : 400
    };
}

export function json(payload, status = 200) {
    return {
        kind: 'json',
        data: payload,
        status: Number.isInteger(status) ? status : 200
    };
}

export function text(body, status = 200) {
    return {
        kind: 'text',
        body: typeof body === 'string' ? body : String(body ?? ''),
        status: Number.isInteger(status) ? status : 200
    };
}

export function download(body, options = {}) {
    return createDownloadResult(body, options);
}

function isRouteResultLike(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        return false;
    }
    const kind = value.kind;
    return typeof kind === 'string' && ROUTE_RESULT_KINDS.has(kind);
}

function assertValidRouteResultShape(value, where, allowedKinds) {
    if (!isRouteResultLike(value)) {
        throw new Error(`[Zenith] ${where}: invalid route result. Expected object with kind.`);
    }
    const kind = value.kind;
    if (!allowedKinds.has(kind)) {
        throw new Error(
            `[Zenith] ${where}: kind "${kind}" is not allowed here (allowed: ${Array.from(allowedKinds).join(', ')}).`
        );
    }

    if (kind === 'redirect') {
        if (typeof value.location !== 'string' || value.location.length === 0) {
            throw new Error(`[Zenith] ${where}: redirect requires non-empty string location.`);
        }
        if (value.status !== undefined && (!Number.isInteger(value.status) || value.status < 300 || value.status > 399)) {
            throw new Error(`[Zenith] ${where}: redirect status must be an integer 3xx.`);
        }
    }

    if (kind === 'deny') {
        if (
            !Number.isInteger(value.status) ||
            (value.status !== 401 && value.status !== 403 && value.status !== 404)
        ) {
            throw new Error(`[Zenith] ${where}: deny status must be 401, 403, or 404.`);
        }
        if (value.message !== undefined && typeof value.message !== 'string') {
            throw new Error(`[Zenith] ${where}: deny message must be a string when provided.`);
        }
    }

    if (kind === 'invalid') {
        if (!Number.isInteger(value.status) || (value.status !== 400 && value.status !== 422)) {
            throw new Error(`[Zenith] ${where}: invalid status must be 400 or 422.`);
        }
    }

    if (kind === 'json' || kind === 'text') {
        if (!Number.isInteger(value.status) || value.status < 200 || value.status > 599 || (value.status >= 300 && value.status <= 399)) {
            throw new Error(`[Zenith] ${where}: ${kind} status must be an integer between 200-599 and may not be 3xx.`);
        }
        if (kind === 'text' && typeof value.body !== 'string') {
            throw new Error(`[Zenith] ${where}: text body must be a string.`);
        }
    }

    if (kind === 'download') {
        assertValidDownloadResult(value, where);
    }
}

function assertOneArgRouteFunction({ filePath, exportName, value }) {
    if (typeof value !== 'function') {
        throw new Error(`[Zenith] ${filePath}: "${exportName}" must be a function.`);
    }
    if (value.length !== 1) {
        throw new Error(`[Zenith] ${filePath}: "${exportName}(ctx)" must take exactly 1 argument.`);
    }
    const fnStr = value.toString();
    const paramsMatch = fnStr.match(/^[^{=]+\(([^)]*)\)/);
    if (paramsMatch && paramsMatch[1].includes('...')) {
        throw new Error(`[Zenith] ${filePath}: "${exportName}(ctx)" must not contain rest parameters.`);
    }
}

function buildActionState(result) {
    if (!result || typeof result !== 'object') {
        return null;
    }
    if (result.kind === 'data') {
        return {
            ok: true,
            status: 200,
            data: result.data
        };
    }
    if (result.kind === 'invalid') {
        return {
            ok: false,
            status: Number.isInteger(result.status) ? result.status : 400,
            data: result.data
        };
    }
    return null;
}

function unwrapAuthControlFlow(error, where, allowedKinds) {
    if (!error || typeof error !== 'object' || error[AUTH_CONTROL_FLOW_FLAG] !== true) {
        return null;
    }
    const result = error.result;
    assertValidRouteResultShape(result, where, allowedKinds);
    return result;
}

async function invokeRouteStage({ fn, ctx, where, allowedKinds }) {
    try {
        return await fn(ctx);
    } catch (error) {
        const authResult = unwrapAuthControlFlow(error, where, allowedKinds);
        if (authResult) {
            return authResult;
        }
        throw error;
    }
}

function buildResolvedEnvelope({ result, trace, status, ctx }) {
    const envelope = { result, trace };
    if (status !== undefined) {
        envelope.status = status;
    }
    const setCookies = Array.isArray(ctx?.[STAGED_SET_COOKIES_KEY])
        ? ctx[STAGED_SET_COOKIES_KEY].slice()
        : [];
    if (setCookies.length > 0) {
        envelope.setCookies = setCookies;
    }
    return envelope;
}

export function validateServerExports({ exports, filePath, routeKind = 'page' }) {
    const exportKeys = Object.keys(exports);
    const allowedKeys = routeKind === 'resource' ? RESOURCE_ALLOWED_KEYS : ALLOWED_KEYS;
    const illegalKeys = exportKeys.filter(k => !allowedKeys.has(k));

    if (illegalKeys.length > 0) {
        throw new Error(`[Zenith] ${filePath}: illegal export(s): ${illegalKeys.join(', ')}`);
    }

    const hasData = 'data' in exports;
    const hasLoad = 'load' in exports;
    const hasGuard = 'guard' in exports;
    const hasAction = 'action' in exports;

    const hasNew = hasData || hasLoad || hasAction;
    const hasLegacy = ('ssr_data' in exports) || ('props' in exports) || ('ssr' in exports);

    if (routeKind === 'resource') {
        if (hasData) {
            throw new Error(`[Zenith] ${filePath}: resource routes may not export "data". Use load(ctx) or action(ctx) with ctx.json()/ctx.text().`);
        }
        if (!hasLoad && !hasAction) {
            throw new Error(`[Zenith] ${filePath}: resource routes must export load(ctx), action(ctx), or both.`);
        }
    }

    if (hasData && hasLoad) {
        throw new Error(`[Zenith] ${filePath}: cannot export both "data" and "load". Choose one.`);
    }

    if (routeKind === 'page' && hasNew && hasLegacy) {
        throw new Error(
            `[Zenith] ${filePath}: cannot mix new ("data"/"load") with legacy ("ssr_data"/"props"/"ssr") exports.`
        );
    }

    if (routeKind === 'page' && 'prerender' in exports && typeof exports.prerender !== 'boolean') {
        throw new Error(`[Zenith] ${filePath}: "prerender" must be a boolean.`);
    }
    if (routeKind === 'page' && 'exportPaths' in exports) {
        if (!Array.isArray(exports.exportPaths) || exports.exportPaths.some((value) => typeof value !== 'string')) {
            throw new Error(`[Zenith] ${filePath}: "exportPaths" must be an array of string pathnames.`);
        }
    }

    if (hasLoad) {
        assertOneArgRouteFunction({ filePath, exportName: 'load', value: exports.load });
    }

    if (hasGuard) {
        assertOneArgRouteFunction({ filePath, exportName: 'guard', value: exports.guard });
    }

    if (hasAction) {
        assertOneArgRouteFunction({ filePath, exportName: 'action', value: exports.action });
    }
}

export function assertJsonSerializable(value, where = 'payload') {
    const seen = new Set();

    function walk(v, path) {
        const t = typeof v;

        if (v === null) return;
        if (t === 'string' || t === 'number' || t === 'boolean') return;

        if (t === 'bigint' || t === 'function' || t === 'symbol') {
            throw new Error(`[Zenith] ${where}: non-serializable ${t} at ${path}`);
        }

        if (t === 'undefined') {
            throw new Error(`[Zenith] ${where}: undefined is not allowed at ${path}`);
        }

        if (v instanceof Date) {
            throw new Error(`[Zenith] ${where}: Date is not allowed at ${path} (convert to ISO string)`);
        }

        if (v instanceof Map || v instanceof Set) {
            throw new Error(`[Zenith] ${where}: Map/Set not allowed at ${path}`);
        }

        if (t === 'object') {
            if (seen.has(v)) throw new Error(`[Zenith] ${where}: circular reference at ${path}`);
            seen.add(v);

            if (Array.isArray(v)) {
                if (path === '$') {
                    throw new Error(`[Zenith] ${where}: top-level payload must be a plain object, not an array at ${path}`);
                }
                for (let i = 0; i < v.length; i++) walk(v[i], `${path}[${i}]`);
                return;
            }

            const proto = Object.getPrototypeOf(v);
            const isPlainObject = proto === null ||
                proto === Object.prototype ||
                (proto && proto.constructor && proto.constructor.name === 'Object');

            if (!isPlainObject) {
                throw new Error(`[Zenith] ${where}: non-plain object at ${path}`);
            }

            for (const k of Object.keys(v)) {
                if (k === '__proto__' || k === 'constructor' || k === 'prototype') {
                    throw new Error(`[Zenith] ${where}: forbidden prototype pollution key "${k}" at ${path}.${k}`);
                }
                walk(v[k], `${path}.${k}`);
            }
            return;
        }

        throw new Error(`[Zenith] ${where}: unsupported type at ${path}`);
    }

    walk(value, '$');
}

export async function resolveRouteResult({ exports, ctx, filePath, guardOnly = false, routeKind = 'page' }) {
    validateServerExports({ exports, filePath, routeKind });

    if (routeKind === 'resource') {
        return resolveResourceRouteResult({ exports, ctx, filePath, guardOnly });
    }

    const trace = {
        guard: 'none',
        action: 'none',
        load: 'none'
    };
    let responseStatus = 200;
    const requestMethod = String(ctx?.method || ctx?.request?.method || 'GET').toUpperCase();
    const isActionRequest = !guardOnly && requestMethod === 'POST';
    if (ctx && typeof ctx === 'object') {
        ctx.action = null;
    }

    if ('guard' in exports) {
        const guardRaw = await invokeRouteStage({
            fn: exports.guard,
            ctx,
            where: `${filePath}: guard(ctx)`,
            allowedKinds: new Set(['allow', 'redirect', 'deny'])
        });
        const guardResult = guardRaw == null ? allow() : guardRaw;
        if (guardResult.kind === 'data') {
            throw new Error(`[Zenith] ${filePath}: guard(ctx) returned data(payload) which is a critical invariant violation. guard() can only return allow(), redirect(), or deny(). Use load(ctx) for data injection.`);
        }
        assertValidRouteResultShape(
            guardResult,
            `${filePath}: guard(ctx) return`,
            new Set(['allow', 'redirect', 'deny'])
        );
        trace.guard = guardResult.kind;
        if (guardResult.kind === 'redirect' || guardResult.kind === 'deny') {
            return buildResolvedEnvelope({ result: guardResult, trace, ctx });
        }
    }

    if (guardOnly) {
        return buildResolvedEnvelope({ result: allow(), trace, ctx });
    }

    if (isActionRequest && 'action' in exports) {
        const actionRaw = await invokeRouteStage({
            fn: exports.action,
            ctx,
            where: `${filePath}: action(ctx)`,
            allowedKinds: new Set(['data', 'invalid', 'redirect', 'deny'])
        });
        let actionResult = null;
        if (isRouteResultLike(actionRaw)) {
            actionResult = actionRaw;
            assertValidRouteResultShape(
                actionResult,
                `${filePath}: action(ctx) return`,
                new Set(['data', 'invalid', 'redirect', 'deny'])
            );
            if (actionResult.kind === 'data' || actionResult.kind === 'invalid') {
                assertJsonSerializable(actionResult.data, `${filePath}: action(ctx) return`);
            }
        } else {
            assertJsonSerializable(actionRaw, `${filePath}: action(ctx) return`);
            actionResult = data(actionRaw);
        }
        trace.action = actionResult.kind;
        if (actionResult.kind === 'redirect' || actionResult.kind === 'deny') {
            return buildResolvedEnvelope({ result: actionResult, trace, ctx });
        }
        const actionState = buildActionState(actionResult);
        if (ctx && typeof ctx === 'object') {
            ctx.action = actionState;
        }
        if (actionState && actionState.ok === false) {
            responseStatus = actionState.status;
        }
    }

    let payload;
    if ('load' in exports) {
        const loadRaw = await invokeRouteStage({
            fn: exports.load,
            ctx,
            where: `${filePath}: load(ctx)`,
            allowedKinds: new Set(['data', 'redirect', 'deny'])
        });
        let loadResult = null;
        if (isRouteResultLike(loadRaw)) {
            loadResult = loadRaw;
            assertValidRouteResultShape(
                loadResult,
                `${filePath}: load(ctx) return`,
                new Set(['data', 'redirect', 'deny'])
            );
        } else {
            assertJsonSerializable(loadRaw, `${filePath}: load(ctx) return`);
            loadResult = data(loadRaw);
        }
        trace.load = loadResult.kind;
        return buildResolvedEnvelope({
            result: loadResult,
            trace,
            status: loadResult.kind === 'data' ? responseStatus : undefined,
            ctx
        });
    }
    if ('data' in exports) {
        payload = exports.data;
        assertJsonSerializable(payload, `${filePath}: data export`);
        trace.load = 'data';
        return buildResolvedEnvelope({ result: data(payload), trace, status: responseStatus, ctx });
    }

    // legacy fallback
    if ('ssr_data' in exports) {
        payload = exports.ssr_data;
        assertJsonSerializable(payload, `${filePath}: ssr_data export`);
        trace.load = 'data';
        return buildResolvedEnvelope({ result: data(payload), trace, status: responseStatus, ctx });
    }
    if ('props' in exports) {
        payload = exports.props;
        assertJsonSerializable(payload, `${filePath}: props export`);
        trace.load = 'data';
        return buildResolvedEnvelope({ result: data(payload), trace, status: responseStatus, ctx });
    }
    if ('ssr' in exports) {
        payload = exports.ssr;
        assertJsonSerializable(payload, `${filePath}: ssr export`);
        trace.load = 'data';
        return buildResolvedEnvelope({ result: data(payload), trace, status: responseStatus, ctx });
    }

    if (isActionRequest && ctx?.action) {
        trace.load = 'data';
        return buildResolvedEnvelope({
            result: data({ action: ctx.action }),
            trace,
            status: responseStatus,
            ctx
        });
    }

    return buildResolvedEnvelope({ result: data({}), trace, status: responseStatus, ctx });
}

async function resolveResourceRouteResult({ exports, ctx, filePath, guardOnly = false }) {
    const trace = {
        guard: 'none',
        action: 'none',
        load: 'none'
    };
    const requestMethod = String(ctx?.method || ctx?.request?.method || 'GET').toUpperCase();
    if (ctx && typeof ctx === 'object') {
        ctx.action = null;
    }

    if ('guard' in exports) {
        const guardRaw = await invokeRouteStage({
            fn: exports.guard,
            ctx,
            where: `${filePath}: guard(ctx)`,
            allowedKinds: new Set(['allow', 'redirect', 'deny'])
        });
        const guardResult = guardRaw == null ? allow() : guardRaw;
        assertValidRouteResultShape(guardResult, `${filePath}: guard(ctx) return`, new Set(['allow', 'redirect', 'deny']));
        trace.guard = guardResult.kind;
        if (guardResult.kind === 'redirect' || guardResult.kind === 'deny') {
            return buildResolvedEnvelope({ result: guardResult, trace, ctx });
        }
    }

    if (guardOnly) {
        return buildResolvedEnvelope({ result: allow(), trace, ctx });
    }

    if (requestMethod === 'GET' || requestMethod === 'HEAD') {
        if (!('load' in exports)) {
            trace.load = 'text';
            return buildResolvedEnvelope({ result: text('Method Not Allowed', 405), trace, status: 405, ctx });
        }
        const loadResult = await resolveResourceStage({
            exports,
            exportName: 'load',
            ctx,
            filePath,
            trace,
            traceKey: 'load'
        });
        return buildResolvedEnvelope({
            result: loadResult,
            trace,
            status: loadResult.status,
            ctx
        });
    }

    if (requestMethod === 'POST') {
        if (!('action' in exports)) {
            trace.action = 'text';
            return buildResolvedEnvelope({ result: text('Method Not Allowed', 405), trace, status: 405, ctx });
        }
        const actionResult = await resolveResourceStage({
            exports,
            exportName: 'action',
            ctx,
            filePath,
            trace,
            traceKey: 'action'
        });
        return buildResolvedEnvelope({
            result: actionResult,
            trace,
            status: actionResult.status,
            ctx
        });
    }

    return buildResolvedEnvelope({
        result: text('Method Not Allowed', 405),
        trace,
        status: 405,
        ctx
    });
}

async function resolveResourceStage({ exports, exportName, ctx, filePath, trace, traceKey }) {
    const raw = await invokeRouteStage({
        fn: exports[exportName],
        ctx,
        where: `${filePath}: ${exportName}(ctx)`,
        allowedKinds: new Set(['json', 'text', 'download', 'redirect', 'deny'])
    });
    if (!isRouteResultLike(raw)) {
        throw new Error(
            `[Zenith] ${filePath}: ${exportName}(ctx) on a resource route must return json(...), text(...), download(...), redirect(...), or deny(...).`
        );
    }
    assertValidRouteResultShape(raw, `${filePath}: ${exportName}(ctx) return`, new Set(['json', 'text', 'download', 'redirect', 'deny']));
    if (raw.kind === 'json') {
        assertJsonSerializable(raw.data, `${filePath}: ${exportName}(ctx) return`);
    }
    trace[traceKey] = raw.kind;
    return raw;
}

export async function resolveServerPayload({ exports, ctx, filePath }) {
    const resolved = await resolveRouteResult({ exports, ctx, filePath });
    if (!resolved || !resolved.result || typeof resolved.result !== 'object') {
        return {};
    }

    if (resolved.result.kind === 'data') {
        return resolved.result.data;
    }
    if (resolved.result.kind === 'allow') {
        return {};
    }

    throw new Error(
        `[Zenith] ${filePath}: resolveServerPayload() expected data but received ${resolved.result.kind}. Use resolveRouteResult() for guard/load flows.`
    );
}
