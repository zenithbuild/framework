export function _validatePayload(payload) {
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
        _assertValidSourceSpan(expression.source, `expression[${i}]`);
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
        _assertValidSourceSpan(marker.source, `marker[${i}]`);
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
        _assertValidSourceSpan(eventBinding.source, `event[${i}]`);
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
        _assertValidSourceSpan(refBinding.source, `ref[${i}]`);
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
        if (component.props !== undefined) {
            if (!Array.isArray(component.props)) {
                throw new Error(`[Zenith Runtime] component at position ${i} requires props to be an array`);
            }
            for (let j = 0; j < component.props.length; j++) {
                const prop = component.props[j];
                if (!prop || typeof prop !== 'object' || Array.isArray(prop)) {
                    throw new Error(`[Zenith Runtime] component prop at position ${j} for component ${i} must be an object`);
                }
                if (typeof prop.name !== 'string' || prop.name.length === 0) {
                    throw new Error(`[Zenith Runtime] component prop at position ${j} for component ${i} requires a non-empty name`);
                }
                if (prop.type !== 'static' && prop.type !== 'signal') {
                    throw new Error(`[Zenith Runtime] component prop "${prop.name}" for component ${i} has unsupported type "${prop.type}"`);
                }
                if (prop.type === 'static' && !Object.prototype.hasOwnProperty.call(prop, 'value')) {
                    throw new Error(`[Zenith Runtime] component prop "${prop.name}" for component ${i} requires a value`);
                }
                if (prop.type === 'signal' && (!Number.isInteger(prop.index) || prop.index < 0)) {
                    throw new Error(`[Zenith Runtime] component prop "${prop.name}" for component ${i} requires a valid signal index`);
                }
            }
        }
        _assertValidSourceSpan(component.source, `component[${i}]`);
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

function _assertValidSourceSpan(source, contextLabel) {
    if (source === undefined || source === null) {
        return;
    }
    if (!source || typeof source !== 'object' || Array.isArray(source)) {
        throw new Error(`[Zenith Runtime] ${contextLabel}.source must be an object`);
    }
    if (typeof source.file !== 'string' || source.file.length === 0) {
        throw new Error(`[Zenith Runtime] ${contextLabel}.source.file must be a non-empty string`);
    }
    const points = ['start', 'end'];
    for (let i = 0; i < points.length; i++) {
        const point = source[points[i]];
        if (point === undefined || point === null) {
            continue;
        }
        if (!point || typeof point !== 'object' || Array.isArray(point)) {
            throw new Error(`[Zenith Runtime] ${contextLabel}.source.${points[i]} must be an object`);
        }
        if (!Number.isInteger(point.line) || point.line < 1) {
            throw new Error(`[Zenith Runtime] ${contextLabel}.source.${points[i]}.line must be >= 1`);
        }
        if (!Number.isInteger(point.column) || point.column < 1) {
            throw new Error(`[Zenith Runtime] ${contextLabel}.source.${points[i]}.column must be >= 1`);
        }
    }
    if (source.snippet !== undefined && source.snippet !== null && typeof source.snippet !== 'string') {
        throw new Error(`[Zenith Runtime] ${contextLabel}.source.snippet must be a string when provided`);
    }
}

export function _resolveComponentProps(propTable, signalMap, context = {}) {
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



export function _deepFreezePayload(obj) {
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

export function _isHydrationRefObject(obj) {
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

export function _isPlainObject(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        return false;
    }
    const proto = Object.getPrototypeOf(value);
    return proto === Object.prototype || proto === null;
}

export function _isHydrationFreezableContainer(value) {
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
