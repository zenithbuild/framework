export function _validatePayload(payload) {
    _ar(payload, 'hydrate(payload) requires an object payload');
    if (payload.ir_version !== 1) {
        _pe('unsupported ir_version (expected 1)');
    }

    const root = payload.root;
    if (!root || typeof root.querySelectorAll !== 'function') {
        _pe('hydrate(payload) requires payload.root with querySelectorAll');
    }

    const expressions = _aa(payload.expressions, 'hydrate(payload) requires expressions[]');
    const markers = _aa(payload.markers, 'hydrate(payload) requires markers[]');
    const events = _aa(payload.events, 'hydrate(payload) requires events[]');
    const stateValues = _aa(payload.state_values, 'hydrate(payload) requires state_values[]');
    const signals = _aa(payload.signals, 'hydrate(payload) requires signals[]');

    const refs = Array.isArray(payload.refs) ? payload.refs : [];
    const stateKeys = Array.isArray(payload.state_keys) ? payload.state_keys : [];
    const components = Array.isArray(payload.components) ? payload.components : [];
    const params = payload.params && typeof payload.params === 'object'
        ? payload.params
        : {};
    const ssrData = payload.ssr_data && typeof payload.ssr_data === 'object'
        ? payload.ssr_data
        : {};
    const exprFns = Array.isArray(payload.expr_fns) ? payload.expr_fns : [];

    for (let i = 0; i < stateKeys.length; i++) {
        if (typeof stateKeys[i] !== 'string') {
            _pe(`state_keys[${i}] must be a string`);
        }
    }

    if (markers.length !== expressions.length) {
        _pe(`marker/expression mismatch: markers=${markers.length}, expressions=${expressions.length}`);
    }

    for (let i = 0; i < expressions.length; i++) {
        const expression = expressions[i];
        _ar(expression, `expression at position ${i} must be an object`);
        _air(
            expression.marker_index,
            expressions.length,
            `expression at position ${i} has invalid marker_index`
        );
        if (expression.marker_index !== i) {
            _pe(`expression table out of order at position ${i}: marker_index=${expression.marker_index}`);
        }
        if (expression.fn_index != null) {
            _ani(
                expression.fn_index,
                `expression at position ${i} has invalid fn_index`
            );
        }
        _assertValidSourceSpan(expression.source, `expression[${i}]`);
        if (expression.signal_indices !== undefined) {
            if (!Array.isArray(expression.signal_indices)) {
                _pe(`expression at position ${i} must provide signal_indices[]`);
            }
            for (let j = 0; j < expression.signal_indices.length; j++) {
                _ani(
                    expression.signal_indices[j],
                    `expression at position ${i} has invalid signal_indices[${j}]`
                );
            }
        }
    }

    for (let i = 0; i < markers.length; i++) {
        const marker = markers[i];
        _ar(marker, `marker at position ${i} must be an object`);
        _air(
            marker.index,
            expressions.length,
            `marker at position ${i} has out-of-bounds index`
        );
        if (marker.index !== i) {
            _pe(`marker table out of order at position ${i}: index=${marker.index}`);
        }
        if (marker.kind !== 'text' && marker.kind !== 'attr' && marker.kind !== 'event') {
            _pe(`marker at position ${i} has invalid kind`);
        }
        _as(marker.selector, `marker at position ${i} requires selector`);
        if (marker.kind === 'attr') {
            _as(marker.attr, `attr marker at position ${i} requires attr name`);
        }
        _assertValidSourceSpan(marker.source, `marker[${i}]`);
    }

    for (let i = 0; i < events.length; i++) {
        const eventBinding = events[i];
        _ar(eventBinding, `event binding at position ${i} must be an object`);
        _air(
            eventBinding.index,
            expressions.length,
            `event binding at position ${i} has out-of-bounds index`
        );
        _as(eventBinding.event, `event binding at position ${i} requires event name`);
        _as(eventBinding.selector, `event binding at position ${i} requires selector`);
        _assertValidSourceSpan(eventBinding.source, `event[${i}]`);
    }

    for (let i = 0; i < refs.length; i++) {
        const refBinding = refs[i];
        _ar(refBinding, `ref binding at position ${i} must be an object`);
        _ani(refBinding.index, `ref binding at position ${i} requires non-negative index`);
        _air(
            refBinding.state_index,
            stateValues.length,
            `ref binding at position ${i} has out-of-bounds state_index`
        );
        _as(refBinding.selector, `ref binding at position ${i} requires selector`);
        _assertValidSourceSpan(refBinding.source, `ref[${i}]`);
        const candidate = stateValues[refBinding.state_index];
        if (!candidate || typeof candidate !== 'object' || !Object.prototype.hasOwnProperty.call(candidate, 'current')) {
            _pe(`ref binding at position ${i} must resolve to a ref-like object`);
        }
    }

    for (let i = 0; i < signals.length; i++) {
        const signalDescriptor = signals[i];
        _ar(signalDescriptor, `signal descriptor at position ${i} must be an object`);
        if (signalDescriptor.kind !== 'signal') {
            _pe(`signal descriptor at position ${i} requires kind="signal"`);
        }
        _ani(
            signalDescriptor.id,
            `signal descriptor at position ${i} requires non-negative id`
        );
        if (signalDescriptor.id !== i) {
            _pe(`signal table out of order at position ${i}: id=${signalDescriptor.id}`);
        }
        _air(
            signalDescriptor.state_index,
            stateValues.length,
            `signal descriptor at position ${i} has out-of-bounds state_index`
        );
    }

    for (let i = 0; i < components.length; i++) {
        const component = components[i];
        _ar(component, `component at position ${i} must be an object`);
        _as(component.instance, `component at position ${i} requires instance`);
        _as(component.selector, `component at position ${i} requires selector`);
        if (typeof component.create !== 'function') {
            _pe(`component at position ${i} requires create() function`);
        }
        if (component.props !== undefined) {
            if (!Array.isArray(component.props)) {
                _pe(`component at position ${i} requires props to be an array`);
            }
            for (let j = 0; j < component.props.length; j++) {
                _avp(component.props[j], j, i);
            }
        }
        _assertValidSourceSpan(component.source, `component[${i}]`);
    }

    if (payload.params !== undefined && !_ir(payload.params)) {
        _pe('hydrate() requires params object');
    }
    if (payload.ssr_data !== undefined && !_ir(payload.ssr_data)) {
        _pe('hydrate() requires ssr_data object');
    }

    const props = _ir(payload.props) ? payload.props : {};
    return {
        root,
        expressions,
        markers,
        events,
        refs,
        stateValues,
        stateKeys,
        signals,
        components,
        params: _f(params),
        ssrData: _f(ssrData),
        props: _f(props),
        exprFns: _f(exprFns)
    };
}

