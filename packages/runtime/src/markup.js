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
const _FRAGMENT_URL_ATTRS = new Set(['href', 'src', 'srcset', 'action', 'formaction', 'poster', 'xlink:href']);
const _FRAGMENT_ALLOWED_PROTOCOLS = new Set(['http:', 'https:', 'mailto:', 'tel:']);
const _FRAGMENT_URL_ATTR_RE = /\s([:@A-Za-z0-9_.-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/g;
const _FRAGMENT_NAMED_ENTITIES = {
    amp: '&',
    apos: "'",
    colon: ':',
    gt: '>',
    lt: '<',
    newline: '\n',
    quot: '"',
    tab: '\t'
};

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
            hint: 'This helper only accepts tagged templates.'
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
            hint: 'Script tags are not allowed in embedded markup.'
        });
    }
    if (_FRAGMENT_EVENT_ATTR_RE.test(result)) {
        throwZenithRuntimeError({
            phase: 'render',
            code: 'NON_RENDERABLE_VALUE',
            message: 'Embedded markup expression contains inline event handler (on*=)',
            hint: 'Use on:event={handler} instead of inline event attributes.'
        });
    }
    if (_FRAGMENT_JS_URL_RE.test(result)) {
        throwZenithRuntimeError({
            phase: 'render',
            code: 'NON_RENDERABLE_VALUE',
            message: 'Embedded markup expression contains javascript: URL',
            hint: 'javascript: URLs are forbidden.'
        });
    }
    _validateFragmentUrlAttributes(result);

    result = result.replace(_FRAGMENT_SCRIPT_CLOSE_RE, '<\\/script');

    return _createHtmlFragment(result);
}

function _validateFragmentUrlAttributes(html) {
    if (_validateFragmentUrlAttributesWithTemplate(html)) {
        return;
    }

    _FRAGMENT_URL_ATTR_RE.lastIndex = 0;
    for (const match of html.matchAll(_FRAGMENT_URL_ATTR_RE)) {
        const attrName = String(match[1] || '').toLowerCase();
        if (!_FRAGMENT_URL_ATTRS.has(attrName)) {
            continue;
        }
        _validateFragmentUrlAttribute(attrName, match[2] ?? match[3] ?? match[4] ?? '');
    }
}

function _validateFragmentUrlAttributesWithTemplate(html) {
    const doc = globalThis.document;
    if (!doc || typeof doc.createElement !== 'function') {
        return false;
    }

    const template = doc.createElement('template');
    if (!template || !('innerHTML' in template)) {
        return false;
    }

    template.innerHTML = html;
    const stack = Array.from(template.content?.childNodes || []);
    while (stack.length > 0) {
        const node = stack.pop();
        if (!node) {
            continue;
        }
        if (node.nodeType === 1 && node.attributes) {
            for (let i = 0; i < node.attributes.length; i++) {
                const attr = node.attributes[i];
                const attrName = String(attr.name || '').toLowerCase();
                if (_FRAGMENT_URL_ATTRS.has(attrName)) {
                    _validateFragmentUrlAttribute(attrName, attr.value || '');
                }
            }
        }
        const children = node.childNodes ? Array.from(node.childNodes) : [];
        for (let i = children.length - 1; i >= 0; i--) {
            stack.push(children[i]);
        }
    }
    return true;
}

function _validateFragmentUrlAttribute(attrName, value) {
    if (attrName === 'srcset') {
        _validateFragmentSrcsetAttribute(value);
        return;
    }

    _validateFragmentSingleUrlAttribute(attrName, value);
}

function _validateFragmentSingleUrlAttribute(attrName, value) {
    const protocol = _normalizedFragmentUrlProtocol(value);
    if (protocol && !_FRAGMENT_ALLOWED_PROTOCOLS.has(protocol)) {
        throwZenithRuntimeError({
            phase: 'render',
            code: 'NON_RENDERABLE_VALUE',
            message: `Embedded markup expression contains unsafe URL protocol in ${attrName}`,
            hint: 'Use a relative URL or an allowed absolute URL.'
        });
    }
}

function _validateFragmentSrcsetAttribute(value) {
    const candidates = String(value || '').split(',');
    for (let i = 0; i < candidates.length; i++) {
        const candidate = candidates[i].trim();
        if (!candidate) {
            continue;
        }
        const url = candidate.split(/[\u0000-\u001F\u007F\s]+/, 1)[0] || '';
        _validateFragmentSingleUrlAttribute('srcset', url);
    }
}

function _normalizedFragmentUrlProtocol(value) {
    const normalized = _decodeFragmentAttributeValue(value)
        .trim()
        .replace(/[\u0000-\u001F\u007F\s]+/g, '');
    const match = /^([A-Za-z][A-Za-z0-9+.-]*):/.exec(normalized);
    return match ? `${match[1].toLowerCase()}:` : '';
}

function _decodeFragmentAttributeValue(value) {
    let decoded = String(value || '');
    for (let pass = 0; pass < 3; pass++) {
        const next = decoded.replace(/&(#x[0-9a-fA-F]+|#[0-9]+|[A-Za-z][A-Za-z0-9]+);?/g, (_, body) => {
            if (body[0] === '#') {
                const radix = body[1] === 'x' || body[1] === 'X' ? 16 : 10;
                const digits = radix === 16 ? body.slice(2) : body.slice(1);
                const codePoint = Number.parseInt(digits, radix);
                if (Number.isFinite(codePoint)) {
                    try {
                        return String.fromCodePoint(codePoint);
                    } catch {
                        return '';
                    }
                }
                return '';
            }
            const named = _FRAGMENT_NAMED_ENTITIES[String(body).toLowerCase()];
            return named === undefined ? `&${body};` : named;
        });
        if (next === decoded) {
            break;
        }
        decoded = next;
    }
    return decoded;
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
                    hint: 'Prototype pollution keys are forbidden in embedded markup.'
                });
            }
        }
        throwZenithRuntimeError({
            phase: 'render',
            code: 'NON_RENDERABLE_VALUE',
            message: `Embedded markup interpolation[${interpolationIndex}] resolved to a non-renderable object`,
            hint: 'Only primitives, arrays, and compiler-owned fragments are allowed.'
        });
    }
    throwZenithRuntimeError({
        phase: 'render',
        code: 'NON_RENDERABLE_VALUE',
        message: `Embedded markup interpolation[${interpolationIndex}] resolved to type "${typeof val}"`,
        hint: 'Only primitives, arrays, and compiler-owned fragments are allowed.'
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
