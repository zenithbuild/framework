import { rethrowZenithRuntimeError, throwZenithRuntimeError, DOCS_LINKS } from './diagnostics.js';
import { createFragmentRegion } from './fragment-patch.js';
import { _isHtmlFragment } from './markup.js';

const SVG_NAMESPACE = 'http://www.w3.org/2000/svg';
const BOOLEAN_ATTRIBUTES = new Set([
    'disabled', 'checked', 'selected', 'readonly', 'multiple',
    'hidden', 'autofocus', 'required', 'open'
]);

export function _applyMarkerValue(nodes, marker, value) {
    const markerPath = `marker[${marker.index}]`;
    for (let i = 0; i < nodes.length; i++) {
        try {
            const node = nodes[i];
            if (marker.kind === 'text') {
                if (node && node.nodeType === 8) {
                    _applyCommentMarkerValue(node, value, `${markerPath}.text`);
                    continue;
                }
                if (_isStructuralFragment(value)) {
                    _mountStructuralFragment(node, value, `${markerPath}.text`);
                    continue;
                }

                const html = _renderFragmentValue(value, `${markerPath}.text`);
                if (html !== null) {
                    node.innerHTML = html;
                } else {
                    node.textContent = _coerceText(value, `${markerPath}.text`);
                }
                continue;
            }

            if (marker.kind === 'attr') {
                _applyAttribute(node, marker.attr, value);
            }
        } catch (error) {
            rethrowZenithRuntimeError(error, {
                phase: 'bind',
                code: 'BINDING_APPLY_FAILED',
                message: `Failed to apply ${marker.kind} binding at marker ${marker.index}`,
                marker: {
                    type: marker.kind === 'attr' ? `attr:${marker.attr}` : marker.kind,
                    id: marker.index
                },
                path: marker.kind === 'attr'
                    ? `${markerPath}.attr.${marker.attr}`
                    : `${markerPath}.${marker.kind}`,
                hint: 'Check the binding value type and marker mapping.',
                docsLink: DOCS_LINKS.markerTable,
                source: marker.source
            });
        }
    }
}

function _applyCommentMarkerValue(anchor, value, rootPath) {
    if (_isStructuralFragment(value)) {
        _mountStructuralFragmentIntoCommentRange(anchor, value, rootPath);
        return;
    }

    const end = _clearCommentPlaceholderContent(anchor);
    const parent = end.parentNode;
    if (!parent) {
        return;
    }

    const html = _renderFragmentValue(value, rootPath);
    if (html !== null) {
        parent.insertBefore(_createContextualFragment(parent, html), end);
        return;
    }

    const textNode = (parent.ownerDocument || document).createTextNode(_coerceText(value, rootPath));
    parent.insertBefore(textNode, end);
}

export function _createContextualFragment(parent, html) {
    const doc = parent.ownerDocument || document;
    if (!doc || typeof doc.createRange !== 'function') {
        throw new Error('[Zenith Runtime] comment placeholder HTML rendering requires Range#createContextualFragment');
    }
    const range = doc.createRange();
    range.selectNode(parent);
    return range.createContextualFragment(html);
}

function _isStructuralFragment(value) {
    if (Array.isArray(value)) {
        for (let i = 0; i < value.length; i++) {
            if (_isStructuralFragment(value[i])) {
                return true;
            }
        }
        return false;
    }
    return value && typeof value === 'object' && value.__zenith_fragment === true && typeof value.mount === 'function';
}

function _ensureCommentPlaceholderEnd(anchor) {
    let end = anchor.__z_range_end || null;
    if (end && end.parentNode === anchor.parentNode) {
        return end;
    }

    const parent = anchor.parentNode;
    if (!parent) {
        return null;
    }

    end = (anchor.ownerDocument || document).createComment(`/ ${anchor.data}`);
    parent.insertBefore(end, anchor.nextSibling);
    anchor.__z_range_end = end;
    return end;
}

function _clearCommentPlaceholderContent(anchor) {
    if (anchor.__z_unmounts) {
        for (let i = 0; i < anchor.__z_unmounts.length; i++) {
            try {
                anchor.__z_unmounts[i]();
            } catch {
            }
        }
    }
    anchor.__z_unmounts = [];

    const end = _ensureCommentPlaceholderEnd(anchor);
    if (!end) {
        return anchor;
    }

    let current = anchor.nextSibling;
    while (current && current !== end) {
        const next = current.nextSibling;
        if (current.parentNode) {
            current.parentNode.removeChild(current);
        }
        current = next;
    }
    return end;
}

function _mountStructuralFragmentIntoCommentRange(anchor, value, rootPath = 'renderable') {
    let region = anchor.__z_fragment_region;

    if (region && anchor.__z_fragment_region_active) {
        try {
            region.update(value, { parent: anchor.parentNode, insertBefore: anchor.__z_range_end, rootPath });
        } catch (error) {
            rethrowZenithRuntimeError(error, {
                phase: 'render',
                code: 'FRAGMENT_MOUNT_FAILED',
                message: 'Fragment update failed',
                path: rootPath,
                hint: 'Verify fragment values and nested renderable arrays.',
                docsLink: DOCS_LINKS.markerTable
            });
        }
        return;
    }

    const end = _clearCommentPlaceholderContent(anchor);
    const parent = end.parentNode;
    if (!parent) {
        return;
    }

    region = createFragmentRegion();
    anchor.__z_fragment_region = region;
    anchor.__z_fragment_region_active = true;

    try {
        region.mount(value, { parent, insertBefore: end, rootPath });
    } catch (error) {
        rethrowZenithRuntimeError(error, {
            phase: 'render',
            code: 'FRAGMENT_MOUNT_FAILED',
            message: 'Fragment mount failed',
            path: rootPath,
            hint: 'Verify fragment values and nested renderable arrays.',
            docsLink: DOCS_LINKS.markerTable
        });
    }

    anchor.__z_unmounts = [() => {
        anchor.__z_fragment_region_active = false;
        region.destroy();
    }];
}

