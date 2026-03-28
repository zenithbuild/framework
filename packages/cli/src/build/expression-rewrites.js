import { performance } from 'node:perf_hooks';
import { rewriteCompilerSignalMapReferences } from './compiler-signal-expression.js';

/**
 * @param {object} compIr
 * @param {Record<string, number> | null} [rewriteMetrics]
 * @returns {{
 *   map: Map<string, string>,
 *   bindings: Map<string, {
 *     compiled_expr: string | null,
 *     signal_index: number | null,
 *     signal_indices: number[],
 *     state_index: number | null,
 *     component_instance: string | null,
 *     component_binding: string | null
 *   }>,
 *   signals: Array<{ id?: number, kind?: string, state_index?: number }>,
 *   stateBindings: Array<{ key?: string, value?: string }>,
 *   ambiguous: Set<string>,
 *   sequence: Array<{ raw: string, rewritten: string, binding: object | null }>
 * }}
 */
export function buildComponentExpressionRewrite(
    compIr,
    rewriteMetrics = null
) {
    // Downstream is only allowed to read compiler-owned raw->rewritten pairs here.
    // It must not synthesize new identifier meaning beyond this mapping.
    const out = {
        map: new Map(),
        bindings: new Map(),
        signals: Array.isArray(compIr?.signals) ? compIr.signals : [],
        stateBindings: Array.isArray(compIr?.hoisted?.state) ? compIr.hoisted.state : [],
        ambiguous: new Set(),
        sequence: []
    };
    const rewrittenExpressions = Array.isArray(compIr?.expressions) ? compIr.expressions : [];
    const rewrittenBindings = Array.isArray(compIr?.expression_bindings) ? compIr.expression_bindings : [];
    if (rewrittenExpressions.length === 0) {
        return out;
    }

    if (rewriteMetrics && typeof rewriteMetrics === 'object') {
        rewriteMetrics.calls += 1;
    }
    for (let i = 0; i < rewrittenExpressions.length; i++) {
        const rewritten = rewrittenExpressions[i];
        if (typeof rewritten !== 'string') {
            continue;
        }

        const binding = rewrittenBindings[i];
        // Compiler emits the raw source literal for exact lookup; CLI only transports it.
        const raw = typeof binding?.literal === 'string' && binding.literal.length > 0
            ? binding.literal
            : rewritten;
        const normalizedBinding = binding && typeof binding === 'object'
            ? {
                compiled_expr: typeof binding.compiled_expr === 'string' ? binding.compiled_expr : null,
                signal_index: Number.isInteger(binding.signal_index) ? binding.signal_index : null,
                signal_indices: Array.isArray(binding.signal_indices)
                    ? binding.signal_indices.filter((value) => Number.isInteger(value))
                    : [],
                state_index: Number.isInteger(binding.state_index) ? binding.state_index : null,
                component_instance: typeof binding.component_instance === 'string' ? binding.component_instance : null,
                component_binding: typeof binding.component_binding === 'string' ? binding.component_binding : null
            }
            : null;

        out.sequence.push({ raw, rewritten, binding: normalizedBinding });

        if (!out.ambiguous.has(raw) && normalizedBinding) {
            const existingBinding = out.bindings.get(raw);
            if (existingBinding) {
                if (JSON.stringify(existingBinding) !== JSON.stringify(normalizedBinding)) {
                    out.bindings.delete(raw);
                    out.map.delete(raw);
                    out.ambiguous.add(raw);
                    continue;
                }
            } else {
                out.bindings.set(raw, normalizedBinding);
            }
        }

        if (raw !== rewritten) {
            const existing = out.map.get(raw);
            if (existing && existing !== rewritten) {
                out.bindings.delete(raw);
                out.map.delete(raw);
                out.ambiguous.add(raw);
                continue;
            }
            if (!out.ambiguous.has(raw)) {
                out.map.set(raw, rewritten);
            }
        }
    }

    if (rewriteMetrics && typeof rewriteMetrics === 'object') {
        rewriteMetrics.compilerOwnedBindings += out.sequence.length;
        rewriteMetrics.ambiguousBindings += out.ambiguous.size;
    }

    return out;
}

