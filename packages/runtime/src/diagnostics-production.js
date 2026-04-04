const MAX_MESSAGE_LENGTH = 120;
const MAX_HINT_LENGTH = 140;
const MAX_PATH_LENGTH = 120;
const MAX_DOCS_LINK_LENGTH = 180;
const MAX_SNIPPET_LENGTH = 220;
const MAX_STACK_LENGTH = 420;

const VALID_PHASES = Object.freeze(Object.assign(Object.create(null), {
    hydrate: 1,
    bind: 1,
    render: 1,
    event: 1
}));
const VALID_CODES = Object.freeze(Object.assign(Object.create(null), {
    UNRESOLVED_EXPRESSION: 1,
    NON_RENDERABLE_VALUE: 1,
    MARKER_MISSING: 1,
    FRAGMENT_MOUNT_FAILED: 1,
    BINDING_APPLY_FAILED: 1,
    EVENT_HANDLER_FAILED: 1,
    COMPONENT_BOOTSTRAP_FAILED: 1,
    UNSAFE_MEMBER_ACCESS: 1
}));

const DOCS_EXPRESSION_SCOPE = '/docs/documentation/reference/reactive-binding-model.md#expression-resolution';
const DOCS_RENDERABLE_VALUES = '/docs/documentation/reference/reactive-binding-model.md#renderable-values';
const DOCS_MARKERS = '/docs/documentation/reference/markers.md';
const DOCS_FRAGMENT_CONTRACT = '/docs/documentation/contracts/runtime-contract.md#fragment-contract';
const DOCS_BINDING_APPLICATION = '/docs/documentation/contracts/runtime-contract.md#binding-application';
const DOCS_EVENT_BINDINGS = '/docs/documentation/contracts/runtime-contract.md#event-bindings';
const DOCS_COMPONENT_BOOTSTRAP = '/docs/documentation/contracts/runtime-contract.md#component-bootstrap';

const DOCS_LINK_BY_CODE = Object.freeze({
    UNRESOLVED_EXPRESSION: DOCS_EXPRESSION_SCOPE,
    NON_RENDERABLE_VALUE: DOCS_RENDERABLE_VALUES,
    MARKER_MISSING: DOCS_MARKERS,
    FRAGMENT_MOUNT_FAILED: DOCS_FRAGMENT_CONTRACT,
    BINDING_APPLY_FAILED: DOCS_BINDING_APPLICATION,
    EVENT_HANDLER_FAILED: DOCS_EVENT_BINDINGS,
    COMPONENT_BOOTSTRAP_FAILED: DOCS_COMPONENT_BOOTSTRAP,
    UNSAFE_MEMBER_ACCESS: DOCS_EXPRESSION_SCOPE
});

