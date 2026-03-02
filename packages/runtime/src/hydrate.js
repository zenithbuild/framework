// ---------------------------------------------------------------------------
// hydrate.js — Zenith Runtime V0
// ---------------------------------------------------------------------------
// Contract-driven hydration engine.
//
// Runtime discovery is forbidden: this module only resolves selectors from
// bundler-provided tables and executes explicit index-based bindings.
// ---------------------------------------------------------------------------

import { _registerDisposer, _registerListener, cleanup } from './cleanup.js';
import { isZenithRuntimeError, rethrowZenithRuntimeError, throwZenithRuntimeError } from './diagnostics.js';
import { signal } from './signal.js';
import { state } from './state.js';
import {
    zeneffect,
    zenEffect,
    zenMount,
    createSideEffectScope,
    activateSideEffectScope,
    disposeSideEffectScope
} from './zeneffect.js';

const ALIAS_CONFLICT = Symbol('alias_conflict');
const ACTIVE_MARKER_CLASS = 'z-active';
const UNRESOLVED_LITERAL = Symbol('unresolved_literal');
const LEGACY_MARKUP_HELPER = 'html';

const BOOLEAN_ATTRIBUTES = new Set([
    'disabled', 'checked', 'selected', 'readonly', 'multiple',
    'hidden', 'autofocus', 'required', 'open'
]);

const STRICT_MEMBER_CHAIN_LITERAL_RE = /^(?:true|false|null|undefined|[A-Za-z_$][A-Za-z0-9_$]*(\.[A-Za-z_$][A-Za-z0-9_$]*)*)$/;
const UNSAFE_MEMBER_KEYS = new Set(['__proto__', 'prototype', 'constructor']);

/**
 * Hydrate a pre-rendered DOM tree using explicit payload tables.
 *
 * @param {{
 *   ir_version: number,
 *   root: Document | Element,
 *   expressions: Array<{ marker_index: number, signal_index?: number|null, state_index?: number|null, component_instance?: string|null, component_binding?: string|null, literal?: string|null }>,
 *   markers: Array<{ index: number, kind: 'text' | 'attr' | 'event', selector: string, attr?: string }>,
 *   events: Array<{ index: number, event: string, selector: string }>,
 *   refs?: Array<{ index: number, state_index: number, selector: string }>,
 *   state_values: Array<*>,
 *   state_keys?: Array<string>,
 *   signals: Array<{ id: number, kind: 'signal', state_index: number }>,
 *   components?: Array<{ instance: string, selector: string, create: Function }>
 * }} payload
 * @returns {() => void}
 */
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
            signalMap.set(i, candidate);
        }

        const hydratedRefs = [];
        for (let i = 0; i < refs.length; i++) {
            const refBinding = refs[i];
            const targetRef = stateValues[refBinding.state_index];
            const nodes = _resolveNodes(root, refBinding.selector, refBinding.index, 'ref');
            targetRef.current = nodes[0] || null;
            hydratedRefs.push(targetRef);
        }

        if (hydratedRefs.length > 0) {
            _registerDisposer(() => {
                for (let i = 0; i < hydratedRefs.length; i++) {
                    hydratedRefs[i].current = null;
                }
            });
        }

        for (let i = 0; i < components.length; i++) {
            const component = components[i];
            const resolvedProps = Object.freeze(_resolveComponentProps(component.props || [], signalMap, {
                component: component.instance,
                route
            }));
            const hosts = _resolveNodes(root, component.selector, i, 'component');
            for (let j = 0; j < hosts.length; j++) {
                const componentScope = createSideEffectScope(`${component.instance}:${j}`);
                const runtimeApi = {
                    signal,
                    state,
                    zeneffect(effect, dependenciesOrOptions) {
                        return zeneffect(effect, dependenciesOrOptions, componentScope);
                    },
                    zenEffect(effect, options) {
                        return zenEffect(effect, options, componentScope);
                    },
                    zenMount(callback) {
                        return zenMount(callback, componentScope);
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
            }
        }

        const expressionMarkerIndices = new Set();
        for (let i = 0; i < expressions.length; i++) {
            const expression = expressions[i];
            if (expressionMarkerIndices.has(expression.marker_index)) {
                throw new Error(`[Zenith Runtime] duplicate expression marker_index ${expression.marker_index}`);
            }
            expressionMarkerIndices.add(expression.marker_index);
        }

        const markerByIndex = new Map();
        const markerNodesByIndex = new Map();
        const markerIndices = new Set();
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

            const nodes = _resolveNodes(root, marker.selector, marker.index, marker.kind);
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
                exprFns
            );
            _applyMarkerValue(nodes, marker, value);
        }

        for (let i = 0; i < expressions.length; i++) {
            if (!markerIndices.has(i)) {
                throw new Error(`[Zenith Runtime] missing marker index ${i}`);
            }
        }

        function renderMarkerByIndex(index) {
            const marker = markerByIndex.get(index);
            if (!marker || marker.kind === 'event') {
                return;
            }
            const nodes = markerNodesByIndex.get(index) || _resolveNodes(root, marker.selector, marker.index, marker.kind);
            markerNodesByIndex.set(index, nodes);
            const value = _evaluateExpression(
                expressions[index],
                stateValues,
                stateKeys,
                signalMap,
                componentBindings,
                params,
                ssrData,
                marker.kind,
                props,
                exprFns
            );
            _applyMarkerValue(nodes, marker, value);
        }

        const dependentMarkersBySignal = new Map();
        for (let i = 0; i < expressions.length; i++) {
            const expression = expressions[i];
            const signalIndices = _resolveExpressionSignalIndices(expression);
            if (signalIndices.length === 0) {
                continue;
            }
            for (let j = 0; j < signalIndices.length; j++) {
                const signalIndex = signalIndices[j];
                if (!dependentMarkersBySignal.has(signalIndex)) {
                    dependentMarkersBySignal.set(signalIndex, []);
                }
                dependentMarkersBySignal.get(signalIndex).push(expression.marker_index);
            }
        }

        for (const [signalId, markerIndexes] of dependentMarkersBySignal.entries()) {
            const targetSignal = signalMap.get(signalId);
            if (!targetSignal) {
                throw new Error(`[Zenith Runtime] expression references unknown signal id ${signalId}`);
            }
            const unsubscribe = targetSignal.subscribe(() => {
                for (let i = 0; i < markerIndexes.length; i++) {
                    renderMarkerByIndex(markerIndexes[i]);
                }
            });
            if (typeof unsubscribe === 'function') {
                _registerDisposer(unsubscribe);
            }
        }

        const dependentMarkersByComponentSignal = new Map();
        for (let i = 0; i < expressions.length; i++) {
            const expression = expressions[i];
            if (!expression || typeof expression !== 'object') {
                continue;
            }
            if (typeof expression.component_instance !== 'string' || typeof expression.component_binding !== 'string') {
                continue;
            }
            const instanceBindings = componentBindings[expression.component_instance];
            const candidate =
                instanceBindings && Object.prototype.hasOwnProperty.call(instanceBindings, expression.component_binding)
                    ? instanceBindings[expression.component_binding]
                    : undefined;
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

        const eventIndices = new Set();
        const escDispatchEntries = [];
        for (let i = 0; i < events.length; i++) {
            const eventBinding = events[i];
            if (eventIndices.has(eventBinding.index)) {
                throw new Error(`[Zenith Runtime] duplicate event index ${eventBinding.index}`);
            }
            eventIndices.add(eventBinding.index);

            const nodes = _resolveNodes(root, eventBinding.selector, eventBinding.index, 'event');
            const handler = _evaluateExpression(
                expressions[eventBinding.index],
                stateValues,
                stateKeys,
                signalMap,
                componentBindings,
                params,
                ssrData,
                'event',
                props || {},
                exprFns
            );
            if (typeof handler !== 'function') {
                throwZenithRuntimeError({
                    phase: 'bind',
                    code: 'BINDING_APPLY_FAILED',
                    message: `Event binding at index ${eventBinding.index} did not resolve to a function`,
                    marker: { type: `data-zx-on-${eventBinding.event}`, id: eventBinding.index },
                    path: `event[${eventBinding.index}].${eventBinding.event}`,
                    hint: 'Bind events to function references (on:click={handler}).'
                });
            }

            for (let j = 0; j < nodes.length; j++) {
                const node = nodes[j];
                const wrappedHandler = function zenithEventHandler(event) {
                    try {
                        return handler.call(this, event);
                    } catch (error) {
                        rethrowZenithRuntimeError(error, {
                            phase: 'event',
                            code: 'EVENT_HANDLER_FAILED',
                            message: `Event handler failed for "${eventBinding.event}"`,
                            marker: { type: `data-zx-on-${eventBinding.event}`, id: eventBinding.index },
                            path: `event[${eventBinding.index}].${eventBinding.event}`,
                            hint: 'Inspect the handler body and referenced state.'
                        });
                    }
                };
                if (eventBinding.event === 'esc') {
                    escDispatchEntries.push({
                        node,
                        handler: wrappedHandler
                    });
                    continue;
                }
                node.addEventListener(eventBinding.event, wrappedHandler);
                _registerListener(node, eventBinding.event, wrappedHandler);
            }
        }

        if (escDispatchEntries.length > 0) {
            const doc = root && root.ownerDocument ? root.ownerDocument : (typeof document !== 'undefined' ? document : null);
            if (doc && typeof doc.addEventListener === 'function') {
                const escDispatchListener = function zenithEscDispatch(event) {
                    if (!event || event.key !== 'Escape') {
                        return;
                    }

                    const activeElement = doc.activeElement || null;
                    let targetEntry = null;

                    if (activeElement && activeElement !== doc.body && activeElement !== doc.documentElement) {
                        for (let i = escDispatchEntries.length - 1; i >= 0; i--) {
                            const entry = escDispatchEntries[i];
                            if (!entry || !entry.node) {
                                continue;
                            }
                            if (!entry.node.isConnected) {
                                continue;
                            }
                            if (typeof entry.node.contains === 'function' && entry.node.contains(activeElement)) {
                                targetEntry = entry;
                                break;
                            }
                        }
                    }

                    if (!targetEntry && (activeElement === null || activeElement === doc.body || activeElement === doc.documentElement)) {
                        for (let i = escDispatchEntries.length - 1; i >= 0; i--) {
                            const entry = escDispatchEntries[i];
                            if (!entry || !entry.node || !entry.node.isConnected) {
                                continue;
                            }
                            targetEntry = entry;
                            break;
                        }
                    }

                    if (!targetEntry) {
                        return;
                    }

                    return targetEntry.handler.call(targetEntry.node, event);
                };
                doc.addEventListener('keydown', escDispatchListener);
                _registerListener(doc, 'keydown', escDispatchListener);
            }
        }

        return cleanup;
    } catch (error) {
        rethrowZenithRuntimeError(error, {
            phase: 'hydrate',
            code: 'BINDING_APPLY_FAILED',
            hint: 'Inspect marker tables, expression bindings, and the runtime overlay diagnostics.'
        });
    }
}

