import { _resolveExpressionSignalIndices, _evaluateExpression } from './expressions.js';
import { _validatePayload, _resolveComponentProps, _deepFreezePayload } from './payload.js';
import { _registerDisposer, cleanup } from './cleanup.js';
import { rethrowZenithRuntimeError, DOCS_LINKS } from './diagnostics.js';
import { signal } from './signal.js';
import { state } from './state.js';
import {
    effect,
    mount,
    zeneffect,
    zenEffect,
    zenMount
} from './zeneffect.js';
import {
    createSideEffectScope,
    activateSideEffectScope,
    disposeSideEffectScope
} from './side-effect-scope.js';
import { createNodeResolver } from './scanner.js';
import { bindEventMarkers } from './events.js';
import { _applyMarkerValue } from './render.js';

export { _createContextualFragment, _coerceText } from './render.js';

// Raw HTML boundary enforcement lives in render.js:
// attrName.toLowerCase() === 'innerhtml'
// innerHTML bindings are forbidden in Zenith
// attrName.toLowerCase() === 'unsafehtml'

export function hydrate(payload) {
    cleanup();
    try {
        const normalized = _validatePayload(payload);
        _deepFreezePayload(payload);
        const {
            root,
            expressions,
            markers,
            events,
            refs,
            stateValues,
            stateKeys,
            signals,
            components,
            route,
            params,
            ssrData,
            props,
            exprFns
        } = normalized;

        const componentBindings = Object.create(null);
        const resolveNodes = createNodeResolver(root);
        const signalMap = _createSignalMap(signals, stateValues);

        _hydrateRefs(refs, stateValues, resolveNodes);
        _mountComponents({
            components,
            signalMap,
            componentBindings,
            route,
            resolveNodes
        });

        const markerState = _hydrateMarkers({
            expressions,
            markers,
            stateValues,
            stateKeys,
            signalMap,
            componentBindings,
            params,
            ssrData,
            props,
            exprFns,
            resolveNodes
        });
        const renderMarkerByIndex = (index) => _renderMarker({
            index,
            root,
            expressions,
            stateValues,
            stateKeys,
            signalMap,
            componentBindings,
            params,
            ssrData,
            props,
            exprFns,
            resolveNodes,
            ...markerState
        });

        _bindSignalSubscriptions(expressions, signalMap, stateValues, renderMarkerByIndex);
        _bindComponentSignalSubscriptions(expressions, componentBindings, renderMarkerByIndex);

        bindEventMarkers({
            root,
            events,
            expressions,
            markerByIndex: markerState.markerByIndex,
            stateValues,
            stateKeys,
            signalMap,
            componentBindings,
            params,
            ssrData,
            props,
            exprFns,
            resolveNodes
        });

        return cleanup;
    } catch (error) {
        rethrowZenithRuntimeError(error, {
            phase: 'hydrate',
            code: 'BINDING_APPLY_FAILED',
            hint: 'Inspect marker tables, expression bindings, and the runtime overlay diagnostics.',
            docsLink: DOCS_LINKS.markerTable
        });
    }
}

function _createSignalMap(signals, stateValues) {
    const signalMap = new Map();
    for (let i = 0; i < signals.length; i++) {
        const signalDescriptor = signals[i];
        const candidate = stateValues[signalDescriptor.state_index];
        if (!candidate || typeof candidate !== 'object') {
            throw new Error(`[Zenith Runtime] signal id ${signalDescriptor.id} did not resolve to an object`);
        }
        if (typeof candidate.get !== 'function' || typeof candidate.subscribe !== 'function') {
            throw new Error(`[Zenith Runtime] signal id ${signalDescriptor.id} must expose get() and subscribe()`);
        }
        signalMap.set(signalDescriptor.id, candidate);
    }
    return signalMap;
}

function _hydrateRefs(refs, stateValues, resolveNodes) {
    if (refs.length === 0) {
        return;
    }

    const hydratedRefs = [];
    for (let i = 0; i < refs.length; i++) {
        const refBinding = refs[i];
        const targetRef = stateValues[refBinding.state_index];
        const nodes = resolveNodes(refBinding.selector, refBinding.index, 'ref', refBinding.source);
        targetRef.current = nodes[0] || null;
        hydratedRefs.push(targetRef);
    }

    _registerDisposer(() => {
        for (let i = 0; i < hydratedRefs.length; i++) {
            hydratedRefs[i].current = null;
        }
    });
}

