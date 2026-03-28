import { throwZenithRuntimeError, DOCS_LINKS } from './diagnostics.js';
import { _fragment } from './markup.js';

export const UNRESOLVED_LITERAL = Symbol('unresolved_literal');

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
    if (binding.fn_index != null && binding.fn_index !== undefined) {
        const fns = Array.isArray(exprFns) ? exprFns : [];
        const fn = fns[binding.fn_index];
        if (typeof fn === 'function') {
            try {
                return fn({
                    signalMap,
                    params,
                    ssrData,
                    props: props || {},
                    componentBindings,
                    fragment: _fragment
                });
            } catch (fnErr) {
                throw fnErr;
            }
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

            // 1. Static primitives (true, false, null, undefined, numbers, quoted strings)
            const primitiveValue = _resolvePrimitiveLiteral(trimmedLiteral);
            if (primitiveValue !== UNRESOLVED_LITERAL) {
                return primitiveValue;
            }

            // 2. Canonical payload roots
            if (trimmedLiteral === 'data' || trimmedLiteral === 'ssr') {
                return ssrData;
            }
            if (trimmedLiteral === 'params') {
                return params;
            }
            if (trimmedLiteral === 'props') {
                return props || {};
            }

            // 3. Bounded canonical member chains (props.*, params.*, data.*, ssr.*, exact stateKeys)
            const strictMemberValue = _resolveStrictMemberChainLiteral(
                trimmedLiteral,
                stateValues,
                stateKeys,
                params,
                ssrData,
                mode,
                props,
                binding.marker_index,
                _resolveBindingSource(binding, markerBinding, eventBinding)
            );
            if (strictMemberValue !== UNRESOLVED_LITERAL) {
                return strictMemberValue;
            }

            // 4. Anything else is a literal that was not lowered by the compiler.
            //    No heuristic guessing, no identifier extraction, no alias recovery.
            throwZenithRuntimeError({
                phase: 'bind',
                code: 'EXPRESSION_NOT_LOWERED',
                message: `Expression literal was not lowered by the compiler: ${_truncateLiteralForError(trimmedLiteral)}`,
                marker: {
                    type: _markerTypeForError(mode),
                    id: binding.marker_index
                },
                path: `expression[${binding.marker_index}]`,
                hint: 'This expression must be lowered to fn_index, signal_index, or state_index by the compiler. Literal string interpretation is restricted to static primitives and canonical member chains (props.*, params.*, data.*, ssr.*).',
                docsLink: DOCS_LINKS.expressionScope,
                source: _resolveBindingSource(binding, markerBinding, eventBinding)
            });
        }
        return binding.literal;
    }

    return '';
}

export function _throwUnresolvedMemberChainError(literal, markerIndex, mode, pathSuffix, hint, source) {
    throwZenithRuntimeError({
        phase: 'bind',
        code: 'UNRESOLVED_EXPRESSION',
        message: `Failed to resolve expression literal: ${_truncateLiteralForError(literal)}`,
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

    // Primitives are handled by _resolvePrimitiveLiteral before this function
    if (literal === 'true' || literal === 'false' || literal === 'null' || literal === 'undefined') {
        return UNRESOLVED_LITERAL;
    }

    const segments = literal.split('.');
    const baseIdentifier = segments[0];

    // Bounded resolution: only canonical payload prefixes and exact state keys
    const isCanonicalBase = CANONICAL_MEMBER_CHAIN_BASES.has(baseIdentifier);
    const isExactStateKey = !isCanonicalBase && Array.isArray(stateKeys) && stateKeys.includes(baseIdentifier);

    if (!isCanonicalBase && !isExactStateKey) {
        // Not a canonical base and not an exact state key — this literal was not lowered
        return UNRESOLVED_LITERAL;
    }

    const scope = _buildLiteralScope(stateValues, stateKeys, params, ssrData, mode, props);

    if (!Object.prototype.hasOwnProperty.call(scope, baseIdentifier)) {
        _throwUnresolvedMemberChainError(
            literal,
            markerIndex,
            mode,
            `expression.${baseIdentifier}`,
            `Base identifier "${baseIdentifier}" is not bound. Check props/data/params and declared state keys.`,
            source
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
                hint: 'Property access to __proto__, prototype, and constructor is forbidden.',
                docsLink: DOCS_LINKS.expressionScope,
                source
            });
        }

        if (cursor === null || cursor === undefined) {
            _throwUnresolvedMemberChainError(
                literal,
                markerIndex,
                mode,
                `expression.${traversedPath}.${segment}`,
                `Cannot read "${segment}" from ${traversedPath} because it is null or undefined.`,
                source
            );
        }

        const cursorType = typeof cursor;
        if (cursorType !== 'object' && cursorType !== 'function') {
            _throwUnresolvedMemberChainError(
                literal,
                markerIndex,
                mode,
                `expression.${traversedPath}.${segment}`,
                `Cannot read "${segment}" from ${traversedPath} because it resolved to a ${cursorType}.`,
                source
            );
        }

        if (!Object.prototype.hasOwnProperty.call(cursor, segment)) {
            _throwUnresolvedMemberChainError(
                literal,
                markerIndex,
                mode,
                `expression.${traversedPath}.${segment}`,
                `Missing member "${segment}" on ${traversedPath}. Check your bindings.`,
                source
            );
        }

        cursor = cursor[segment];
        traversedPath = `${traversedPath}.${segment}`;
    }

    return cursor;
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

export function _buildLiteralScope(stateValues, stateKeys, params, ssrData, mode, props) {
    const scope = Object.create(null);
    scope.params = params;
    scope.data = ssrData;
    scope.ssr = ssrData;
    scope.props = props || {};
    scope.__zenith_fragment = _fragment;

    // Exact state keys only — no alias derivation, no mangled-name recovery
    if (Array.isArray(stateKeys)) {
        for (let i = 0; i < stateKeys.length; i++) {
            const key = stateKeys[i];
            if (typeof key !== 'string' || key.length === 0) {
                continue;
            }
            if (Object.prototype.hasOwnProperty.call(scope, key)) {
                continue;
            }
            scope[key] = stateValues[i];
        }
    }

    return scope;
}

// _isLikelyExpressionLiteral and _extractMissingIdentifier removed:
// Runtime no longer performs heuristic identifier extraction or expression
// shape guessing. Unresolved literals throw EXPRESSION_NOT_LOWERED directly.

export function _resolveBindingSource(binding, markerBinding, eventBinding) {
    const candidates = [
        binding?.source,
        eventBinding?.source,
        markerBinding?.source
    ];
    for (let i = 0; i < candidates.length; i++) {
        const candidate = candidates[i];
        if (candidate && typeof candidate === 'object' && typeof candidate.file === 'string') {
            return candidate;
        }
    }
    return undefined;
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
        .replace(/\/Users\/[^\s"'`]+/g, '<path>')
        .replace(/\/home\/[^\s"'`]+/g, '<path>')
        .replace(/\/private\/[^\s"'`]+/g, '<path>')
        .replace(/\/tmp\/[^\s"'`]+/g, '<path>')
        .replace(/\/var\/folders\/[^\s"'`]+/g, '<path>');
    return sanitized.length > 100 ? `${sanitized.substring(0, 97)}...` : sanitized;
}