function _validatePayload(payload) {
    if (!payload || typeof payload !== 'object') {
        throw new Error('[Zenith Runtime] hydrate(payload) requires an object payload');
    }

    if (payload.ir_version !== 1) {
        throw new Error('[Zenith Runtime] unsupported ir_version (expected 1)');
    }

    const root = payload.root;
    const hasQuery = !!root && typeof root.querySelectorAll === 'function';
    if (!hasQuery) {
        throw new Error('[Zenith Runtime] hydrate(payload) requires payload.root with querySelectorAll');
    }

    const expressions = payload.expressions;
    if (!Array.isArray(expressions)) {
        throw new Error('[Zenith Runtime] hydrate(payload) requires expressions[]');
    }

    const markers = payload.markers;
    if (!Array.isArray(markers)) {
        throw new Error('[Zenith Runtime] hydrate(payload) requires markers[]');
    }

    const events = payload.events;
    if (!Array.isArray(events)) {
        throw new Error('[Zenith Runtime] hydrate(payload) requires events[]');
    }

    const refs = Array.isArray(payload.refs) ? payload.refs : [];

    const stateValues = payload.state_values;
    if (!Array.isArray(stateValues)) {
        throw new Error('[Zenith Runtime] hydrate(payload) requires state_values[]');
    }
    const stateKeys = Array.isArray(payload.state_keys) ? payload.state_keys : [];
    if (!Array.isArray(stateKeys)) {
        throw new Error('[Zenith Runtime] hydrate(payload) requires state_keys[] when provided');
    }
    for (let i = 0; i < stateKeys.length; i++) {
        if (typeof stateKeys[i] !== 'string') {
            throw new Error(`[Zenith Runtime] state_keys[${i}] must be a string`);
        }
    }

    const signals = payload.signals;
    if (!Array.isArray(signals)) {
        throw new Error('[Zenith Runtime] hydrate(payload) requires signals[]');
    }

    const components = Array.isArray(payload.components) ? payload.components : [];
    const route = typeof payload.route === 'string' && payload.route.length > 0
        ? payload.route
        : '<unknown>';
    const params = payload.params && typeof payload.params === 'object'
        ? payload.params
        : {};
    const ssrData = payload.ssr_data && typeof payload.ssr_data === 'object'
        ? payload.ssr_data
        : {};
    const exprFns = Array.isArray(payload.expr_fns) ? payload.expr_fns : [];

    if (markers.length !== expressions.length) {
        throw new Error(
            `[Zenith Runtime] marker/expression mismatch: markers=${markers.length}, expressions=${expressions.length}`
        );
    }

    for (let i = 0; i < expressions.length; i++) {
        const expression = expressions[i];
        if (!expression || typeof expression !== 'object' || Array.isArray(expression)) {
            throw new Error(`[Zenith Runtime] expression at position ${i} must be an object`);
        }
        if (!Number.isInteger(expression.marker_index) || expression.marker_index < 0 || expression.marker_index >= expressions.length) {
            throw new Error(`[Zenith Runtime] expression at position ${i} has invalid marker_index`);
        }
        if (expression.marker_index !== i) {
            throw new Error(
                `[Zenith Runtime] expression table out of order at position ${i}: marker_index=${expression.marker_index}`
            );
        }
        if (expression.fn_index !== undefined && expression.fn_index !== null) {
            if (!Number.isInteger(expression.fn_index) || expression.fn_index < 0) {
                throw new Error(`[Zenith Runtime] expression at position ${i} has invalid fn_index`);
            }
        }
        if (expression.signal_indices !== undefined) {
            if (!Array.isArray(expression.signal_indices)) {
                throw new Error(`[Zenith Runtime] expression at position ${i} must provide signal_indices[]`);
            }
            for (let j = 0; j < expression.signal_indices.length; j++) {
                if (!Number.isInteger(expression.signal_indices[j]) || expression.signal_indices[j] < 0) {
                    throw new Error(
                        `[Zenith Runtime] expression at position ${i} has invalid signal_indices[${j}]`
                    );
                }
            }
        }
    }

    for (let i = 0; i < markers.length; i++) {
        const marker = markers[i];
        if (!marker || typeof marker !== 'object' || Array.isArray(marker)) {
            throw new Error(`[Zenith Runtime] marker at position ${i} must be an object`);
        }
        if (!Number.isInteger(marker.index) || marker.index < 0 || marker.index >= expressions.length) {
            throw new Error(`[Zenith Runtime] marker at position ${i} has out-of-bounds index`);
        }
        if (marker.index !== i) {
            throw new Error(`[Zenith Runtime] marker table out of order at position ${i}: index=${marker.index}`);
        }
        if (marker.kind !== 'text' && marker.kind !== 'attr' && marker.kind !== 'event') {
            throw new Error(`[Zenith Runtime] marker at position ${i} has invalid kind`);
        }
        if (typeof marker.selector !== 'string' || marker.selector.length === 0) {
            throw new Error(`[Zenith Runtime] marker at position ${i} requires selector`);
        }
        if (marker.kind === 'attr' && (typeof marker.attr !== 'string' || marker.attr.length === 0)) {
            throw new Error(`[Zenith Runtime] attr marker at position ${i} requires attr name`);
        }
    }

    for (let i = 0; i < events.length; i++) {
        const eventBinding = events[i];
        if (!eventBinding || typeof eventBinding !== 'object' || Array.isArray(eventBinding)) {
            throw new Error(`[Zenith Runtime] event binding at position ${i} must be an object`);
        }
        if (!Number.isInteger(eventBinding.index) || eventBinding.index < 0 || eventBinding.index >= expressions.length) {
            throw new Error(`[Zenith Runtime] event binding at position ${i} has out-of-bounds index`);
        }
        if (typeof eventBinding.event !== 'string' || eventBinding.event.length === 0) {
            throw new Error(`[Zenith Runtime] event binding at position ${i} requires event name`);
        }
        if (typeof eventBinding.selector !== 'string' || eventBinding.selector.length === 0) {
            throw new Error(`[Zenith Runtime] event binding at position ${i} requires selector`);
        }
    }

    for (let i = 0; i < refs.length; i++) {
        const refBinding = refs[i];
        if (!refBinding || typeof refBinding !== 'object' || Array.isArray(refBinding)) {
            throw new Error(`[Zenith Runtime] ref binding at position ${i} must be an object`);
        }
        if (!Number.isInteger(refBinding.index) || refBinding.index < 0) {
            throw new Error(`[Zenith Runtime] ref binding at position ${i} requires non-negative index`);
        }
        if (
            !Number.isInteger(refBinding.state_index) ||
            refBinding.state_index < 0 ||
            refBinding.state_index >= stateValues.length
        ) {
            throw new Error(
                `[Zenith Runtime] ref binding at position ${i} has out-of-bounds state_index`
            );
        }
        if (typeof refBinding.selector !== 'string' || refBinding.selector.length === 0) {
            throw new Error(`[Zenith Runtime] ref binding at position ${i} requires selector`);
        }
        const candidate = stateValues[refBinding.state_index];
        if (!candidate || typeof candidate !== 'object' || !Object.prototype.hasOwnProperty.call(candidate, 'current')) {
            throw new Error(
                `[Zenith Runtime] ref binding at position ${i} must resolve to a ref-like object`
            );
        }
    }

    for (let i = 0; i < signals.length; i++) {
        const signalDescriptor = signals[i];
        if (!signalDescriptor || typeof signalDescriptor !== 'object' || Array.isArray(signalDescriptor)) {
            throw new Error(`[Zenith Runtime] signal descriptor at position ${i} must be an object`);
        }
        if (signalDescriptor.kind !== 'signal') {
            throw new Error(`[Zenith Runtime] signal descriptor at position ${i} requires kind="signal"`);
        }
        if (!Number.isInteger(signalDescriptor.id) || signalDescriptor.id < 0) {
            throw new Error(`[Zenith Runtime] signal descriptor at position ${i} requires non-negative id`);
        }
        if (signalDescriptor.id !== i) {
            throw new Error(`[Zenith Runtime] signal table out of order at position ${i}: id=${signalDescriptor.id}`);
        }
        if (!Number.isInteger(signalDescriptor.state_index) || signalDescriptor.state_index < 0 || signalDescriptor.state_index >= stateValues.length) {
            throw new Error(`[Zenith Runtime] signal descriptor at position ${i} has out-of-bounds state_index`);
        }
    }

    for (let i = 0; i < components.length; i++) {
        const component = components[i];
        if (!component || typeof component !== 'object' || Array.isArray(component)) {
            throw new Error(`[Zenith Runtime] component at position ${i} must be an object`);
        }
        if (typeof component.instance !== 'string' || component.instance.length === 0) {
            throw new Error(`[Zenith Runtime] component at position ${i} requires instance`);
        }
        if (typeof component.selector !== 'string' || component.selector.length === 0) {
            throw new Error(`[Zenith Runtime] component at position ${i} requires selector`);
        }
        if (typeof component.create !== 'function') {
            throw new Error(`[Zenith Runtime] component at position ${i} requires create() function`);
        }
    }

    if (payload.params !== undefined) {
        if (!payload.params || typeof payload.params !== 'object' || Array.isArray(payload.params)) {
            throw new Error('[Zenith Runtime] hydrate() requires params object');
        }
    }

    if (payload.ssr_data !== undefined) {
        if (!payload.ssr_data || typeof payload.ssr_data !== 'object' || Array.isArray(payload.ssr_data)) {
            throw new Error('[Zenith Runtime] hydrate() requires ssr_data object');
        }
    }

    const props = payload.props && typeof payload.props === 'object' && !Array.isArray(payload.props)
        ? payload.props
        : {};
    for (let i = 0; i < expressions.length; i++) Object.freeze(expressions[i]);
    for (let i = 0; i < markers.length; i++) Object.freeze(markers[i]);
    for (let i = 0; i < events.length; i++) Object.freeze(events[i]);
    for (let i = 0; i < refs.length; i++) Object.freeze(refs[i]);
    for (let i = 0; i < signals.length; i++) Object.freeze(signals[i]);
    for (let i = 0; i < components.length; i++) {
        const c = components[i];
        if (Array.isArray(c.props)) {
            for (let j = 0; j < c.props.length; j++) {
                const propDesc = c.props[j];
                if (
                    propDesc &&
                    typeof propDesc === 'object' &&
                    _isHydrationFreezableContainer(propDesc.value)
                ) {
                    Object.freeze(propDesc.value);
                }
                Object.freeze(propDesc);
            }
            Object.freeze(c.props);
        }
        Object.freeze(c);
    }

    Object.freeze(expressions);
    Object.freeze(markers);
    Object.freeze(events);
    Object.freeze(refs);
    Object.freeze(signals);
    Object.freeze(components);

    const validatedPayload = {
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
        params: Object.freeze(params),
        ssrData: Object.freeze(ssrData),
        props: Object.freeze(props),
        exprFns: Object.freeze(exprFns)
    };

    return Object.freeze(validatedPayload);
}