const ABSOLUTE_PATH_RE = /(?:[A-Za-z]:\\[^\s"'`]+|\/(?:Users|home|private|tmp|var\/folders)\/[^\s"'`]+)/g;

function _truncate(input, maxLength) {
    const text = String(input ?? '');
    if (text.length <= maxLength) return text;
    return `${text.slice(0, maxLength - 3)}...`;
}

function _sanitizeAbsolutePaths(value) {
    return String(value ?? '').replace(ABSOLUTE_PATH_RE, '<path>');
}

function _compact(value, sanitizePaths = true) {
    const text = sanitizePaths ? _sanitizeAbsolutePaths(value) : String(value ?? '');
    return text.replace(/\s+/g, ' ').trim();
}

function _sanitizeOptionalText(value, maxLength, sanitizePaths = true) {
    if (value === null || value === undefined || value === false) {
        return undefined;
    }
    const compact = _compact(value, sanitizePaths);
    if (!compact) return undefined;
    return _truncate(compact, maxLength);
}

function _sanitizeMessage(value) {
    return _sanitizeOptionalText(value, MAX_MESSAGE_LENGTH) || 'Runtime failure';
}

const _sanitizeHint = (value) => _sanitizeOptionalText(value, MAX_HINT_LENGTH);
const _sanitizePath = (value) => _sanitizeOptionalText(value, MAX_PATH_LENGTH);
const _sanitizeDocsLink = (value) => _sanitizeOptionalText(value, MAX_DOCS_LINK_LENGTH, false);

function _sanitizeSourceLocation(value) {
    if (!value || typeof value !== 'object') return undefined;
    const line = Number(value.line);
    const column = Number(value.column);
    if (!Number.isInteger(line) || !Number.isInteger(column)) {
        return undefined;
    }
    if (line < 1 || column < 1) {
        return undefined;
    }
    return { line, column };
}

function _sanitizeSource(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        return undefined;
    }
    const file = typeof value.file === 'string' ? _truncate(value.file.trim(), 240) : '';
    if (!file) {
        return undefined;
    }
    const start = _sanitizeSourceLocation(value.start);
    const end = _sanitizeSourceLocation(value.end);
    const snippet = typeof value.snippet === 'string'
        ? _truncate(_compact(value.snippet, false), MAX_SNIPPET_LENGTH)
        : undefined;
    return {
        file,
        ...(start ? { start } : null),
        ...(end ? { end } : null),
        ...(snippet ? { snippet } : null)
    };
}

function _normalizeMarker(marker) {
    if (!marker || typeof marker !== 'object') return undefined;
    const markerType = _truncate(_compact(marker.type || 'data-zx'), 48);
    const markerId = marker.id;
    if (markerId === null || markerId === undefined || markerId === '') return undefined;
    if (typeof markerId === 'number') {
        return { type: markerType, id: markerId };
    }
    return { type: markerType, id: _truncate(_sanitizeAbsolutePaths(markerId), 48) };
}

function _extractErrorMessage(error) {
    if (!error) return '';
    if (typeof error === 'string') return error;
    if (error instanceof Error && typeof error.message === 'string') return error.message;
    if (typeof error.message === 'string') return error.message;
    return String(error);
}

function _readProcessEnv(name) {
    const runtimeProcess = typeof process !== 'undefined' ? process : globalThis?.process;
    const value = runtimeProcess?.env?.[name];
    return typeof value === 'string' ? value : undefined;
}

function _shouldLogRuntimeError() {
    if (_readProcessEnv('ZENITH_LOG_RUNTIME_ERRORS') === '1') {
        return true;
    }
    const isTestMode =
        _readProcessEnv('NODE_ENV') === 'test'
        || _readProcessEnv('ZENITH_TEST_MODE') === '1';
    return !isTestMode;
}

const _renderOverlay = () => { };

function _mapLegacyError(error, fallback) {
    const rawMessage = _extractErrorMessage(error);
    const safeMessage = _sanitizeMessage(rawMessage);

    const details = {
        phase: VALID_PHASES[fallback.phase] ? fallback.phase : 'hydrate',
        code: VALID_CODES[fallback.code] ? fallback.code : 'BINDING_APPLY_FAILED',
        message: _sanitizeMessage(fallback.message || safeMessage),
        marker: _normalizeMarker(fallback.marker),
        path: _sanitizePath(fallback.path),
        hint: _sanitizeHint(fallback.hint),
        source: _sanitizeSource(fallback.source),
        docsLink: _sanitizeDocsLink(fallback.docsLink)
    };

    if (/failed to resolve expression literal/i.test(rawMessage)) {
        details.phase = 'bind';
        details.code = 'UNRESOLVED_EXPRESSION';
        details.hint = details.hint || 'Verify expression scope keys and signal aliases.';
    } else if (/non-renderable (object|function)/i.test(rawMessage)) {
        details.phase = 'render';
        details.code = 'NON_RENDERABLE_VALUE';
        const match = rawMessage.match(/at\s+([A-Za-z0-9_\[\].-]+)/);
        if (match && !details.path) {
            details.path = _sanitizePath(match[1]);
        }
        details.hint = details.hint || 'Use map() to render object fields into nodes.';
    } else if (/unresolved .* marker index/i.test(rawMessage)) {
        details.phase = 'bind';
        details.code = 'MARKER_MISSING';
        const markerMatch = rawMessage.match(/unresolved\s+(\w+)\s+marker index\s+(\d+)/i);
        if (markerMatch && !details.marker) {
            details.marker = {
                type: `data-zx-${markerMatch[1]}`,
                id: Number(markerMatch[2])
            };
        }
        details.hint = details.hint || 'Confirm SSR markers and client selector tables match.';
    }

    if (!details.docsLink) {
        details.docsLink = DOCS_LINK_BY_CODE[details.code];
    }

    return details;
}

export function isZenithRuntimeError(error) {
    return !!(
        error &&
        typeof error === 'object' &&
        error.zenithRuntimeError &&
        error.zenithRuntimeError.kind === 'ZENITH_RUNTIME_ERROR'
    );
}

export function createZenithRuntimeError(details, cause) {
    const phase = VALID_PHASES[details?.phase] ? details.phase : 'hydrate';
    const code = VALID_CODES[details?.code] ? details.code : 'BINDING_APPLY_FAILED';
    const message = _sanitizeMessage(details?.message || 'Runtime failure');
    const docsLink = _sanitizeDocsLink(details?.docsLink || DOCS_LINK_BY_CODE[code]);

    const payload = {
        kind: 'ZENITH_RUNTIME_ERROR',
        phase,
        code,
        message,
        ...(docsLink ? { docsLink } : null)
    };

    const marker = _normalizeMarker(details?.marker);
    if (marker) payload.marker = marker;

    const path = _sanitizePath(details?.path);
    if (path) payload.path = path;

    const hint = _sanitizeHint(details?.hint);
    if (hint) payload.hint = hint;

    const source = _sanitizeSource(details?.source);
    if (source) payload.source = source;

    const stack = _sanitizeHint(details?.stack);
    if (stack) {
        payload.stack = _truncate(stack, MAX_STACK_LENGTH);
    }

    const error = new Error(`[Zenith Runtime] ${code}: ${message}`);
    error.name = 'ZenithRuntimeError';
    error.zenithRuntimeError = payload;
    if (cause !== undefined) {
        error.cause = cause;
    }
    error.toJSON = () => payload;
    return error;
}

function _reportRuntimeError(error) {
    if (!error || error.__zenithRuntimeErrorReported === true) return;
    error.__zenithRuntimeErrorReported = true;
    const payload = error.zenithRuntimeError;
    if (
        payload
        && _shouldLogRuntimeError()
        && typeof console !== 'undefined'
        && typeof console.error === 'function'
    ) {
        console.error('[Zenith Runtime]', payload);
    }
    _renderOverlay(payload);
}

export function throwZenithRuntimeError(details, cause) {
    const error = createZenithRuntimeError(details, cause);
    _reportRuntimeError(error);
    throw error;
}

export function rethrowZenithRuntimeError(error, fallback = {}) {
    if (isZenithRuntimeError(error)) {
        const payload = error.zenithRuntimeError || {};
        let updatedPayload = payload;
        const marker = payload.marker || _normalizeMarker(fallback.marker);
        const path = payload.path || _sanitizePath(fallback.path);
        const hint = payload.hint || _sanitizeHint(fallback.hint);
        const source = payload.source || _sanitizeSource(fallback.source);
        const docsLink = payload.docsLink || _sanitizeDocsLink(fallback.docsLink || DOCS_LINK_BY_CODE[payload.code]);

        if (marker || path || hint || source || docsLink) {
            updatedPayload = {
                ...payload,
                ...(marker ? { marker } : null),
                ...(path ? { path } : null),
                ...(hint ? { hint } : null),
                ...(source ? { source } : null),
                ...(docsLink ? { docsLink } : null)
            };
            error.zenithRuntimeError = updatedPayload;
            error.toJSON = () => updatedPayload;
        }
        _reportRuntimeError(error);
        throw error;
    }
    const mapped = _mapLegacyError(error, fallback || {});
    const wrapped = createZenithRuntimeError(mapped, error);
    _reportRuntimeError(wrapped);
    throw wrapped;
}

export const DOCS_LINKS = Object.freeze({
    eventBinding: DOCS_EVENT_BINDINGS,
    expressionScope: DOCS_EXPRESSION_SCOPE,
    markerTable: DOCS_MARKERS,
    componentBootstrap: DOCS_COMPONENT_BOOTSTRAP,
    refs: '/docs/documentation/reference/reactive-binding-model.md#refs-and-mount'
});
