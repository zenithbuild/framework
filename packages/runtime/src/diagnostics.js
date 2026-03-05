const OVERLAY_ID = '__zenith_runtime_error_overlay';
const MAX_MESSAGE_LENGTH = 120;
const MAX_HINT_LENGTH = 140;
const MAX_PATH_LENGTH = 120;
const MAX_DOCS_LINK_LENGTH = 180;
const MAX_SNIPPET_LENGTH = 220;
const MAX_STACK_LENGTH = 420;

const VALID_PHASES = new Set(['hydrate', 'bind', 'render', 'event']);
const VALID_CODES = new Set([
    'UNRESOLVED_EXPRESSION',
    'NON_RENDERABLE_VALUE',
    'MARKER_MISSING',
    'FRAGMENT_MOUNT_FAILED',
    'BINDING_APPLY_FAILED',
    'EVENT_HANDLER_FAILED',
    'COMPONENT_BOOTSTRAP_FAILED',
    'UNSAFE_MEMBER_ACCESS'
]);

const DOCS_LINK_BY_CODE = Object.freeze({
    UNRESOLVED_EXPRESSION: '/docs/documentation/reference/reactive-binding-model.md#expression-resolution',
    NON_RENDERABLE_VALUE: '/docs/documentation/reference/reactive-binding-model.md#renderable-values',
    MARKER_MISSING: '/docs/documentation/reference/markers.md',
    FRAGMENT_MOUNT_FAILED: '/docs/documentation/contracts/runtime-contract.md#fragment-contract',
    BINDING_APPLY_FAILED: '/docs/documentation/contracts/runtime-contract.md#binding-application',
    EVENT_HANDLER_FAILED: '/docs/documentation/contracts/runtime-contract.md#event-bindings',
    COMPONENT_BOOTSTRAP_FAILED: '/docs/documentation/contracts/runtime-contract.md#component-bootstrap',
    UNSAFE_MEMBER_ACCESS: '/docs/documentation/reference/reactive-binding-model.md#expression-resolution'
});

function _truncate(input, maxLength) {
    const text = String(input ?? '');
    if (text.length <= maxLength) return text;
    return `${text.slice(0, maxLength - 3)}...`;
}