function _resolveComponentProps(propTable, signalMap, context = {}) {
    if (!Array.isArray(propTable)) {
        throw new Error('[Zenith Runtime] component props must be an array');
    }
    const resolved = Object.create(null);
    for (let i = 0; i < propTable.length; i++) {
        const descriptor = propTable[i];
        if (!descriptor || typeof descriptor !== 'object' || Array.isArray(descriptor)) {
            throw new Error(`[Zenith Runtime] component prop descriptor at index ${i} must be an object`);
        }
        if (typeof descriptor.name !== 'string' || descriptor.name.length === 0) {
            throw new Error(`[Zenith Runtime] component prop descriptor at index ${i} requires non-empty name`);
        }
        if (Object.prototype.hasOwnProperty.call(resolved, descriptor.name)) {
            throw new Error(`[Zenith Runtime] duplicate component prop "${descriptor.name}"`);
        }
        if (descriptor.type === 'static') {
            if (!Object.prototype.hasOwnProperty.call(descriptor, 'value')) {
                throw new Error(`[Zenith Runtime] component prop "${descriptor.name}" static value is missing`);
            }
            resolved[descriptor.name] = descriptor.value;
            continue;
        }
        if (descriptor.type === 'signal') {
            if (!Number.isInteger(descriptor.index)) {
                throw new Error(`[Zenith Runtime] component prop "${descriptor.name}" signal index must be an integer`);
            }
            const signalValue = signalMap.get(descriptor.index);
            if (!signalValue || typeof signalValue.get !== 'function') {
                throw new Error(
                    `[Zenith Runtime]\nComponent: ${context.component || '<unknown>'}\nRoute: ${context.route || '<unknown>'}\nProp: ${descriptor.name}\nReason: signal index ${descriptor.index} did not resolve`
                );
            }
            resolved[descriptor.name] = signalValue;
            continue;
        }
        throw new Error(
            `[Zenith Runtime] unsupported component prop type "${descriptor.type}" for "${descriptor.name}"`
        );
    }
    return resolved;
}

