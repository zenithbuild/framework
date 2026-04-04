import { _registerListener } from './cleanup.js';
import { rethrowZenithRuntimeError, throwZenithRuntimeError, DOCS_LINKS } from './diagnostics.js';
import { _evaluateExpression, _describeBindingExpression, _resolveBindingSource } from './expressions.js';

export function bindEventMarkers(context) {
    const { root, events } = context;
    const eventIndices = new Set();
    const escDispatchEntries = [];

    for (let i = 0; i < events.length; i++) {
        const eventBinding = events[i];
        if (eventIndices.has(eventBinding.index)) {
            throw new Error(`[Zenith Runtime] duplicate event index ${eventBinding.index}`);
        }
        eventIndices.add(eventBinding.index);

        const marker = context.markerByIndex.get(eventBinding.index) || null;
        const nodes = context.resolveNodes(
            eventBinding.selector,
            eventBinding.index,
            'event',
            eventBinding.source || marker?.source
        );
        const expressionBinding = context.expressions[eventBinding.index];
        const handler = _resolveEventHandler(context, expressionBinding, marker, eventBinding);

        for (let j = 0; j < nodes.length; j++) {
            const node = nodes[j];
            const wrappedHandler = _createWrappedEventHandler(handler, expressionBinding, marker, eventBinding);
            if (eventBinding.event === 'esc') {
                escDispatchEntries.push({ node, handler: wrappedHandler });
                continue;
            }
            _bindDomEvent(node, eventBinding.event, wrappedHandler);
        }
    }

    if (escDispatchEntries.length > 0) {
        _registerEscDispatch(root, escDispatchEntries);
    }
}

function _resolveEventHandler(context, expressionBinding, marker, eventBinding) {
    const handler = _evaluateExpression(
        expressionBinding,
        context.stateValues,
        context.stateKeys,
        context.signalMap,
        context.componentBindings,
        context.params,
        context.ssrData,
        'event',
        context.props,
        context.exprFns,
        marker,
        eventBinding
    );
    if (typeof handler === 'function') {
        return handler;
    }

    throwZenithRuntimeError({
        phase: 'bind',
        code: 'BINDING_APPLY_FAILED',
        message: `Event binding at index ${eventBinding.index} expected a function reference. You passed: ${_describeBindingExpression(expressionBinding)}`,
        marker: { type: `data-zx-on-${eventBinding.event}`, id: eventBinding.index },
        path: `event[${eventBinding.index}].${eventBinding.event}`,
        hint: 'Use on:*={handler}; forwarded props must be functions.',
        docsLink: DOCS_LINKS.eventBinding,
        source: _resolveBindingSource(expressionBinding, marker, eventBinding)
    });
}

function _createWrappedEventHandler(handler, expressionBinding, marker, eventBinding) {
    return function zenithEventHandler(event) {
        try {
            return handler.call(this, event);
        } catch (error) {
            rethrowZenithRuntimeError(error, {
                phase: 'event',
                code: 'EVENT_HANDLER_FAILED',
                message: `Event handler failed for "${eventBinding.event}"`,
                marker: { type: `data-zx-on-${eventBinding.event}`, id: eventBinding.index },
                path: `event[${eventBinding.index}].${eventBinding.event}`,
                hint: 'Inspect handler body and referenced state.',
                docsLink: DOCS_LINKS.eventBinding,
                source: _resolveBindingSource(expressionBinding, marker, eventBinding)
            });
        }
    };
}

function _registerEscDispatch(root, escDispatchEntries) {
    const doc = _resolveOwnerDocument(root);
    if (!doc || typeof doc.addEventListener !== 'function') {
        return;
    }

    const escDispatchListener = function zenithEscDispatch(event) {
        if (!event || event.key !== 'Escape') {
            return;
        }

        const targetEntry = _resolveEscTarget(doc, escDispatchEntries);
        if (!targetEntry) {
            return;
        }

        return targetEntry.handler.call(targetEntry.node, event);
    };

    _bindDomEvent(doc, 'keydown', escDispatchListener);
}

function _resolveEscTarget(doc, escDispatchEntries) {
    const activeElement = doc.activeElement || null;

    if (activeElement && activeElement !== doc.body && activeElement !== doc.documentElement) {
        for (let i = escDispatchEntries.length - 1; i >= 0; i--) {
            const entry = escDispatchEntries[i];
            if (!entry?.node || !entry.node.isConnected) {
                continue;
            }
            if (typeof entry.node.contains === 'function' && entry.node.contains(activeElement)) {
                return entry;
            }
        }
    }

    if (activeElement === null || activeElement === doc.body || activeElement === doc.documentElement) {
        for (let i = escDispatchEntries.length - 1; i >= 0; i--) {
            const entry = escDispatchEntries[i];
            if (entry?.node?.isConnected) {
                return entry;
            }
        }
    }

    return null;
}

function _bindDomEvent(target, eventName, handler) {
    target.addEventListener(eventName, handler);
    _registerListener(target, eventName, handler);
}

function _resolveOwnerDocument(root) {
    if (root?.ownerDocument) {
        return root.ownerDocument;
    }
    if (root?.nodeType === 9) {
        return root;
    }
    return typeof document !== 'undefined' ? document : null;
}