function _mountComponents(context) {
    const { components, signalMap, componentBindings, route, resolveNodes } = context;
    for (let i = 0; i < components.length; i++) {
        const component = components[i];
        const resolvedProps = Object.freeze(_resolveComponentProps(component.props || [], signalMap, {
            component: component.instance,
            route
        }));
        const hosts = resolveNodes(component.selector, i, 'component', component.source);
        for (let j = 0; j < hosts.length; j++) {
            try {
                const componentScope = createSideEffectScope(`${component.instance}:${j}`);
                const runtimeApi = {
                    signal,
                    state,
                    zeneffect(effectOrDeps, optionsOrFn) {
                        return zeneffect(effectOrDeps, optionsOrFn, componentScope);
                    },
                    zenEffect(effectFn, options) {
                        return zenEffect(effectFn, options, componentScope);
                    },
                    zenMount(callback) {
                        return zenMount(callback, componentScope);
                    },
                    effect(fnOrDeps, optionsOrFn) {
                        return effect(fnOrDeps, optionsOrFn, componentScope);
                    },
                    mount(callback) {
                        return mount(callback, componentScope);
                    }
                };
                const instance = component.create(hosts[j], resolvedProps, runtimeApi);
                if (!instance || typeof instance !== 'object') {
                    throw new Error(`[Zenith Runtime] component factory for ${component.instance} must return an object`);
                }
                if (typeof instance.mount === 'function') {
                    instance.mount();
                }
                activateSideEffectScope(componentScope);
                _registerDisposer(() => {
                    disposeSideEffectScope(componentScope);
                    if (typeof instance.destroy === 'function') {
                        instance.destroy();
                    }
                });
                if (instance.bindings && typeof instance.bindings === 'object') {
                    componentBindings[component.instance] = instance.bindings;
                }
            } catch (error) {
                try {
                    rethrowZenithRuntimeError(error, {
                        phase: 'hydrate',
                        code: 'COMPONENT_BOOTSTRAP_FAILED',
                        message: `Component bootstrap failed for "${component.instance}"`,
                        path: `component[${component.instance}]`,
                        hint: 'Fix the failing component and refresh; other components continue mounting.',
                        docsLink: DOCS_LINKS.componentBootstrap,
                        source: component.source
                    });
                } catch {
                }
            }
        }
    }
}

function _hydrateMarkers(context) {
    const {
        expressions,
        markers,
        stateValues,
        stateKeys,
        signalMap,
        componentBindings,
        params,
        ssrData,
        props,
        exprFns,
        resolveNodes
    } = context;
    const markerByIndex = new Map();
    const markerNodesByIndex = new Map();
    const markerIndices = new Set();
    const expressionMarkerIndices = new Set();

    for (let i = 0; i < expressions.length; i++) {
        const expression = expressions[i];
        if (expressionMarkerIndices.has(expression.marker_index)) {
            throw new Error(`[Zenith Runtime] duplicate expression marker_index ${expression.marker_index}`);
        }
        expressionMarkerIndices.add(expression.marker_index);
    }

    for (let i = 0; i < markers.length; i++) {
        const marker = markers[i];
        if (markerIndices.has(marker.index)) {
            throw new Error(`[Zenith Runtime] duplicate marker index ${marker.index}`);
        }
        markerIndices.add(marker.index);
        markerByIndex.set(marker.index, marker);

        if (marker.kind === 'event') {
            continue;
        }

        const nodes = resolveNodes(marker.selector, marker.index, marker.kind, marker.source);
        markerNodesByIndex.set(marker.index, nodes);
        const value = _evaluateExpression(
            expressions[marker.index],
            stateValues,
            stateKeys,
            signalMap,
            componentBindings,
            params,
            ssrData,
            marker.kind,
            props,
            exprFns,
            marker,
            null
        );
        _applyMarkerValue(nodes, marker, value);
    }

    for (let i = 0; i < expressions.length; i++) {
        if (!markerIndices.has(i)) {
            throw new Error(`[Zenith Runtime] missing marker index ${i}`);
        }
    }

    return { markerByIndex, markerNodesByIndex };
}