function _resolveNodes(root, selector, index, kind) {
    const nodes = root.querySelectorAll(selector);
    if (!nodes || nodes.length === 0) {
        throwZenithRuntimeError({
            phase: 'bind',
            code: 'MARKER_MISSING',
            message: `Unresolved ${kind} marker index ${index}`,
            marker: { type: kind, id: index },
            path: `selector:${selector}`,
            hint: 'Confirm SSR marker attributes and runtime selector tables match.'
        });
    }
    return nodes;
}

function _resolveExpressionSignalIndices(binding) {
    if (!binding || typeof binding !== 'object') {
        return [];
    }
    if (Array.isArray(binding.signal_indices) && binding.signal_indices.length > 0) {
        return [...new Set(binding.signal_indices.filter((value) => Number.isInteger(value) && value >= 0))];
    }
    if (Number.isInteger(binding.signal_index) && binding.signal_index >= 0) {
        return [binding.signal_index];
    }
    return [];
}

function _evaluateExpression(binding, stateValues, stateKeys, signalMap, componentBindings, params, ssrData, mode, props, exprFns) {
    if (binding.fn_index != null && binding.fn_index !== undefined) {
        const fns = Array.isArray(exprFns) ? exprFns : [];
        const fn = fns[binding.fn_index];
        if (typeof fn === 'function') {
            return fn({
                signalMap,
                params,
                ssrData,
                props: props || {},
                componentBindings,
                zenhtml: _zenhtml,
                fragment(html) {
                    return {
                        __zenith_fragment: true,
                        html: html === null || html === undefined || html === false ? '' : String(html)
                    };
                }
            });
        }
    }
    if (binding.signal_index !== null && binding.signal_index !== undefined) {
        const signalValue = signalMap.get(binding.signal_index);
        if (!signalValue || typeof signalValue.get !== 'function') {
            throw new Error('[Zenith Runtime] expression.signal_index did not resolve to a signal');
        }
        return mode === 'event' ? signalValue : signalValue.get();
    }

    if (binding.state_index !== null && binding.state_index !== undefined) {
        const resolved = stateValues[binding.state_index];
        if (
            mode !== 'event' &&
            resolved &&
            typeof resolved === 'object' &&
            typeof resolved.get === 'function'
        ) {
            return resolved.get();
        }
        if (mode !== 'event' && typeof resolved === 'function') {
            return resolved();
        }
        return resolved;
    }

    if (typeof binding.component_instance === 'string' && typeof binding.component_binding === 'string') {
        const instanceBindings = componentBindings[binding.component_instance];
        const resolved =
            instanceBindings && Object.prototype.hasOwnProperty.call(instanceBindings, binding.component_binding)
                ? instanceBindings[binding.component_binding]
                : undefined;
        if (
            mode !== 'event' &&
            resolved &&
            typeof resolved === 'object' &&
            typeof resolved.get === 'function'
        ) {
            return resolved.get();
        }
        if (mode !== 'event' && typeof resolved === 'function') {
            return resolved();
        }
        return resolved;
    }

    if (binding.literal !== null && binding.literal !== undefined) {
        if (typeof binding.literal === 'string') {
            const trimmedLiteral = binding.literal.trim();
            const strictMemberValue = _resolveStrictMemberChainLiteral(
                trimmedLiteral,
                stateValues,
                stateKeys,
                params,
                ssrData,
                mode,
                props,
                binding.marker_index
            );
            if (strictMemberValue !== UNRESOLVED_LITERAL) {
                return strictMemberValue;
            }
            if (trimmedLiteral === 'data' || trimmedLiteral === 'ssr') {
                return ssrData;
            }
            if (trimmedLiteral === 'params') {
                return params;
            }
            if (trimmedLiteral === 'props') {
                return props || {};
            }

            const primitiveValue = _resolvePrimitiveLiteral(trimmedLiteral);
            if (primitiveValue !== UNRESOLVED_LITERAL) {
                return primitiveValue;
            }
            if (_isLikelyExpressionLiteral(trimmedLiteral)) {
                throwZenithRuntimeError({
                    phase: 'bind',
                    code: 'UNRESOLVED_EXPRESSION',
                    message: `Failed to resolve expression literal: ${_truncateLiteralForError(trimmedLiteral)}`,
                    marker: {
                        type: _markerTypeForError(mode),
                        id: binding.marker_index
                    },
                    path: `expression[${binding.marker_index}]`,
                    hint: 'Ensure the expression references declared state keys or params/data bindings.'
                });
            }
        }
        return binding.literal;
    }

    return '';
}

