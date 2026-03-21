import { rewritePropsExpression } from './scoped-identifier-rewrite.js';
import { resolveStateKeyFromBindings } from './expression-rewrites.js';

/**
 * @param {object} pageIr
 * @param {Set<string> | null} [preferredKeys]
 */
export function rewriteRefBindingIdentifiers(pageIr, preferredKeys = null) {
    if (!Array.isArray(pageIr?.ref_bindings) || pageIr.ref_bindings.length === 0) {
        return;
    }

    const stateBindings = Array.isArray(pageIr?.hoisted?.state) ? pageIr.hoisted.state : [];
    if (stateBindings.length === 0) {
        return;
    }

    for (const binding of pageIr.ref_bindings) {
        if (!binding || typeof binding !== 'object' || typeof binding.identifier !== 'string') {
            continue;
        }
        const resolved = resolveStateKeyFromBindings(binding.identifier, stateBindings, preferredKeys);
        if (resolved) {
            binding.identifier = resolved;
        }
    }
}

/**
 * @param {object} pageIr
 * @param {Map<string, string>} expressionMap
 * @param {Map<string, object>} bindingMap
 * @param {Set<string>} ambiguous
 */
export function applyExpressionRewrites(pageIr, expressionMap, bindingMap, ambiguous) {
    if (!Array.isArray(pageIr?.expressions) || pageIr.expressions.length === 0) {
        return;
    }
    const bindings = Array.isArray(pageIr.expression_bindings) ? pageIr.expression_bindings : [];

    for (let index = 0; index < pageIr.expressions.length; index++) {
        const current = pageIr.expressions[index];
        if (typeof current !== 'string' || ambiguous.has(current)) {
            continue;
        }

        const rewritten = expressionMap.get(current);
        const rewrittenBinding = bindingMap.get(current);
        if (rewritten && rewritten !== current) {
            pageIr.expressions[index] = rewritten;
        }

        if (!bindings[index] || typeof bindings[index] !== 'object') {
            continue;
        }
        if (rewritten && rewritten !== current && bindings[index].literal === current) {
            bindings[index].literal = rewritten;
        }
        if (rewrittenBinding) {
            bindings[index].compiled_expr = rewrittenBinding.compiled_expr;
            bindings[index].signal_index = rewrittenBinding.signal_index;
            bindings[index].signal_indices = rewrittenBinding.signal_indices;
            bindings[index].state_index = rewrittenBinding.state_index;
            bindings[index].component_instance = rewrittenBinding.component_instance;
            bindings[index].component_binding = rewrittenBinding.component_binding;
        } else if (rewritten && rewritten !== current && bindings[index].compiled_expr === current) {
            bindings[index].compiled_expr = rewritten;
        }

        if (
            !rewrittenBinding &&
            (!rewritten || rewritten === current) &&
            bindings[index].literal === current &&
            bindings[index].compiled_expr === current
        ) {
            bindings[index].compiled_expr = current;
        }
    }
}

/**
 * @param {object} pageIr
 * @param {object} scopeRewrite
 * @param {Record<string, number> | null} [scopedMetrics]
 */
