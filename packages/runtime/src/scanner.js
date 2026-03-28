import { throwZenithRuntimeError, DOCS_LINKS } from './diagnostics.js';

export function createNodeResolver(root) {
    let commentIndex = null;
    let commentIndexReady = false;

    return function resolveNodes(selector, index, kind, source = undefined) {
        const nodes = selector.startsWith('comment:')
            ? _lookupCommentNodes(selector.slice('comment:'.length), getCommentIndex())
            : root.querySelectorAll(selector);
        if (!nodes || nodes.length === 0) {
            const isRef = kind === 'ref';
            throwZenithRuntimeError({
                phase: 'bind',
                code: 'MARKER_MISSING',
                message: `Unresolved ${kind} marker index ${index}`,
                marker: { type: kind, id: index },
                path: `selector:${selector}`,
                hint: isRef
                    ? 'Use ref + zenMount and ensure the ref is bound in markup before mount.'
                    : 'Confirm SSR marker attributes and runtime selector tables match.',
                docsLink: isRef ? DOCS_LINKS.refs : DOCS_LINKS.markerTable,
                source
            });
        }
        return nodes;
    };

    function getCommentIndex() {
        if (!commentIndexReady) {
            commentIndex = _buildCommentIndex(root);
            commentIndexReady = true;
        }
        return commentIndex;
    }
}

function _buildCommentIndex(root) {
    const walkerRoot = root && root.nodeType === 9 && root.documentElement ? root.documentElement : root;
    const doc = walkerRoot && walkerRoot.ownerDocument ? walkerRoot.ownerDocument : walkerRoot;
    const nodeFilter = doc?.defaultView?.NodeFilter || globalThis.NodeFilter;
    const cache = new Map();
    if (!walkerRoot || !doc || typeof doc.createTreeWalker !== 'function' || !nodeFilter) {
        return cache;
    }

    const walker = doc.createTreeWalker(walkerRoot, nodeFilter.SHOW_COMMENT);
    let current = walker.nextNode();
    while (current) {
        const list = cache.get(current.data);
        if (list) {
            list.push(current);
        } else {
            cache.set(current.data, [current]);
        }
        current = walker.nextNode();
    }
    return cache;
}

function _lookupCommentNodes(markerText, cache) {
    if (!cache) {
        return [];
    }
    return cache.get(markerText) || [];
}
