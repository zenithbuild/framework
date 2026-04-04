import { throwZenithRuntimeError, DOCS_LINKS } from './diagnostics.js';
import { _fragment } from './markup.js';

export const UNRESOLVED_LITERAL = Symbol('unresolved_literal');
const OWN = Object.prototype.hasOwnProperty;

export const STRICT_MEMBER_CHAIN_LITERAL_RE = /^(?:true|false|null|undefined|[A-Za-z_$][A-Za-z0-9_$]*(\.[A-Za-z_$][A-Za-z0-9_$]*)*)$/;
export const CANONICAL_MEMBER_CHAIN_BASES = new Set(['props', 'params', 'data', 'ssr']);
export const UNSAFE_MEMBER_KEYS = new Set(['__proto__', 'prototype', 'constructor']);
export function _resolveExpressionSignalIndices(binding) {
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

export function _evaluateExpression(
    binding,
    stateValues,
    stateKeys,
    signalMap,
    componentBindings,
    params,
    ssrData,
    mode,
    props,
    exprFns,
    markerBinding = null,
    eventBinding = null
) {
    const runtimeProps = props || {};
    if (binding.fn_index != null) {
        const fn = Array.isArray(exprFns) ? exprFns[binding.fn_index] : undefined;
        if (typeof fn === 'function') {
            return fn({
                signalMap,
                params,
                ssrData,
                props: runtimeProps,
                componentBindings,
                fragment: _fragment
            });
        }
    }
    if (binding.signal_index != null) {
        const signalValue = signalMap.get(binding.signal_index);
        if (!signalValue || typeof signalValue.get !== 'function') {
            throw new Error('[Zenith Runtime] expression.signal_index did not resolve to a signal');
        }
        return _rvm(signalValue, mode);
    }

    if (binding.state_index != null) {
        return _rvm(stateValues[binding.state_index], mode);
    }

    if (typeof binding.component_instance === 'string' && typeof binding.component_binding === 'string') {
        return _rvm(
            _rcb(binding, componentBindings),
            mode
        );
    }

    if (binding.literal == null) {
        return '';
    }
    if (typeof binding.literal !== 'string') {
        return binding.literal;
    }
    const trimmedLiteral = binding.literal.trim();
    const primitiveValue = _resolvePrimitiveLiteral(trimmedLiteral);
    if (primitiveValue !== UNRESOLVED_LITERAL) {
        return primitiveValue;
    }
    const canonicalRootValue = _rcr(trimmedLiteral, params, ssrData, runtimeProps);
    if (canonicalRootValue !== UNRESOLVED_LITERAL) {
        return canonicalRootValue;
    }
    const source = _resolveBindingSource(binding, markerBinding, eventBinding);
    const strictMemberValue = _resolveStrictMemberChainLiteral(
        trimmedLiteral,
        stateValues,
        stateKeys,
        params,
        ssrData,
        mode,
        runtimeProps,
        binding.marker_index,
        source
    );
    if (strictMemberValue !== UNRESOLVED_LITERAL) {
        return strictMemberValue;
    }
    _tenl(trimmedLiteral, binding.marker_index, mode, source);
}

export function _throwUnresolvedMemberChainError(literal, markerIndex, mode, pathSuffix, hint, source) {
    throwZenithRuntimeError({
        phase: 'bind',
        code: 'UNRESOLVED_EXPRESSION',
        message: `Failed to resolve literal: ${_truncateLiteralForError(literal)}`,
        marker: {
            type: _markerTypeForError(mode),
            id: markerIndex
        },
        path: `marker[${markerIndex}].${pathSuffix}`,
        hint,
        docsLink: DOCS_LINKS.expressionScope,
        source
    });
}

export function _resolveStrictMemberChainLiteral(
    literal,
    stateValues,
    stateKeys,
    params,
    ssrData,
    mode,

    props,
    markerIndex,
    source
) {
    if (typeof literal !== 'string' || !STRICT_MEMBER_CHAIN_LITERAL_RE.test(literal)) {
        return UNRESOLVED_LITERAL;
    }
    if (literal === 'true' || literal === 'false' || literal === 'null' || literal === 'undefined') {
        return UNRESOLVED_LITERAL;
    }

    const segments = literal.split('.');
    const baseIdentifier = segments[0];
    const baseValue = _resolveStrictBase(baseIdentifier, stateValues, stateKeys, params, ssrData, props);
    if (baseValue === UNRESOLVED_LITERAL) {
        return UNRESOLVED_LITERAL;
    }
    const failResolve = (suffix, hint) => _throwUnresolvedMemberChainError(
        literal,
        markerIndex,
        mode,
        `expression.${suffix}`,
        hint,
        source
    );
    let cursor = baseValue;
    let traversedPath = baseIdentifier;

    for (let i = 1; i < segments.length; i++) {
        const segment = segments[i];
        if (UNSAFE_MEMBER_KEYS.has(segment)) {
            _tuma(literal, markerIndex, segment, source);
        }
        if (cursor === null || cursor === undefined) {
            failResolve(`${traversedPath}.${segment}`, `Cannot read "${segment}" from ${traversedPath}; value is null/undefined.`);
        }
        const cursorType = typeof cursor;
        if (cursorType !== 'object' && cursorType !== 'function') {
            failResolve(`${traversedPath}.${segment}`, `Cannot read "${segment}" from ${traversedPath}; value is ${cursorType}.`);
        }
        if (!OWN.call(cursor, segment)) {
            failResolve(`${traversedPath}.${segment}`, `Missing member "${segment}" on ${traversedPath}.`);
        }
        cursor = cursor[segment];
        traversedPath = `${traversedPath}.${segment}`;
    }

    return cursor;
}

function _resolveStrictBase(baseIdentifier, stateValues, stateKeys, params, ssrData, props) {
    if (baseIdentifier === '__zenith_fragment') return _fragment;
    if (CANONICAL_MEMBER_CHAIN_BASES.has(baseIdentifier)) {
        if (baseIdentifier === 'props') return props || {};
        if (baseIdentifier === 'params') return params;
        return ssrData;
    }
    if (!Array.isArray(stateKeys)) return UNRESOLVED_LITERAL;
    const stateIndex = stateKeys.indexOf(baseIdentifier);
    return stateIndex === -1 ? UNRESOLVED_LITERAL : stateValues[stateIndex];
}

export function _resolvePrimitiveLiteral(literal) {
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

export function _resolveBindingSource(binding, markerBinding, eventBinding) {
    const source = binding?.source;
    if (_isSourceSpan(source)) return source;
    const eventSource = eventBinding?.source;
    if (_isSourceSpan(eventSource)) return eventSource;
    const markerSource = markerBinding?.source;
    if (_isSourceSpan(markerSource)) return markerSource;
    return undefined;
}

function _isSourceSpan(value) {
    return Boolean(value) && typeof value === 'object' && typeof value.file === 'string';
}

export function _describeBindingExpression(binding) {
    if (!binding || typeof binding !== 'object') {
        return '<unknown>';
    }
    if (typeof binding.literal === 'string' && binding.literal.trim().length > 0) {
        return _truncateLiteralForError(binding.literal.trim());
    }
    if (Number.isInteger(binding.state_index)) {
        return `state[${binding.state_index}]`;
    }
    if (Number.isInteger(binding.signal_index)) {
        return `signal[${binding.signal_index}]`;
    }
    if (typeof binding.component_instance === 'string' && typeof binding.component_binding === 'string') {
        return `${binding.component_instance}.${binding.component_binding}`;
    }
    return '<unknown expression>';
}

export function _markerTypeForError(kind) {
    if (kind === 'text') return 'data-zx-e';
    if (kind === 'attr') return 'data-zx-attr';
    if (kind === 'event') return 'data-zx-on';
    return kind;
}

export function _truncateLiteralForError(str) {
    if (typeof str !== 'string') return String(str);
    const sanitized = str
        .replace(/[A-Za-z]:\\[^\s"'`]+/g, '<path>')
        .replace(/\/(?:Users|home|private|tmp|var\/folders)\/[^\s"'`]+/g, '<path>');
    return sanitized.length > 100 ? `${sanitized.substring(0, 97)}...` : sanitized;
}

function _rvm(value, mode) {
    if (mode === 'event') {
        return value;
    }
    if (value && typeof value === 'object' && typeof value.get === 'function') {
        return value.get();
    }
    if (typeof value === 'function') {
        return value();
    }
    return value;
}

function _rcb(binding, componentBindings) {
    const instanceBindings = componentBindings[binding.component_instance];
    if (!instanceBindings || !OWN.call(instanceBindings, binding.component_binding)) {
        return undefined;
    }
    return instanceBindings[binding.component_binding];
}

function _rcr(literal, params, ssrData, props) {
    if (literal === 'data' || literal === 'ssr') return ssrData;
    if (literal === 'params') return params;
    if (literal === 'props') return props;
    return UNRESOLVED_LITERAL;
}

function _tenl(literal, markerIndex, mode, source) {
    throwZenithRuntimeError({
        phase: 'bind',
        code: 'EXPRESSION_NOT_LOWERED',
        message: `Expression literal was not lowered by the compiler: ${_truncateLiteralForError(literal)}`,
        marker: {
            type: _markerTypeForError(mode),
            id: markerIndex
        },
        path: `expression[${markerIndex}]`,
        hint: 'Lower expression to fn_index/signal_index/state_index.',
        docsLink: DOCS_LINKS.expressionScope,
        source
    });
}

function _tuma(literal, markerIndex, member, source) {
    throwZenithRuntimeError({
        phase: 'bind',
        code: 'UNSAFE_MEMBER_ACCESS',
        message: `Blocked unsafe member access: ${member} in path "${literal}"`,
        path: `marker[${markerIndex}].expression.${literal}`,
        hint: 'Property access to __proto__/prototype/constructor is forbidden.',
        docsLink: DOCS_LINKS.expressionScope,
        source
    });
}