export function applyScopedIdentifierRewrites(pageIr, scopeRewrite, scopedMetrics = null) {
    if (!Array.isArray(pageIr?.expressions) || pageIr.expressions.length === 0) {
        return;
    }
    const bindings = Array.isArray(pageIr.expression_bindings) ? pageIr.expression_bindings : [];
    const scopeMap = scopeRewrite?.map instanceof Map ? scopeRewrite.map : null;
    const scopeAmbiguous = scopeRewrite?.ambiguous instanceof Set ? scopeRewrite.ambiguous : null;
    const scopeCandidates = scopeMap instanceof Map
        ? new Set(
            [...scopeMap.keys()].filter(
                (identifier) => typeof identifier === 'string'
                    && identifier.length > 0
                    && !(scopeAmbiguous instanceof Set && scopeAmbiguous.has(identifier))
            )
        )
        : null;
    const rewriteContext = { scopeRewrite };
    const rewriteCache = new Map();

    const shouldCheckIdentifierCandidate = (charCode, isStart) => {
        if (charCode === 36 || charCode === 95) return true;
        if (charCode >= 65 && charCode <= 90) return true;
        if (charCode >= 97 && charCode <= 122) return true;
        if (!isStart && charCode >= 48 && charCode <= 57) return true;
        return false;
    };

    const canSkipScopedRewrite = (value) => {
        if (!(scopeCandidates instanceof Set) || scopeCandidates.size === 0) {
            return true;
        }
        let token = '';
        for (let index = 0; index < value.length; index++) {
            const charCode = value.charCodeAt(index);
            if (shouldCheckIdentifierCandidate(charCode, token.length === 0)) {
                token += value[index];
                continue;
            }
            if (token.length > 0) {
                if (scopeCandidates.has(token)) {
                    return false;
                }
                token = '';
            }
        }
        return token.length > 0 ? !scopeCandidates.has(token) : true;
    };

    const addScopedMetric = (key, value) => {
        if (!scopedMetrics || typeof scopedMetrics !== 'object' || !Number.isFinite(value)) {
            return;
        }
        scopedMetrics[key] = (scopedMetrics[key] || 0) + value;
    };

    const rewriteScoped = (value) => {
        if (typeof value !== 'string') {
            return value;
        }
        addScopedMetric('totalValues', 1);
        const cached = rewriteCache.get(value);
        if (typeof cached === 'string') {
            addScopedMetric('cacheHitCount', 1);
            return cached;
        }
        addScopedMetric('cacheMissCount', 1);
        const missStartedAt = performance.now();
        const identifierCheckStartedAt = performance.now();
        const shouldSkip = canSkipScopedRewrite(value);
        const identifierCheckMs = performance.now() - identifierCheckStartedAt;
        addScopedMetric('identifierCheckMs', identifierCheckMs);
        if (shouldSkip) {
            addScopedMetric('fastSkipCount', 1);
            addScopedMetric('fastSkipMs', identifierCheckMs);
            rewriteCache.set(value, value);
            addScopedMetric('unchangedMissCount', 1);
            addScopedMetric('cacheMissMs', performance.now() - missStartedAt);
            return value;
        }

        const rewriteCallStartedAt = performance.now();
        const rewritten = rewritePropsExpression(value, rewriteContext);
        addScopedMetric('rewriteCallMs', performance.now() - rewriteCallStartedAt);
        addScopedMetric(rewritten === value ? 'unchangedMissCount' : 'changedMissCount', 1);
        addScopedMetric('cacheMissMs', performance.now() - missStartedAt);
        rewriteCache.set(value, rewritten);
        return rewritten;
    };

    for (let index = 0; index < pageIr.expressions.length; index++) {
        const current = pageIr.expressions[index];
        if (typeof current === 'string') {
            pageIr.expressions[index] = rewriteScoped(current);
        }
        if (!bindings[index] || typeof bindings[index] !== 'object') {
            continue;
        }
        if (typeof bindings[index].literal === 'string') {
            bindings[index].literal = rewriteScoped(bindings[index].literal);
        }
        if (typeof bindings[index].compiled_expr === 'string') {
            bindings[index].compiled_expr = rewriteScoped(bindings[index].compiled_expr);
        }
    }
}

export function synthesizeSignalBackedCompiledExpressions(pageIr) {
    if (!Array.isArray(pageIr?.expression_bindings) || pageIr.expression_bindings.length === 0) {
        return;
    }

    const stateBindings = Array.isArray(pageIr?.hoisted?.state) ? pageIr.hoisted.state : [];
    const signals = Array.isArray(pageIr?.signals) ? pageIr.signals : [];
    if (stateBindings.length === 0 || signals.length === 0) {
        return;
    }

    const signalBackedStateIndices = new Set(
        signals
            .map((signal) => signal?.state_index)
            .filter((value) => Number.isInteger(value))
    );
    const signalIndexByStateKey = new Map();
    for (let index = 0; index < signals.length; index++) {
        const stateIndex = signals[index]?.state_index;
        const stateKey = Number.isInteger(stateIndex) ? stateBindings[stateIndex]?.key : null;
        if (typeof stateKey === 'string' && stateKey.length > 0) {
            signalIndexByStateKey.set(stateKey, index);
        }
    }
    if (signalIndexByStateKey.size === 0) {
        return;
    }

    for (let index = 0; index < pageIr.expression_bindings.length; index++) {
        const binding = pageIr.expression_bindings[index];
        if (!binding || typeof binding !== 'object') {
            continue;
        }
        if (typeof binding.compiled_expr === 'string' && binding.compiled_expr.includes('signalMap.get(')) {
            continue;
        }

        const candidate = typeof binding.literal === 'string' && binding.literal.trim().length > 0
            ? binding.literal
            : typeof pageIr.expressions?.[index] === 'string'
                ? pageIr.expressions[index]
                : null;
        if (typeof candidate !== 'string' || candidate.trim().length === 0) {
            continue;
        }
        if (
            Number.isInteger(binding.state_index) &&
            !signalBackedStateIndices.has(binding.state_index)
        ) {
            continue;
        }

        let rewritten = candidate;
        const signalIndices = [];
        for (const [stateKey, signalIndex] of signalIndexByStateKey.entries()) {
            if (!rewritten.includes(stateKey)) {
                continue;
            }
            const escaped = stateKey.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const pattern = new RegExp(`(?<!\\.)\\b${escaped}\\b`, 'g');
            if (!pattern.test(rewritten)) {
                continue;
            }
            rewritten = rewritten.replace(pattern, `signalMap.get(${signalIndex}).get()`);
            signalIndices.push(signalIndex);
        }

        if (rewritten === candidate || signalIndices.length === 0) {
            continue;
        }
        const uniqueSignalIndices = [...new Set(signalIndices)].sort((a, b) => a - b);
        binding.compiled_expr = rewritten;
        binding.signal_indices = uniqueSignalIndices;
        if (uniqueSignalIndices.length === 1) {
            binding.signal_index = uniqueSignalIndices[0];
            const stateIndex = signals[uniqueSignalIndices[0]]?.state_index;
            if (Number.isInteger(stateIndex)) {
                binding.state_index = stateIndex;
            }
        }
    }
}

