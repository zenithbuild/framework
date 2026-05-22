import { validateServerExports } from './export-validation.js';
import { unwrapAuthControlFlow } from './auth-control-flow.js';
import { assertJsonSerializable } from './json-serializable.js';
import { assertValidRouteResultShape, isRouteResultLike } from './route-result-validation.js';
import { buildResolvedEnvelope } from './resolved-envelope.js';
import { allow, data, text } from './result-helpers.js';
import { invokeRouteStage } from './stage.js';

const GLOBAL_MIDDLEWARE_RESULT_ERROR =
    'Global middleware may only continue with next() or short-circuit with redirect() / deny() in V1.';
const GLOBAL_MIDDLEWARE_DOUBLE_NEXT_ERROR =
    'Global middleware called next() more than once.';
const GLOBAL_MIDDLEWARE_POST_NEXT_ERROR =
    'Global middleware cannot override the route result after next() in V1.';
const GLOBAL_MIDDLEWARE_ALLOWED_KINDS = new Set(['redirect', 'deny']);

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

function createEmptyRouteTrace() {
    return {
        guard: 'none',
        action: 'none',
        load: 'none'
    };
}

function createUnsupportedMiddlewareResultError() {
    return new Error(GLOBAL_MIDDLEWARE_RESULT_ERROR);
}

function buildMiddlewareShortCircuitEnvelope(result, ctx) {
    assertValidRouteResultShape(
        result,
        'global middleware return',
        GLOBAL_MIDDLEWARE_ALLOWED_KINDS
    );
    return buildResolvedEnvelope({
        result,
        trace: createEmptyRouteTrace(),
        ctx
    });
}

function normalizePreNextResult(result, ctx) {
    if (!isRouteResultLike(result) || !GLOBAL_MIDDLEWARE_ALLOWED_KINDS.has(result.kind)) {
        throw createUnsupportedMiddlewareResultError();
    }
    return buildMiddlewareShortCircuitEnvelope(result, ctx);
}

export async function runGlobalMiddlewareChain({ middlewareFn, ctx, runRoute }) {
    if (typeof middlewareFn !== 'function' || typeof runRoute !== 'function') {
        throw createUnsupportedMiddlewareResultError();
    }

    let nextCalled = false;
    let capturedEnvelope;
    const next = async () => {
        if (nextCalled) {
            throw new Error(GLOBAL_MIDDLEWARE_DOUBLE_NEXT_ERROR);
        }
        nextCalled = true;
        capturedEnvelope = await runRoute();
        return capturedEnvelope;
    };

    let middlewareResult;
    try {
        middlewareResult = await middlewareFn(ctx, next);
    } catch (error) {
        const authResult = unwrapAuthControlFlow(
            error,
            'global middleware return',
            GLOBAL_MIDDLEWARE_ALLOWED_KINDS
        );
        if (authResult) {
            return buildMiddlewareShortCircuitEnvelope(authResult, ctx);
        }
        throw error;
    }

    if (nextCalled) {
        if (middlewareResult === undefined || middlewareResult === capturedEnvelope) {
            return capturedEnvelope;
        }
        throw new Error(GLOBAL_MIDDLEWARE_POST_NEXT_ERROR);
    }

    if (middlewareResult === undefined) {
        throw createUnsupportedMiddlewareResultError();
    }
    return normalizePreNextResult(middlewareResult, ctx);
}

export async function executeMatchedRoutePipeline({
    exports,
    ctx,
    filePath,
    guardOnly = false,
    routeKind = 'page',
    globalMiddleware = null
}) {
    const runRoute = () => resolveRouteResult({
        exports,
        ctx,
        filePath,
        guardOnly,
        routeKind
    });

    if (globalMiddleware == null) {
        return runRoute();
    }
    if (typeof globalMiddleware !== 'function') {
        throw createUnsupportedMiddlewareResultError();
    }
    return runGlobalMiddlewareChain({
        middlewareFn: globalMiddleware,
        ctx,
        runRoute
    });
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
        allowedKinds: new Set(['json', 'text', 'download', 'redirect', 'deny', 'invalid', 'stream', 'sse'])
    });
    if (!isRouteResultLike(raw)) {
        throw new Error(
            `[Zenith] ${filePath}: ${exportName}(ctx) on a resource route must return json(...), text(...), download(...), redirect(...), deny(...), invalid(...), stream(...), or sse(...).`
        );
    }
    assertValidRouteResultShape(raw, `${filePath}: ${exportName}(ctx) return`, new Set(['json', 'text', 'download', 'redirect', 'deny', 'invalid', 'stream', 'sse']));
    if (raw.kind === 'json' || raw.kind === 'invalid') {
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