function _throwUnresolvedMemberChainError(literal, markerIndex, mode, pathSuffix, hint) {
    throwZenithRuntimeError({
        phase: 'bind',
        code: 'UNRESOLVED_EXPRESSION',
        message: `Failed to resolve expression literal: ${_truncateLiteralForError(literal)}`,
        marker: {
            type: _markerTypeForError(mode),
            id: markerIndex
        },
        path: `marker[${markerIndex}].${pathSuffix}`,
        hint
    });
}

function _resolveStrictMemberChainLiteral(
    literal,
    stateValues,
    stateKeys,
    params,
    ssrData,
    mode,

    props,
    markerIndex
) {
    if (typeof literal !== 'string' || !STRICT_MEMBER_CHAIN_LITERAL_RE.test(literal)) {
        return UNRESOLVED_LITERAL;
    }

    if (literal === 'true') return true;
    if (literal === 'false') return false;
    if (literal === 'null') return null;
    if (literal === 'undefined') return undefined;

    const segments = literal.split('.');
    const baseIdentifier = segments[0];
    const scope = _buildLiteralScope(stateValues, stateKeys, params, ssrData, mode, props);

    if (!Object.prototype.hasOwnProperty.call(scope, baseIdentifier)) {
        _throwUnresolvedMemberChainError(
            literal,
            markerIndex,
            mode,
            `expression.${baseIdentifier}`,
            `Base identifier "${baseIdentifier}" is not bound. Check props/data/params and declared state keys.`
        );
    }

    let cursor = scope[baseIdentifier];
    let traversedPath = baseIdentifier;

    for (let i = 1; i < segments.length; i++) {
        const segment = segments[i];
        if (UNSAFE_MEMBER_KEYS.has(segment)) {
            throwZenithRuntimeError({
                phase: 'bind',
                code: 'UNSAFE_MEMBER_ACCESS',
                message: `Blocked unsafe member access: ${segment} in path "${literal}"`,
                path: `marker[${markerIndex}].expression.${literal}`,
                hint: 'Property access to __proto__, prototype, and constructor is forbidden.'
            });
        }

        if (cursor === null || cursor === undefined) {
            _throwUnresolvedMemberChainError(
                literal,
                markerIndex,
                mode,
                `expression.${traversedPath}.${segment}`,
                `Cannot read "${segment}" from ${traversedPath} because it is null or undefined.`
            );
        }

        const cursorType = typeof cursor;
        if (cursorType !== 'object' && cursorType !== 'function') {
            _throwUnresolvedMemberChainError(
                literal,
                markerIndex,
                mode,
                `expression.${traversedPath}.${segment}`,
                `Cannot read "${segment}" from ${traversedPath} because it resolved to a ${cursorType}.`
            );
        }

        if (!Object.prototype.hasOwnProperty.call(cursor, segment)) {
            _throwUnresolvedMemberChainError(
                literal,
                markerIndex,
                mode,
                `expression.${traversedPath}.${segment}`,
                `Missing member "${segment}" on ${traversedPath}. Check your bindings.`
            );
        }

        cursor = cursor[segment];
        traversedPath = `${traversedPath}.${segment}`;
    }

    return cursor;
}

function _resolvePrimitiveLiteral(literal) {
    if (typeof literal !== 'string') {
        return UNRESOLVED_LITERAL;
    }
    if (literal === 'true') return true;
    if (literal === 'false') return false;
    if (literal === 'null') return null;
    if (literal === 'undefined') return undefined;

    if (/^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?$/.test(literal)) {
        return Number(literal);
    }

    if (literal.length >= 2 && literal.startsWith('"') && literal.endsWith('"')) {
        try {
            return JSON.parse(literal);
        } catch {
            return UNRESOLVED_LITERAL;
        }
    }

    if (literal.length >= 2 && literal.startsWith('\'') && literal.endsWith('\'')) {
        return literal
            .slice(1, -1)
            .replace(/\\\\/g, '\\')
            .replace(/\\'/g, '\'');
    }

    if (literal.length >= 2 && literal.startsWith('`') && literal.endsWith('`')) {
        return literal.slice(1, -1);
    }

    return UNRESOLVED_LITERAL;
}