/**
 * @param {string} compiledExpr
 * @param {Array<{ state_index?: number }>} componentSignals
 * @param {Array<{ key?: string }>} componentStateBindings
 * @param {Map<string, number>} pageSignalIndexByStateKey
 * @returns {string | null}
 */
export function remapCompiledExpressionSignals(
    compiledExpr,
    componentSignals,
    componentStateBindings,
    pageSignalIndexByStateKey
) {
    // This is a mechanical index remap across page merge boundaries, not a second compiler pass.
    if (typeof compiledExpr !== 'string' || compiledExpr.length === 0) {
        return null;
    }

    return rewriteCompilerSignalMapReferences(compiledExpr, ({ ts, signalIndex, valueRead }) => {
        const signal = componentSignals[signalIndex];
        if (!signal || !Number.isInteger(signal.state_index)) {
            return null;
        }
        const stateKey = componentStateBindings[signal.state_index]?.key;
        if (typeof stateKey !== 'string' || stateKey.length === 0) {
            return null;
        }
        const pageIndex = pageSignalIndexByStateKey.get(stateKey);
        if (!Number.isInteger(pageIndex)) {
            return null;
        }

        const signalMapRead = ts.factory.createCallExpression(
            ts.factory.createPropertyAccessExpression(
                ts.factory.createIdentifier('signalMap'),
                'get'
            ),
            undefined,
            [ts.factory.createNumericLiteral(String(pageIndex))]
        );
        if (valueRead) {
            return ts.factory.createCallExpression(
                ts.factory.createPropertyAccessExpression(signalMapRead, 'get'),
                undefined,
                []
            );
        }
        return signalMapRead;
    });
}

/**
 * @param {object} pageBindingContext
 * @param {object} componentRewrite
 * @param {object} binding
 * @param {Record<string, number> | null} [resolutionMetrics]
 * @returns {object | null}
 */