export function readSsrPayload(raw) {
    const root = _ir(raw) ? raw : {};
    return {
        route: root,
        scoped: _ir(root.scoped) ? root.scoped : {}
    };
}

function _assertValidSourceSpan(source, contextLabel) {
    if (source === undefined || source === null) {
        return;
    }
    _ar(source, `${contextLabel}.source must be an object`);
    _as(source.file, `${contextLabel}.source.file must be a non-empty string`);
    const points = ['start', 'end'];
    for (let i = 0; i < points.length; i++) {
        const point = source[points[i]];
        if (point === undefined || point === null) {
            continue;
        }
        _ar(point, `${contextLabel}.source.${points[i]} must be an object`);
        _api(point.line, `${contextLabel}.source.${points[i]}.line must be >= 1`);
        _api(point.column, `${contextLabel}.source.${points[i]}.column must be >= 1`);
    }
    if (source.snippet !== undefined && source.snippet !== null && typeof source.snippet !== 'string') {
        _pe(`${contextLabel}.source.snippet must be a string when provided`);
    }
}

export function _resolveComponentProps(propTable, signalMap) {
    if (!Array.isArray(propTable)) {
        _pe('component props must be an array');
    }
    const resolved = Object.create(null);
    for (let i = 0; i < propTable.length; i++) {
        const descriptor = propTable[i];
        const name = descriptor.name;
        if (Object.prototype.hasOwnProperty.call(resolved, descriptor.name)) {
            _pe(`duplicate component prop "${name}"`);
        }
        if (descriptor.type === 'static') {
            resolved[name] = descriptor.value;
            continue;
        }
        if (descriptor.type === 'signal') {
            const signalValue = signalMap.get(descriptor.index);
            if (!signalValue || typeof signalValue.get !== 'function') {
                _pe(`signal index ${descriptor.index} did not resolve`);
            }
            resolved[name] = signalValue;
            continue;
        }
        _pe(`unsupported component prop type "${descriptor.type}" for "${name}"`);
    }
    return resolved;
}

function _pe(message) {
    throw new Error(`[Zenith Runtime] ${message}`);
}

function _ir(value) {
    return !!value && typeof value === 'object' && !Array.isArray(value);
}

function _ar(value, message) {
    if (!_ir(value)) {
        _pe(message);
    }
}

function _as(value, message) {
    if (typeof value !== 'string' || value.length === 0) {
        _pe(message);
    }
}

function _ani(value, message) {
    if (!Number.isInteger(value) || value < 0) {
        _pe(message);
    }
}

function _api(value, message) {
    if (!Number.isInteger(value) || value < 1) {
        _pe(message);
    }
}

function _air(value, limit, message) {
    if (!Number.isInteger(value) || value < 0 || value >= limit) {
        _pe(message);
    }
}

function _aa(value, message) {
    if (!Array.isArray(value)) {
        _pe(message);
    }
    return value;
}

function _f(value) {
    return Object.freeze(value);
}

function _avp(prop, propIndex, componentIndex) {
    _ar(prop, `component prop at position ${propIndex} for component ${componentIndex} must be an object`);
    _as(
        prop.name,
        `component prop at position ${propIndex} for component ${componentIndex} requires a non-empty name`
    );
    if (prop.type !== 'static' && prop.type !== 'signal') {
        _pe(
            `component prop "${prop.name}" for component ${componentIndex} has unsupported type "${prop.type}"`
        );
    }
    if (prop.type === 'static' && !Object.prototype.hasOwnProperty.call(prop, 'value')) {
        _pe(`component prop "${prop.name}" for component ${componentIndex} requires a value`);
    }
    if (prop.type === 'signal') {
        _ani(
            prop.index,
            `component prop "${prop.name}" for component ${componentIndex} requires a valid signal index`
        );
    }
}
export function _deepFreezePayload(obj) {
    if (!_isHydrationFreezableContainer(obj) || Object.isFrozen(obj)) return;

    Object.freeze(obj);
    const keys = Object.keys(obj);
    for (let i = 0; i < keys.length; i++) {
        const val = obj[keys[i]];
        if (val && typeof val === 'object') {
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