export function normalizeExpressionBindingDependencies(pageIr) {
    if (!Array.isArray(pageIr?.expression_bindings) || pageIr.expression_bindings.length === 0) {
        return;
    }

    const signals = Array.isArray(pageIr.signals) ? pageIr.signals : [];
    const dependencyRe = /signalMap\.get\((\d+)\)/g;

    for (const binding of pageIr.expression_bindings) {
        if (!binding || typeof binding !== 'object' || typeof binding.compiled_expr !== 'string') {
            continue;
        }

        const indices = [];
        dependencyRe.lastIndex = 0;
        let match;
        while ((match = dependencyRe.exec(binding.compiled_expr)) !== null) {
            const index = Number.parseInt(match[1], 10);
            if (Number.isInteger(index)) {
                indices.push(index);
            }
        }

        if (indices.length === 0) {
            continue;
        }

        let signalIndices = [...new Set(indices)].sort((a, b) => a - b);
        if (Number.isInteger(binding.state_index)) {
            const owningSignalIndices = signals
                .map((signal, index) => signal?.state_index === binding.state_index ? index : null)
                .filter((value) => Number.isInteger(value));
            const extractedMatchState =
                signalIndices.length > 0 &&
                signalIndices.every((index) => signals[index]?.state_index === binding.state_index);
            if (owningSignalIndices.length > 0 && !extractedMatchState) {
                signalIndices = owningSignalIndices;
            }
        }

        if (
            !Array.isArray(binding.signal_indices) ||
            binding.signal_indices.length === 0 ||
            binding.signal_indices.some((index) => signals[index]?.state_index !== binding.state_index)
        ) {
            binding.signal_indices = signalIndices;
        }
        if (
            (!Number.isInteger(binding.signal_index) ||
                signals[binding.signal_index]?.state_index !== binding.state_index) &&
            signalIndices.length === 1
        ) {
            binding.signal_index = signalIndices[0];
        }
        if (!Number.isInteger(binding.state_index) && Number.isInteger(binding.signal_index)) {
            const stateIndex = signals[binding.signal_index]?.state_index;
            if (Number.isInteger(stateIndex)) {
                binding.state_index = stateIndex;
            }
        }
        if (signalIndices.length === 1) {
            binding.compiled_expr = binding.compiled_expr.replace(
                /signalMap\.get\(\d+\)/g,
                `signalMap.get(${signalIndices[0]})`
            );
        }
    }
}

const LEGACY_MARKUP_IDENT = 'zen' + 'html';
const LEGACY_MARKUP_RE = new RegExp(`\\b${LEGACY_MARKUP_IDENT}\\b`, 'g');

export function rewriteLegacyMarkupIdentifiers(pageIr) {
    if (!Array.isArray(pageIr?.expressions) || pageIr.expressions.length === 0) {
        return;
    }
    const bindings = Array.isArray(pageIr.expression_bindings) ? pageIr.expression_bindings : [];

    for (let i = 0; i < pageIr.expressions.length; i++) {
        if (typeof pageIr.expressions[i] === 'string' && pageIr.expressions[i].includes(LEGACY_MARKUP_IDENT)) {
            LEGACY_MARKUP_RE.lastIndex = 0;
            pageIr.expressions[i] = pageIr.expressions[i].replace(LEGACY_MARKUP_RE, '__ZENITH_INTERNAL_ZENHTML');
        }
        if (
            bindings[i] &&
            typeof bindings[i] === 'object' &&
            typeof bindings[i].literal === 'string' &&
            bindings[i].literal.includes(LEGACY_MARKUP_IDENT)
        ) {
            LEGACY_MARKUP_RE.lastIndex = 0;
            bindings[i].literal = bindings[i].literal.replace(LEGACY_MARKUP_RE, '__ZENITH_INTERNAL_ZENHTML');
        }
        if (
            bindings[i] &&
            typeof bindings[i] === 'object' &&
            typeof bindings[i].compiled_expr === 'string' &&
            bindings[i].compiled_expr.includes(LEGACY_MARKUP_IDENT)
        ) {
            LEGACY_MARKUP_RE.lastIndex = 0;
            bindings[i].compiled_expr = bindings[i].compiled_expr.replace(LEGACY_MARKUP_RE, '__ZENITH_INTERNAL_ZENHTML');
        }
    }
}