export function resolveRewrittenBindingMetadata(
    pageBindingContext,
    componentRewrite,
    binding,
    resolutionMetrics = null
) {
    if (!binding || typeof binding !== 'object') {
        return null;
    }

    let pageStateBindings;
    let pageSignals;
    let pageStateIndexByKey;
    let pageSignalIndexByStateKey;
    let pageSignalIndicesByStateIndex;
    if (
        pageBindingContext &&
        typeof pageBindingContext === 'object' &&
        pageBindingContext.stateIndexByKey instanceof Map &&
        pageBindingContext.signalIndexByStateKey instanceof Map
    ) {
        pageStateBindings = Array.isArray(pageBindingContext.stateEntries) ? pageBindingContext.stateEntries : [];
        pageSignals = Array.isArray(pageBindingContext.signals) ? pageBindingContext.signals : [];
        pageStateIndexByKey = pageBindingContext.stateIndexByKey;
        pageSignalIndexByStateKey = pageBindingContext.signalIndexByStateKey;
        pageSignalIndicesByStateIndex = pageBindingContext.signalIndicesByStateIndex instanceof Map
            ? pageBindingContext.signalIndicesByStateIndex
            : null;
    } else {
        const mapConstructionStartedAt = performance.now();
        pageStateBindings = Array.isArray(pageBindingContext?.hoisted?.state) ? pageBindingContext.hoisted.state : [];
        pageSignals = Array.isArray(pageBindingContext?.signals) ? pageBindingContext.signals : [];
        pageStateIndexByKey = new Map();
        pageSignalIndexByStateKey = new Map();
        pageSignalIndicesByStateIndex = new Map();

        for (let index = 0; index < pageStateBindings.length; index++) {
            const key = pageStateBindings[index]?.key;
            if (typeof key === 'string' && key.length > 0 && !pageStateIndexByKey.has(key)) {
                pageStateIndexByKey.set(key, index);
            }
        }

        for (let index = 0; index < pageSignals.length; index++) {
            const stateIndex = pageSignals[index]?.state_index;
            if (!Number.isInteger(stateIndex) || stateIndex < 0) {
                continue;
            }
            const stateKey = pageStateBindings[stateIndex]?.key;
            if (typeof stateKey === 'string' && stateKey.length > 0 && !pageSignalIndexByStateKey.has(stateKey)) {
                pageSignalIndexByStateKey.set(stateKey, index);
            }
            const existing = pageSignalIndicesByStateIndex.get(stateIndex);
            if (existing) {
                existing.push(index);
            } else {
                pageSignalIndicesByStateIndex.set(stateIndex, [index]);
            }
        }
        if (resolutionMetrics && typeof resolutionMetrics === 'object') {
            resolutionMetrics.pageMapConstructionMs = (resolutionMetrics.pageMapConstructionMs || 0)
                + (performance.now() - mapConstructionStartedAt);
        }
    }

    const componentSignals = Array.isArray(componentRewrite?.signals) ? componentRewrite.signals : [];
    const componentStateBindings = Array.isArray(componentRewrite?.stateBindings) ? componentRewrite.stateBindings : [];
    const next = {
        compiled_expr: typeof binding.compiled_expr === 'string' ? binding.compiled_expr : null,
        signal_index: null,
        signal_indices: [],
        state_index: null,
        component_instance: typeof binding.component_instance === 'string' ? binding.component_instance : null,
        component_binding: typeof binding.component_binding === 'string' ? binding.component_binding : null
    };

    if (typeof next.compiled_expr === 'string' && next.compiled_expr.includes('signalMap.get(')) {
        const remapStartedAt = performance.now();
        const remapped = remapCompiledExpressionSignals(
            next.compiled_expr,
            componentSignals,
            componentStateBindings,
            pageSignalIndexByStateKey
        );
        if (remapped && remapped !== next.compiled_expr) {
            next.compiled_expr = remapped;
        }
        if (resolutionMetrics && typeof resolutionMetrics === 'object') {
            resolutionMetrics.compiledSignalRemapMs = (resolutionMetrics.compiledSignalRemapMs || 0)
                + (performance.now() - remapStartedAt);
        }
    }

    const componentStateIndex = Number.isInteger(binding.state_index) ? binding.state_index : null;
    const componentStateKey = componentStateIndex !== null
        ? componentStateBindings[componentStateIndex]?.key
        : null;
    if (typeof componentStateKey === 'string' && componentStateKey.length > 0) {
        const lookupStartedAt = performance.now();
        const pageStateIndex = pageStateIndexByKey.get(componentStateKey);
        if (Number.isInteger(pageStateIndex)) {
            next.state_index = pageStateIndex;
            const pageSignalIndices = pageSignalIndicesByStateIndex?.get(pageStateIndex) || [];
            next.signal_indices = [...pageSignalIndices];
            if (pageSignalIndices.length === 1) {
                next.signal_index = pageSignalIndices[0];
            }
        }
        if (resolutionMetrics && typeof resolutionMetrics === 'object') {
            resolutionMetrics.fallbackSignalStateLookupMs = (resolutionMetrics.fallbackSignalStateLookupMs || 0)
                + (performance.now() - lookupStartedAt);
        }
    }

    if (!Number.isInteger(next.signal_index) && Array.isArray(binding.signal_indices)) {
        const remappedSignalIndices = [];
        for (const signalIndex of binding.signal_indices) {
            if (!Number.isInteger(signalIndex)) {
                continue;
            }
            const signal = componentSignals[signalIndex];
            if (!signal || !Number.isInteger(signal.state_index)) {
                continue;
            }
            const stateKey = componentStateBindings[signal.state_index]?.key;
            if (typeof stateKey !== 'string' || stateKey.length === 0) {
                continue;
            }
            const pageSignalIndex = pageSignalIndexByStateKey.get(stateKey);
            if (Number.isInteger(pageSignalIndex)) {
                remappedSignalIndices.push(pageSignalIndex);
            }
        }
        if (remappedSignalIndices.length > 0) {
            next.signal_indices = [...new Set(remappedSignalIndices)].sort((a, b) => a - b);
            if (next.signal_indices.length === 1) {
                next.signal_index = next.signal_indices[0];
            }
        }
    }

    return next;
}

