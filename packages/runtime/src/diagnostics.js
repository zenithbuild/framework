const OVERLAY_ID = '__zenith_runtime_error_overlay';
const MAX_MESSAGE_LENGTH = 120;
const MAX_HINT_LENGTH = 140;
const MAX_PATH_LENGTH = 120;

const VALID_PHASES = new Set(['hydrate', 'bind', 'render', 'event']);
const VALID_CODES = new Set([
    'UNRESOLVED_EXPRESSION',
    'NON_RENDERABLE_VALUE',
    'MARKER_MISSING',
    'FRAGMENT_MOUNT_FAILED',
    'BINDING_APPLY_FAILED',
    'EVENT_HANDLER_FAILED'
]);

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
    if (payload.hint) {
        textLines.push(`hint: ${payload.hint}`);
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
        hint: _sanitizeHint(fallback.hint)
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

    const payload = {
        kind: 'ZENITH_RUNTIME_ERROR',
        phase,
        code,
        message
    };

    const marker = _normalizeMarker(details?.marker);
    if (marker) payload.marker = marker;

    const path = _sanitizePath(details?.path);
    if (path) payload.path = path;

    const hint = _sanitizeHint(details?.hint);
    if (hint) payload.hint = hint;

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
    if (payload && typeof console !== 'undefined' && typeof console.error === 'function') {
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

        if (marker || path || hint) {
            updatedPayload = {
                ...payload,
                ...(marker ? { marker } : null),
                ...(path ? { path } : null),
                ...(hint ? { hint } : null)
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