function _mountStructuralFragment(container, value, rootPath = 'renderable') {
    let region = container.__z_fragment_region;

    if (region && container.__z_fragment_region_active) {
        try {
            region.update(value, { parent: container, insertBefore: null, rootPath });
        } catch (error) {
            rethrowZenithRuntimeError(error, {
                phase: 'render',
                code: 'FRAGMENT_MOUNT_FAILED',
                message: 'Fragment update failed',
                path: rootPath,
                hint: 'Verify fragment values and nested renderable arrays.',
                docsLink: DOCS_LINKS.markerTable
            });
        }
        return;
    }

    if (container.__z_unmounts) {
        for (let i = 0; i < container.__z_unmounts.length; i++) {
            try {
                container.__z_unmounts[i]();
            } catch {
            }
        }
    }

    container.innerHTML = '';
    region = createFragmentRegion();
    container.__z_fragment_region = region;
    container.__z_fragment_region_active = true;

    try {
        region.mount(value, { parent: container, insertBefore: null, rootPath });
    } catch (error) {
        rethrowZenithRuntimeError(error, {
            phase: 'render',
            code: 'FRAGMENT_MOUNT_FAILED',
            message: 'Fragment mount failed',
            path: rootPath,
            hint: 'Verify fragment values and nested renderable arrays.',
            docsLink: DOCS_LINKS.markerTable
        });
    }

    container.__z_unmounts = [() => {
        container.__z_fragment_region_active = false;
        region.destroy();
    }];
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
            hint: 'Convert functions into explicit event handlers or renderable text.',
            docsLink: DOCS_LINKS.expressionScope
        });
    }
    if (value && typeof value === 'object') {
        throwZenithRuntimeError({
            phase: 'render',
            code: 'NON_RENDERABLE_VALUE',
            message: `Zenith Render Error: non-renderable object at ${path}. Use map() to render fields.`,
            path,
            hint: 'Use map() to render object fields into nodes.',
            docsLink: DOCS_LINKS.expressionScope
        });
    }
    return String(value);
}

function _renderFragmentValue(value, path = 'renderable') {
    if (value === null || value === undefined || value === false || value === true) {
        return '';
    }
    if (Array.isArray(value)) {
        let out = '';
        for (let i = 0; i < value.length; i++) {
            const itemPath = `${path}[${i}]`;
            const piece = _renderFragmentValue(value[i], itemPath);
            if (piece !== null) {
                out += piece;
                continue;
            }
            out += _escapeHtml(_coerceText(value[i], itemPath));
        }
        return out;
    }
    if (_isHtmlFragment(value)) {
        return value.html;
    }
    return null;
}

function _escapeHtml(input) {
    return String(input)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function _applyAttribute(node, attrName, value) {
    if (typeof attrName === 'string' && attrName.toLowerCase() === 'innerhtml') {
        throwZenithRuntimeError({
            phase: 'bind',
            code: 'UNSAFE_HTML_REQUIRES_EXPLICIT_BOUNDARY',
            message: 'innerHTML bindings are forbidden in Zenith',
            path: `attr:${attrName}`,
            hint: 'Use unsafeHTML={value} for explicit raw HTML insertion, or embedded markup expressions for compiler-owned fragments.'
        });
    }

    if (typeof attrName === 'string' && attrName.toLowerCase() === 'unsafehtml') {
        node.innerHTML = value === null || value === undefined || value === false ? '' : String(value);
        return;
    }

    if (attrName === 'class' || attrName === 'className') {
        const classValue = value === null || value === undefined || value === false ? '' : String(value);
        if (node && node.namespaceURI === SVG_NAMESPACE && typeof node.setAttribute === 'function') {
            node.setAttribute('class', classValue);
            return;
        }
        node.className = classValue;
        return;
    }

    if (attrName === 'style') {
        if (value === null || value === undefined || value === false) {
            node.removeAttribute('style');
            return;
        }

        if (typeof value === 'string') {
            node.setAttribute('style', value);
            return;
        }

        if (typeof value === 'object') {
            const entries = Object.entries(value);
            let styleText = '';
            for (let i = 0; i < entries.length; i++) {
                const [key, rawValue] = entries[i];
                styleText += `${key}: ${rawValue};`;
            }
            node.setAttribute('style', styleText);
            return;
        }

        node.setAttribute('style', String(value));
        return;
    }

    if (BOOLEAN_ATTRIBUTES.has(attrName)) {
        if (value) {
            node.setAttribute(attrName, '');
        } else {
            node.removeAttribute(attrName);
        }
        return;
    }

    if (value === null || value === undefined || value === false) {
        node.removeAttribute(attrName);
        return;
    }

    node.setAttribute(attrName, String(value));
}
