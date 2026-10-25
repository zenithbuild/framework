import { throwZenithRuntimeError, DOCS_LINKS } from './diagnostics.js';

export function _createContextualFragment(parent, html) {
    const doc = parent.ownerDocument || document;
    if (!doc || typeof doc.createRange !== 'function') {
        throw new Error('[Zenith Runtime] comment placeholder HTML rendering requires Range#createContextualFragment');
    }
    const range = doc.createRange();
    range.selectNode(parent);
    return range.createContextualFragment(html);
}

export function _coerceText(value, path = 'renderable') {
    if (value === null || value === undefined || value === false || value === true) {
        return '';
    }
    if (typeof value === 'function') {
        throwZenithRuntimeError({
            phase: 'render',
            code: 'NON_RENDERABLE_VALUE',
            message: `Zenith Render Error: non-renderable function at ${path}. Use map() to render fields.`,
            path,
            hint: 'Convert functions to handlers or text.',
            docsLink: DOCS_LINKS.expressionScope
        });
    }
    if (value && typeof value === 'object') {
        throwZenithRuntimeError({
            phase: 'render',
            code: 'NON_RENDERABLE_VALUE',
            message: `Zenith Render Error: non-renderable object at ${path}. Use map() to render fields.`,
            path,
            hint: 'Use map() to render object fields.',
            docsLink: DOCS_LINKS.expressionScope
        });
    }
    return String(value);
}