/**
 * @param {Map<string, string>} pageMap
 * @param {Map<string, object>} pageBindingMap
 * @param {Set<string>} pageAmbiguous
 * @param {object} componentRewrite
 * @param {object} pageBindingContext
 * @param {Record<string, number> | null} [bindingResolutionMetrics]
 */
export function mergeExpressionRewriteMaps(
    pageMap,
    pageBindingMap,
    pageAmbiguous,
    componentRewrite,
    pageBindingContext,
    bindingResolutionMetrics = null
) {
    for (const raw of componentRewrite.ambiguous) {
        pageAmbiguous.add(raw);
        pageMap.delete(raw);
        pageBindingMap.delete(raw);
    }

    for (const [raw, binding] of componentRewrite.bindings.entries()) {
        if (pageAmbiguous.has(raw)) {
            continue;
        }
        const resolved = resolveRewrittenBindingMetadata(
            pageBindingContext,
            componentRewrite,
            binding,
            bindingResolutionMetrics
        );
        const existing = pageBindingMap.get(raw);
        if (existing && JSON.stringify(existing) !== JSON.stringify(resolved)) {
            const existingWeight = measureBindingSpecificity(existing, raw);
            const resolvedWeight = measureBindingSpecificity(resolved, raw);
            if (resolvedWeight > existingWeight && existingWeight === 0) {
                pageBindingMap.set(raw, resolved);
                continue;
            }
            if (existingWeight > resolvedWeight && resolvedWeight === 0) {
                continue;
            }
            pageAmbiguous.add(raw);
            pageMap.delete(raw);
            pageBindingMap.delete(raw);
            continue;
        }
        pageBindingMap.set(raw, resolved);
    }

    for (const [raw, rewritten] of componentRewrite.map.entries()) {
        if (pageAmbiguous.has(raw)) {
            continue;
        }
        const existing = pageMap.get(raw);
        if (existing && existing !== rewritten) {
            pageAmbiguous.add(raw);
            pageMap.delete(raw);
            pageBindingMap.delete(raw);
            continue;
        }
        pageMap.set(raw, rewritten);
    }
}

function measureBindingSpecificity(binding, raw) {
    if (!binding || typeof binding !== 'object') {
        return 0;
    }

    let score = 0;
    if (
        typeof binding.compiled_expr === 'string' &&
        binding.compiled_expr.length > 0 &&
        binding.compiled_expr !== raw
    ) {
        score += 4;
    }
    if (Number.isInteger(binding.signal_index)) {
        score += 2;
    }
    if (Array.isArray(binding.signal_indices) && binding.signal_indices.length > 0) {
        score += 2;
    }
    if (Number.isInteger(binding.state_index)) {
        score += 1;
    }
    if (typeof binding.component_instance === 'string' && binding.component_instance.length > 0) {
        score += 1;
    }
    if (typeof binding.component_binding === 'string' && binding.component_binding.length > 0) {
        score += 1;
    }
    return score;
}

/**
 * @param {string} identifier
 * @param {Array<{ key?: string }>} stateBindings
 * @param {Set<string> | null} [preferredKeys]
 * @returns {string | null}
 */
export function resolveStateKeyFromBindings(identifier, stateBindings, preferredKeys = null) {
    const ident = String(identifier || '').trim();
    if (!ident) {
        return null;
    }

    const exact = stateBindings.find((entry) => String(entry?.key || '') === ident);
    if (exact && typeof exact.key === 'string') {
        return exact.key;
    }

    const suffix = `_${ident}`;
    const matches = stateBindings
        .map((entry) => String(entry?.key || ''))
        .filter((key) => key.endsWith(suffix));

    if (preferredKeys instanceof Set && preferredKeys.size > 0) {
        const preferredMatches = matches.filter((key) => preferredKeys.has(key));
        if (preferredMatches.length === 1) {
            return preferredMatches[0];
        }
    }

    if (matches.length === 1) {
        return matches[0];
    }
    return null;
}