function _buildLiteralScope(stateValues, stateKeys, params, ssrData, mode, props) {
    const scope = Object.create(null);
    scope.params = params;
    scope.data = ssrData;
    scope.ssr = ssrData;
    scope.props = props || {};
    scope.__ZENITH_INTERNAL_ZENHTML = _zenhtml;
    scope.__zenith_fragment = function __zenith_fragment(html) {
        return {
            __zenith_fragment: true,
            html: html === null || html === undefined || html === false ? '' : String(html)
        };
    };
    scope[LEGACY_MARKUP_HELPER] = function legacyMarkup(strings, ...values) {
        if (!Array.isArray(strings)) {
            return scope.__zenith_fragment(strings);
        }
        let html = '';
        for (let i = 0; i < strings.length; i++) {
            html += strings[i];
            if (i < values.length) {
                html += _renderLegacyMarkupInterpolation(values[i]);
            }
        }
        return scope.__zenith_fragment(html);
    };
    const aliasConflicts = new Set();

    if (Array.isArray(stateKeys)) {
        for (let i = 0; i < stateKeys.length; i++) {
            const key = stateKeys[i];
            if (typeof key !== 'string' || key.length === 0) {
                continue;
            }
            if (Object.prototype.hasOwnProperty.call(scope, key)) {
                continue;
            }
            const value = stateValues[i];
            scope[key] = value;

            const alias = _deriveStateAlias(key);
            if (!alias || alias === key || aliasConflicts.has(alias)) {
                continue;
            }
            if (Object.prototype.hasOwnProperty.call(scope, alias)) {
                delete scope[alias];
                aliasConflicts.add(alias);
                continue;
            }
            scope[alias] = scope[key];
        }
    }

    return scope;
}

function _deriveStateAlias(key) {
    if (typeof key !== 'string' || key.length === 0) {
        return null;
    }
    if (!key.startsWith('__')) {
        return null;
    }
    if (key.startsWith('__z_frag_')) {
        return null;
    }
    const segments = key.split('_').filter(Boolean);
    for (let i = segments.length - 1; i >= 0; i--) {
        const candidate = segments[i];
        if (/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(candidate)) {
            return candidate === key ? null : candidate;
        }
    }
    const match = key.match(/([A-Za-z_$][A-Za-z0-9_$]*)$/);
    if (!match) {
        return null;
    }
    const alias = match[1];
    return alias === key ? null : alias;
}

function _isLikelyExpressionLiteral(literal) {
    if (typeof literal !== 'string') {
        return false;
    }
    const trimmed = literal.trim();
    if (trimmed.length === 0) {
        return false;
    }
    if (trimmed === 'true' || trimmed === 'false' || trimmed === 'null' || trimmed === 'undefined') {
        return false;
    }
    if (/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(trimmed)) {
        return true;
    }
    return /=>|[()[\]{}<>=?:.+\-*/%|&!]/.test(trimmed);
}

function _markerTypeForError(kind) {
    if (kind === 'text') return 'data-zx-e';
    if (kind === 'attr') return 'data-zx-attr';
    if (kind === 'event') return 'data-zx-on';
    return kind;
}

