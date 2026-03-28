// server-contract.js — Zenith CLI V0
// ---------------------------------------------------------------------------
// Shared validation and payload resolution logic for <script server> blocks.

const NEW_KEYS = new Set(['data', 'load', 'guard', 'action', 'prerender']);
const LEGACY_KEYS = new Set(['ssr_data', 'props', 'ssr', 'prerender']);
const ALLOWED_KEYS = new Set(['data', 'load', 'guard', 'action', 'prerender', 'ssr_data', 'props', 'ssr']);

const ROUTE_RESULT_KINDS = new Set(['allow', 'redirect', 'deny', 'data', 'invalid']);

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

export function validateServerExports({ exports, filePath }) {
    const exportKeys = Object.keys(exports);
    const illegalKeys = exportKeys.filter(k => !ALLOWED_KEYS.has(k));

    if (illegalKeys.length > 0) {
        throw new Error(`[Zenith] ${filePath}: illegal export(s): ${illegalKeys.join(', ')}`);
    }

    const hasData = 'data' in exports;
    const hasLoad = 'load' in exports;
    const hasGuard = 'guard' in exports;
    const hasAction = 'action' in exports;

    const hasNew = hasData || hasLoad || hasAction;
    const hasLegacy = ('ssr_data' in exports) || ('props' in exports) || ('ssr' in exports);

    if (hasData && hasLoad) {
        throw new Error(`[Zenith] ${filePath}: cannot export both "data" and "load". Choose one.`);
    }

    if (hasNew && hasLegacy) {
        throw new Error(
            `[Zenith] ${filePath}: cannot mix new ("data"/"load") with legacy ("ssr_data"/"props"/"ssr") exports.`
        );
    }

    if ('prerender' in exports && typeof exports.prerender !== 'boolean') {
        throw new Error(`[Zenith] ${filePath}: "prerender" must be a boolean.`);
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

export async function resolveRouteResult({ exports, ctx, filePath, guardOnly = false }) {
    validateServerExports({ exports, filePath });

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
        const guardRaw = await exports.guard(ctx);
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
            return { result: guardResult, trace };
        }
    }

    if (guardOnly) {
        return { result: allow(), trace };
    }

    if (isActionRequest && 'action' in exports) {
        const actionRaw = await exports.action(ctx);
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
            return { result: actionResult, trace };
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
        const loadRaw = await exports.load(ctx);
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
        return { result: loadResult, trace, status: loadResult.kind === 'data' ? responseStatus : undefined };
    }
    if ('data' in exports) {
        payload = exports.data;
        assertJsonSerializable(payload, `${filePath}: data export`);
        trace.load = 'data';
        return { result: data(payload), trace, status: responseStatus };
    }

    // legacy fallback
    if ('ssr_data' in exports) {
        payload = exports.ssr_data;
        assertJsonSerializable(payload, `${filePath}: ssr_data export`);
        trace.load = 'data';
        return { result: data(payload), trace, status: responseStatus };
    }
    if ('props' in exports) {
        payload = exports.props;
        assertJsonSerializable(payload, `${filePath}: props export`);
        trace.load = 'data';
        return { result: data(payload), trace, status: responseStatus };
    }
    if ('ssr' in exports) {
        payload = exports.ssr;
        assertJsonSerializable(payload, `${filePath}: ssr export`);
        trace.load = 'data';
        return { result: data(payload), trace, status: responseStatus };
    }

    if (isActionRequest && ctx?.action) {
        trace.load = 'data';
        return {
            result: data({ action: ctx.action }),
            trace,
            status: responseStatus
        };
    }

    return { result: data({}), trace, status: responseStatus };
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