function _sanitizeAbsolutePaths(value) {
    return String(value ?? '')
        .replace(/[A-Za-z]:\\[^\s"'`]+/g, '<path>')
        .replace(/\/Users\/[^\s"'`]+/g, '<path>')
        .replace(/\/home\/[^\s"'`]+/g, '<path>')
        .replace(/\/private\/[^\s"'`]+/g, '<path>')
        .replace(/\/tmp\/[^\s"'`]+/g, '<path>')
        .replace(/\/var\/folders\/[^\s"'`]+/g, '<path>');
}

function _sanitizeMessage(value) {
    const compact = _sanitizeAbsolutePaths(value).replace(/\s+/g, ' ').trim();
    return _truncate(compact || 'Runtime failure', MAX_MESSAGE_LENGTH);
}

function _sanitizeHint(value) {
    if (value === null || value === undefined || value === false) {
        return undefined;
    }
    const compact = _sanitizeAbsolutePaths(value).replace(/\s+/g, ' ').trim();
    if (!compact) return undefined;
    return _truncate(compact, MAX_HINT_LENGTH);
}

function _sanitizePath(value) {
    if (value === null || value === undefined || value === false) {
        return undefined;
    }
    const compact = _sanitizeAbsolutePaths(value).replace(/\s+/g, ' ').trim();
    if (!compact) return undefined;
    return _truncate(compact, MAX_PATH_LENGTH);
}

function _sanitizeDocsLink(value) {
    if (value === null || value === undefined || value === false) {
        return undefined;
    }
    const compact = String(value).replace(/\s+/g, ' ').trim();
    if (!compact) return undefined;
    return _truncate(compact, MAX_DOCS_LINK_LENGTH);
}

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
    const fileRaw = value.file;
    const file = typeof fileRaw === 'string' ? _truncate(fileRaw.trim(), 240) : '';
    if (!file) {
        return undefined;
    }
    const start = _sanitizeSourceLocation(value.start);
    const end = _sanitizeSourceLocation(value.end);
    const snippet = typeof value.snippet === 'string'
        ? _truncate(value.snippet.replace(/\s+/g, ' ').trim(), MAX_SNIPPET_LENGTH)
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
    const markerType = _truncate(_sanitizeAbsolutePaths(marker.type || 'data-zx'), 48);
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

function _safeJson(payload) {
    try {
        return JSON.stringify(payload, null, 2);
    } catch {
        return '{"kind":"ZENITH_RUNTIME_ERROR","message":"Unable to serialize runtime error payload"}';
    }
}

function _readProcessEnv(name) {
    const runtime = typeof globalThis !== 'undefined' ? globalThis : {};
    const runtimeProcess = typeof process !== 'undefined'
        ? process
        : runtime.process;

    if (!runtimeProcess || typeof runtimeProcess !== 'object' || !runtimeProcess.env) {
        return undefined;
    }
    const value = runtimeProcess.env[name];
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

function _isDevDiagnosticsMode() {
    const runtime = typeof globalThis !== 'undefined' ? globalThis : {};
    if (runtime.__ZENITH_RUNTIME_DEV__ === true || runtime.__ZENITH_DEV__ === true) {
        return true;
    }
    if (runtime.__ZENITH_RUNTIME_DEV__ === false || runtime.__ZENITH_DEV__ === false) {
        return false;
    }
    if (runtime.__ZENITH_RUNTIME_PROD__ === true) {
        return false;
    }
    if (typeof location !== 'undefined' && location && typeof location.hostname === 'string') {
        const host = String(location.hostname).toLowerCase();
        if (host === 'localhost' || host === '127.0.0.1' || host === '[::1]') {
            return true;
        }
    }
    return false;
}

function _renderOverlay(payload) {
    if (!_isDevDiagnosticsMode()) return;
    if (typeof document === 'undefined' || !document.body) return;

    let overlay = document.getElementById(OVERLAY_ID);
    if (!overlay) {
        overlay = document.createElement('aside');
        overlay.id = OVERLAY_ID;
        overlay.setAttribute('role', 'alert');
        overlay.setAttribute('aria-live', 'assertive');
        overlay.style.position = 'fixed';
        overlay.style.left = '12px';
        overlay.style.right = '12px';
        overlay.style.bottom = '12px';
        overlay.style.maxHeight = '45vh';
        overlay.style.overflow = 'auto';
        overlay.style.zIndex = '2147483647';
        overlay.style.padding = '12px';
        overlay.style.border = '1px solid #ff6b6b';
        overlay.style.borderRadius = '8px';
        overlay.style.background = '#111';
        overlay.style.color = '#ffe5e5';
        overlay.style.fontFamily = 'ui-monospace, SFMono-Regular, Menlo, monospace';
        overlay.style.fontSize = '12px';
        overlay.style.lineHeight = '1.45';
        overlay.style.boxShadow = '0 12px 40px rgba(0,0,0,0.45)';

        const copyButton = document.createElement('button');
        copyButton.type = 'button';
        copyButton.setAttribute('data-zx-runtime-copy', 'true');
        copyButton.style.marginTop = '8px';
        copyButton.style.padding = '4px 8px';
        copyButton.style.border = '1px solid #ff9d9d';
        copyButton.style.borderRadius = '4px';
        copyButton.style.background = '#2a2a2a';
        copyButton.style.color = '#ffe5e5';
        copyButton.style.cursor = 'pointer';
        copyButton.textContent = 'Copy JSON';
        overlay.appendChild(copyButton);

        document.body.appendChild(overlay);
    }

    const textLines = [
        'Zenith Runtime Error',
        `phase: ${payload.phase}`,
        `code: ${payload.code}`,
        `message: ${payload.message}`
    ];

    if (payload.marker) {
        textLines.push(`marker: ${payload.marker.type}#${payload.marker.id}`);
    }
    if (payload.path) {
        textLines.push(`path: ${payload.path}`);
    }
    if (payload.source && payload.source.file) {
        const line = payload.source.start?.line;
        const column = payload.source.start?.column;
        if (Number.isInteger(line) && Number.isInteger(column)) {
            textLines.push(`source: ${payload.source.file}:${line}:${column}`);
        } else {
            textLines.push(`source: ${payload.source.file}`);
        }
        if (payload.source.snippet) {
            textLines.push(`snippet: ${payload.source.snippet}`);
        }
    }
    if (payload.hint) {
        textLines.push(`hint: ${payload.hint}`);
    }
    if (payload.docsLink) {
        textLines.push(`docs: ${payload.docsLink}`);
    }

    const jsonText = _safeJson(payload);
    const panelText = textLines.join('\n');

    let pre = overlay.querySelector('pre[data-zx-runtime-error]');
    if (!pre) {
        pre = document.createElement('pre');
        pre.setAttribute('data-zx-runtime-error', 'true');
        pre.style.margin = '0';
        pre.style.whiteSpace = 'pre-wrap';
        pre.style.wordBreak = 'break-word';
        overlay.insertBefore(pre, overlay.firstChild);
    }
    pre.textContent = panelText;

    const copyButton = overlay.querySelector('button[data-zx-runtime-copy="true"]');
    if (copyButton) {
        copyButton.onclick = () => {
            const clipboard = typeof navigator !== 'undefined' ? navigator.clipboard : null;
            if (clipboard && typeof clipboard.writeText === 'function') {
                void clipboard.writeText(jsonText);
            }
        };
    }
}

function _mapLegacyError(error, fallback) {
    const rawMessage = _extractErrorMessage(error);
    const safeMessage = _sanitizeMessage(rawMessage);

    const details = {
        phase: VALID_PHASES.has(fallback.phase) ? fallback.phase : 'hydrate',
        code: VALID_CODES.has(fallback.code) ? fallback.code : 'BINDING_APPLY_FAILED',
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
    const phase = VALID_PHASES.has(details?.phase) ? details.phase : 'hydrate';
    const code = VALID_CODES.has(details?.code) ? details.code : 'BINDING_APPLY_FAILED';
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
        const marker = !payload.marker ? _normalizeMarker(fallback.marker) : payload.marker;
        const path = !payload.path ? _sanitizePath(fallback.path) : payload.path;
        const hint = !payload.hint ? _sanitizeHint(fallback.hint) : payload.hint;
        const source = !payload.source ? _sanitizeSource(fallback.source) : payload.source;
        const docsLink = !payload.docsLink
            ? _sanitizeDocsLink(fallback.docsLink || DOCS_LINK_BY_CODE[payload.code])
            : payload.docsLink;

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