function _truncateLiteralForError(str) {
    if (typeof str !== 'string') return String(str);
    const sanitized = str
        .replace(/[A-Za-z]:\\[^\s"'`]+/g, '<path>')
        .replace(/\/Users\/[^\s"'`]+/g, '<path>')
        .replace(/\/home\/[^\s"'`]+/g, '<path>')
        .replace(/\/private\/[^\s"'`]+/g, '<path>')
        .replace(/\/tmp\/[^\s"'`]+/g, '<path>')
        .replace(/\/var\/folders\/[^\s"'`]+/g, '<path>');
    return sanitized.length > 100 ? `${sanitized.substring(0, 97)}...` : sanitized;
}

// ──────────────────────────────────────────────────────────────────────────────
// _zenhtml — LEGACY internal helper for compiler-generated fragment expressions.
//
// This function is intentionally NOT exported. It is bound into the evaluator
// scope under __ZENITH_INTERNAL_ZENHTML so only compiler-emitted literals can
// reach it. Sanitization happens ONLY inside this helper; existing innerHTML
// sites used for explicit innerHTML={…} bindings are NOT affected.
//
// Scheduled for removal before 1.0 (replaced by full fragment protocol).
// ──────────────────────────────────────────────────────────────────────────────

const _ZENHTML_UNSAFE_TAG_RE = /<script[\s>]/i;
const _ZENHTML_EVENT_ATTR_RE = /\bon[a-z]+\s*=/i;
const _ZENHTML_JS_URL_RE = /javascript\s*:/i;
const _ZENHTML_PROTO_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
const _ZENHTML_SCRIPT_CLOSE_RE = /<\/script/gi;

function _zenhtml(strings, ...values) {
    if (!Array.isArray(strings)) {
        throwZenithRuntimeError({
            phase: 'render',
            code: 'NON_RENDERABLE_VALUE',
            message: '__ZENITH_INTERNAL_ZENHTML must be called as a tagged template literal',
            hint: 'This helper only accepts tagged template syntax.'
        });
    }

    let result = '';
    for (let i = 0; i < strings.length; i++) {
        result += strings[i];
        if (i < values.length) {
            const val = values[i];
            result += _zenhtml_coerce(val, i);
        }
    }

    // Final output sanitization: reject dangerous patterns in assembled HTML
    if (_ZENHTML_UNSAFE_TAG_RE.test(result)) {
        throwZenithRuntimeError({
            phase: 'render',
            code: 'NON_RENDERABLE_VALUE',
            message: 'Embedded markup expression contains forbidden <script> tag',
            hint: 'Script tags are not allowed in embedded markup expressions.'
        });
    }
    if (_ZENHTML_EVENT_ATTR_RE.test(result)) {
        throwZenithRuntimeError({
            phase: 'render',
            code: 'NON_RENDERABLE_VALUE',
            message: 'Embedded markup expression contains inline event handler (on*=)',
            hint: 'Use on:event={handler} bindings instead of inline event attributes.'
        });
    }
    if (_ZENHTML_JS_URL_RE.test(result)) {
        throwZenithRuntimeError({
            phase: 'render',
            code: 'NON_RENDERABLE_VALUE',
            message: 'Embedded markup expression contains javascript: URL',
            hint: 'javascript: URLs are forbidden in embedded markup.'
        });
    }

    // Escape any residual </script sequences
    result = result.replace(_ZENHTML_SCRIPT_CLOSE_RE, '<\\/script');

    return {
        __zenith_fragment: true,
        html: result
    };
}

function _zenhtml_coerce(val, interpolationIndex) {
    if (val === null || val === undefined || val === false) {
        return '';
    }
    if (val === true) {
        return '';
    }
    if (typeof val === 'string') {
        return val;
    }
    if (typeof val === 'number') {
        return String(val);
    }
    if (typeof val === 'object' && val.__zenith_fragment === true && typeof val.html === 'string') {
        return val.html;
    }
    if (Array.isArray(val)) {
        let out = '';
        for (let j = 0; j < val.length; j++) {
            out += _zenhtml_coerce(val[j], interpolationIndex);
        }
        return out;
    }
    if (typeof val === 'object') {
        // Check for prototype pollution keys
        const keys = Object.keys(val);
        for (let k = 0; k < keys.length; k++) {
            if (_ZENHTML_PROTO_KEYS.has(keys[k])) {
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
            hint: 'Only strings, numbers, booleans, null, undefined, arrays, and __zenith_fragment objects are allowed.'
        });
    }
    // functions and symbols are not renderable
    throwZenithRuntimeError({
        phase: 'render',
        code: 'NON_RENDERABLE_VALUE',
        message: `Embedded markup interpolation[${interpolationIndex}] resolved to type "${typeof val}"`,
        hint: 'Only strings, numbers, booleans, null, undefined, arrays, and __zenith_fragment objects are allowed.'
    });
}

function _rewriteMarkupLiterals(expression) {
    let out = '';
    let index = 0;
    let quote = null;
    let escaped = false;

    while (index < expression.length) {
        const ch = expression[index];

        if (quote) {
            out += ch;
            if (escaped) {
                escaped = false;
                index += 1;
                continue;
            }
            if (ch === '\\') {
                escaped = true;
                index += 1;
                continue;
            }
            if (ch === quote) {
                quote = null;
            }
            index += 1;
            continue;
        }

        if (ch === '\'' || ch === '"' || ch === '`') {
            quote = ch;
            out += ch;
            index += 1;
            continue;
        }

        if (ch === '<') {
            const markup = _readMarkupLiteral(expression, index);
            if (markup) {
                out += `__zenith_fragment(${_markupLiteralToTemplate(markup.value)})`;
                index = markup.end;
                continue;
            }
        }

        out += ch;
        index += 1;
    }

    return out;
}

function _readMarkupLiteral(source, start) {
    if (source[start] !== '<') {
        return null;
    }

    const firstTag = _readTagToken(source, start);
    if (!firstTag || firstTag.isClosing) {
        return null;
    }
    if (firstTag.selfClosing) {
        return {
            value: source.slice(start, firstTag.end),
            end: firstTag.end
        };
    }

    const stack = [firstTag.name];
    let cursor = firstTag.end;

    while (cursor < source.length) {
        const nextLt = source.indexOf('<', cursor);
        if (nextLt < 0) {
            return null;
        }
        const token = _readTagToken(source, nextLt);
        if (!token) {
            cursor = nextLt + 1;
            continue;
        }
        cursor = token.end;

        if (token.selfClosing) {
            continue;
        }

        if (token.isClosing) {
            const expected = stack[stack.length - 1];
            if (token.name !== expected) {
                return null;
            }
            stack.pop();
            if (stack.length === 0) {
                return {
                    value: source.slice(start, token.end),
                    end: token.end
                };
            }
            continue;
        }

        stack.push(token.name);
    }

    return null;
}

function _readTagToken(source, start) {
    if (source[start] !== '<') {
        return null;
    }
    let index = start + 1;
    let isClosing = false;

    if (index < source.length && source[index] === '/') {
        isClosing = true;
        index += 1;
    }

    if (index >= source.length || !/[A-Za-z_]/.test(source[index])) {
        return null;
    }

    const nameStart = index;
    while (index < source.length && /[A-Za-z0-9:_-]/.test(source[index])) {
        index += 1;
    }
    if (index === nameStart) {
        return null;
    }
    const name = source.slice(nameStart, index);

    let quote = null;
    let escaped = false;
    let braceDepth = 0;
    while (index < source.length) {
        const ch = source[index];
        if (quote) {
            if (escaped) {
                escaped = false;
                index += 1;
                continue;
            }
            if (ch === '\\') {
                escaped = true;
                index += 1;
                continue;
            }
            if (ch === quote) {
                quote = null;
            }
            index += 1;
            continue;
        }

        if (ch === '\'' || ch === '"' || ch === '`') {
            quote = ch;
            index += 1;
            continue;
        }
        if (ch === '{') {
            braceDepth += 1;
            index += 1;
            continue;
        }
        if (ch === '}') {
            braceDepth = Math.max(0, braceDepth - 1);
            index += 1;
            continue;
        }
        if (ch === '>' && braceDepth === 0) {
            const segment = source.slice(start, index + 1);
            const selfClosing = !isClosing && /\/\s*>$/.test(segment);
            return { name, isClosing, selfClosing, end: index + 1 };
        }
        index += 1;
    }

    return null;
}

function _markupLiteralToTemplate(markup) {
    let out = '`';
    let index = 0;
    while (index < markup.length) {
        const ch = markup[index];
        if (ch === '{') {
            const segment = _readBalancedBraces(markup, index);
            if (segment) {
                if (_isAttributeExpressionStart(markup, index)) {
                    out += '"${' + segment.content + '}"';
                } else {
                    out += '${' + segment.content + '}';
                }
                index = segment.end;
                continue;
            }
        }
        if (ch === '`') {
            out += '\\`';
            index += 1;
            continue;
        }
        if (ch === '\\') {
            out += '\\\\';
            index += 1;
            continue;
        }
        if (ch === '$' && markup[index + 1] === '{') {
            out += '\\${';
            index += 2;
            continue;
        }
        out += ch;
        index += 1;
    }
    out += '`';
    return out;
}

function _isAttributeExpressionStart(markup, start) {
    let cursor = start - 1;
    while (cursor >= 0) {
        const ch = markup[cursor];
        if (ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r') {
            cursor -= 1;
            continue;
        }
        return ch === '=';
    }
    return false;
}

function _readBalancedBraces(source, start) {
    if (source[start] !== '{') {
        return null;
    }
    let depth = 1;
    let index = start + 1;
    let quote = null;
    let escaped = false;
    let content = '';

    while (index < source.length) {
        const ch = source[index];
        if (quote) {
            content += ch;
            if (escaped) {
                escaped = false;
                index += 1;
                continue;
            }
            if (ch === '\\') {
                escaped = true;
                index += 1;
                continue;
            }
            if (ch === quote) {
                quote = null;
            }
            index += 1;
            continue;
        }

        if (ch === '\'' || ch === '"' || ch === '`') {
            quote = ch;
            content += ch;
            index += 1;
            continue;
        }
        if (ch === '{') {
            depth += 1;
            content += ch;
            index += 1;
            continue;
        }
        if (ch === '}') {
            depth -= 1;
            if (depth === 0) {
                return {
                    content,
                    end: index + 1
                };
            }
            content += ch;
            index += 1;
            continue;
        }
        content += ch;
        index += 1;
    }

    return null;
}

function _applyMarkerValue(nodes, marker, value) {
    const markerPath = `marker[${marker.index}]`;
    for (let i = 0; i < nodes.length; i++) {
        try {
            const node = nodes[i];
            if (marker.kind === 'text') {
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
                hint: 'Check the binding value type and marker mapping.'
            });
        }
    }
}

function _isStructuralFragment(value) {
    if (Array.isArray(value)) {
        for (let i = 0; i < value.length; i++) {
            if (_isStructuralFragment(value[i])) return true;
        }
        return false;
    }
    return value && typeof value === 'object' && value.__zenith_fragment === true && typeof value.mount === 'function';
}

function _mountStructuralFragment(container, value, rootPath = 'renderable') {
    if (container.__z_unmounts) {
        for (let i = 0; i < container.__z_unmounts.length; i++) {
            try { container.__z_unmounts[i](); } catch (e) { }
        }
    }

    container.innerHTML = '';
    const newUnmounts = [];

    function mountItem(item, path) {
        if (Array.isArray(item)) {
            for (let i = 0; i < item.length; i++) mountItem(item[i], `${path}[${i}]`);
            return;
        }
        if (item && item.__zenith_fragment === true && typeof item.mount === 'function') {
            item.mount(container);
            if (typeof item.unmount === 'function') {
                newUnmounts.push(item.unmount.bind(item));
            }
        } else {
            const text = _coerceText(item, path);
            if (text || text === '') {
                const textNode = document.createTextNode(text);
                container.appendChild(textNode);
                newUnmounts.push(() => {
                    if (textNode.parentNode) textNode.parentNode.removeChild(textNode);
                });
            }
        }
    }

    try {
        mountItem(value, rootPath);
    } catch (error) {
        rethrowZenithRuntimeError(error, {
            phase: 'render',
            code: 'FRAGMENT_MOUNT_FAILED',
            message: 'Fragment mount failed',
            path: rootPath,
            hint: 'Verify fragment values and nested renderable arrays.'
        });
    }
    container.__z_unmounts = newUnmounts;
}

function _coerceText(value, path = 'renderable') {
    if (value === null || value === undefined || value === false || value === true) return '';
    if (typeof value === 'function') {
        throwZenithRuntimeError({
            phase: 'render',
            code: 'NON_RENDERABLE_VALUE',
            message: `Zenith Render Error: non-renderable function at ${path}. Use map() to render fields.`,
            path,
            hint: 'Convert functions into explicit event handlers or renderable text.'
        });
    }
    if (value && typeof value === 'object') {
        throwZenithRuntimeError({
            phase: 'render',
            code: 'NON_RENDERABLE_VALUE',
            message: `Zenith Render Error: non-renderable object at ${path}. Use map() to render fields.`,
            path,
            hint: 'Use map() to render object fields into nodes.'
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
    if (
        value &&
        typeof value === 'object' &&
        value.__zenith_fragment === true &&
        typeof value.html === 'string'
    ) {
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

function _renderLegacyMarkupInterpolation(value) {
    if (value === null || value === undefined || value === false || value === true) {
        return '';
    }
    if (Array.isArray(value)) {
        let out = '';
        for (let i = 0; i < value.length; i++) {
            out += _renderLegacyMarkupInterpolation(value[i]);
        }
        return out;
    }
    if (
        value &&
        typeof value === 'object' &&
        value.__zenith_fragment === true &&
        typeof value.html === 'string'
    ) {
        return value.html;
    }
    return _escapeHtml(_coerceText(value, 'legacy markup interpolation'));
}

function _applyAttribute(node, attrName, value) {
    if (typeof attrName === 'string' && attrName.toLowerCase() === 'innerhtml') {
        node.innerHTML = value === null || value === undefined || value === false
            ? ''
            : String(value);
        return;
    }

    if (attrName === 'class' || attrName === 'className') {
        node.className = value === null || value === undefined || value === false ? '' : String(value);
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

function _deepFreezePayload(obj) {
    if (!_isHydrationFreezableContainer(obj) || Object.isFrozen(obj)) return;

    Object.freeze(obj);
    const keys = Object.keys(obj);
    for (let i = 0; i < keys.length; i++) {
        const val = obj[keys[i]];
        if (val && typeof val === 'object' && typeof val !== 'function') {
            _deepFreezePayload(val);
        }
    }
}

function _isHydrationRefObject(obj) {
    if (!obj || typeof obj !== 'object') {
        return false;
    }
    if (obj.__zenith_ref === true) {
        return true;
    }
    if (!Object.prototype.hasOwnProperty.call(obj, 'current')) {
        return false;
    }
    if (typeof obj.get === 'function' && typeof obj.subscribe === 'function') {
        return false;
    }
    const keys = Object.keys(obj);
    if (keys.length === 1 && keys[0] === 'current') {
        return true;
    }
    if (keys.length === 2 && keys.includes('current') && keys.includes('__zenith_ref')) {
        return true;
    }
    return false;
}

function _isPlainObject(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        return false;
    }
    const proto = Object.getPrototypeOf(value);
    return proto === Object.prototype || proto === null;
}

function _isHydrationFreezableContainer(value) {
    if (Array.isArray(value)) return true;
    if (!_isPlainObject(value)) return false;

    if (_isHydrationRefObject(value)) {
        return false;
    }
    if (typeof value.get === 'function' && typeof value.subscribe === 'function') {
        return false;
    }
    return true;
}
