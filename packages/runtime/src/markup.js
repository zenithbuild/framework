import { throwZenithRuntimeError } from './diagnostics.js';
export { _rewriteMarkupLiterals } from './template-parser.js';

const HTML_FRAGMENT_BRAND = Symbol.for('zenith.html_fragment');

// This function is intentionally NOT exported. Embedded markup expressions
// lower to this helper, which escapes interpolated strings by default and
// returns compiler-owned fragment objects.
// ──────────────────────────────────────────────────────────────────────────────

const _FRAGMENT_UNSAFE_TAG_RE = /<script[\s>]/i;
const _FRAGMENT_EVENT_ATTR_RE = /\bon[a-z]+\s*=/i;
const _FRAGMENT_JS_URL_RE = /javascript\s*:/i;
const _FRAGMENT_PROTO_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
const _FRAGMENT_SCRIPT_CLOSE_RE = /<\/script/gi;

function _createHtmlFragment(html) {
    return {
        __zenith_fragment: true,
        html,
        [HTML_FRAGMENT_BRAND]: true
    };
}

export function _isHtmlFragment(value) {
    return !!(
        value &&
        typeof value === 'object' &&
        value.__zenith_fragment === true &&
        value[HTML_FRAGMENT_BRAND] === true &&
        typeof value.html === 'string'
    );
}

export function _fragment(strings, ...values) {
    if (!Array.isArray(strings)) {
        throwZenithRuntimeError({
            phase: 'render',
            code: 'NON_RENDERABLE_VALUE',
            message: '__zenith_fragment must be called as a tagged template literal',
            hint: 'This helper only accepts tagged template syntax.'
        });
    }

    let result = '';
    for (let i = 0; i < strings.length; i++) {
        result += strings[i];
        if (i < values.length) {
            const val = values[i];
            result += _fragmentInterpolate(val, i);
        }
    }

    if (_FRAGMENT_UNSAFE_TAG_RE.test(result)) {
        throwZenithRuntimeError({
            phase: 'render',
            code: 'NON_RENDERABLE_VALUE',
            message: 'Embedded markup expression contains forbidden <script> tag',
            hint: 'Script tags are not allowed in embedded markup expressions.'
        });
    }
    if (_FRAGMENT_EVENT_ATTR_RE.test(result)) {
        throwZenithRuntimeError({
            phase: 'render',
            code: 'NON_RENDERABLE_VALUE',
            message: 'Embedded markup expression contains inline event handler (on*=)',
            hint: 'Use on:event={handler} bindings instead of inline event attributes.'
        });
    }
    if (_FRAGMENT_JS_URL_RE.test(result)) {
        throwZenithRuntimeError({
            phase: 'render',
            code: 'NON_RENDERABLE_VALUE',
            message: 'Embedded markup expression contains javascript: URL',
            hint: 'javascript: URLs are forbidden in embedded markup.'
        });
    }

    result = result.replace(_FRAGMENT_SCRIPT_CLOSE_RE, '<\\/script');

    return _createHtmlFragment(result);
}

function _fragmentInterpolate(val, interpolationIndex) {
    if (val === null || val === undefined || val === false) {
        return '';
    }
    if (val === true) {
        return '';
    }
    if (typeof val === 'string') {
        return _escapeFragmentHtml(val);
    }
    if (typeof val === 'number') {
        return _escapeFragmentHtml(String(val));
    }
    if (_isHtmlFragment(val)) {
        return val.html;
    }
    if (Array.isArray(val)) {
        let out = '';
        for (let j = 0; j < val.length; j++) {
            out += _fragmentInterpolate(val[j], interpolationIndex);
        }
        return out;
    }
    if (typeof val === 'object') {
        const keys = Object.keys(val);
        for (let k = 0; k < keys.length; k++) {
            if (_FRAGMENT_PROTO_KEYS.has(keys[k])) {
                throwZenithRuntimeError({
                    phase: 'render',
                    code: 'NON_RENDERABLE_VALUE',
                    message: `Embedded markup interpolation[${interpolationIndex}] contains forbidden key "${keys[k]}"`,
                    hint: 'Prototype pollution keys are forbidden in embedded markup expressions.'
                });
            }
        }
        throwZenithRuntimeError({
            phase: 'render',
            code: 'NON_RENDERABLE_VALUE',
            message: `Embedded markup interpolation[${interpolationIndex}] resolved to a non-renderable object`,
            hint: 'Only strings, numbers, booleans, null, undefined, arrays, and compiler-owned fragments are allowed.'
        });
    }
    throwZenithRuntimeError({
        phase: 'render',
        code: 'NON_RENDERABLE_VALUE',
        message: `Embedded markup interpolation[${interpolationIndex}] resolved to type "${typeof val}"`,
        hint: 'Only strings, numbers, booleans, null, undefined, arrays, and compiler-owned fragments are allowed.'
    });
}

function _escapeFragmentHtml(input) {
    return String(input)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}