function _renderMarker(context) {
    const marker = context.markerByIndex.get(context.index);
    if (!marker || marker.kind === 'event') {
        return;
    }

    const nodes = context.markerNodesByIndex.get(context.index)
        || context.resolveNodes(marker.selector, marker.index, marker.kind, marker.source);
    context.markerNodesByIndex.set(context.index, nodes);
    const value = _evaluateExpression(
        context.expressions[context.index],
        context.stateValues,
        context.stateKeys,
        context.signalMap,
        context.componentBindings,
        context.params,
        context.ssrData,
        marker.kind,
        context.props,
        context.exprFns,
        marker,
        null
    );
    _applyMarkerValue(nodes, marker, value);
}

function _isSignalLike(candidate) {
    return Boolean(candidate)
        && typeof candidate === 'object'
        && typeof candidate.get === 'function'
        && typeof candidate.subscribe === 'function';
}

function _recordSignalMarkerDependency(dependentMarkersBySignal, signalValue, markerIndex) {
    if (!_isSignalLike(signalValue)) {
        return;
    }
    if (!dependentMarkersBySignal.has(signalValue)) {
        dependentMarkersBySignal.set(signalValue, []);
    }
    dependentMarkersBySignal.get(signalValue).push(markerIndex);
}

function _bindSignalSubscriptions(expressions, signalMap, stateValues, renderMarkerByIndex) {
    const dependentMarkersBySignal = new Map();
    for (let i = 0; i < expressions.length; i++) {
        const expression = expressions[i];
        const signalIndices = _resolveExpressionSignalIndices(expression);
        for (let j = 0; j < signalIndices.length; j++) {
            const signalIndex = signalIndices[j];
            const targetSignal = signalMap.get(signalIndex);
            if (!targetSignal) {
                throw new Error(`[Zenith Runtime] expression references unknown signal id ${signalIndex}`);
            }
            _recordSignalMarkerDependency(dependentMarkersBySignal, targetSignal, expression.marker_index);
        }

        if (Number.isInteger(expression?.state_index)) {
            _recordSignalMarkerDependency(
                dependentMarkersBySignal,
                stateValues[expression.state_index],
                expression.marker_index
            );
        }
    }

    for (const [targetSignal, markerIndexes] of dependentMarkersBySignal.entries()) {
        const unsubscribe = targetSignal.subscribe(() => {
            for (let i = 0; i < markerIndexes.length; i++) {
                renderMarkerByIndex(markerIndexes[i]);
            }
        });
        if (typeof unsubscribe === 'function') {
            _registerDisposer(unsubscribe);
        }
    }
}

function _bindComponentSignalSubscriptions(expressions, componentBindings, renderMarkerByIndex) {
    const dependentMarkersByComponentSignal = new Map();
    for (let i = 0; i < expressions.length; i++) {
        const expression = expressions[i];
        if (typeof expression?.component_instance !== 'string' || typeof expression.component_binding !== 'string') {
            continue;
        }

        const instanceBindings = componentBindings[expression.component_instance];
        const candidate = instanceBindings?.[expression.component_binding];
        if (!candidate || typeof candidate !== 'object') {
            continue;
        }
        if (typeof candidate.get !== 'function' || typeof candidate.subscribe !== 'function') {
            continue;
        }
        if (!dependentMarkersByComponentSignal.has(candidate)) {
            dependentMarkersByComponentSignal.set(candidate, []);
        }
        dependentMarkersByComponentSignal.get(candidate).push(expression.marker_index);
    }

    for (const [componentSignal, markerIndexes] of dependentMarkersByComponentSignal.entries()) {
        const unsubscribe = componentSignal.subscribe(() => {
            for (let i = 0; i < markerIndexes.length; i++) {
                renderMarkerByIndex(markerIndexes[i]);
            }
        });
        if (typeof unsubscribe === 'function') {
            _registerDisposer(unsubscribe);
        }
    }
}
