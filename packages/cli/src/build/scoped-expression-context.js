function escapeRegExp(value) {
    return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function scopedDataKey(scopedContext) {
    return typeof scopedContext?.scopedDataKey === 'string' && scopedContext.scopedDataKey.length > 0
        ? scopedContext.scopedDataKey
        : null;
}

function scopedDataExpressionForSource(expression, scopedContext) {
    const match = String(expression || '').trim().match(/^([A-Za-z_$][\w$]*)([\s\S]*)$/);
    if (!match) return null;
    const root = match[1];
    const rest = match[2] || '';
    if (root === 'data' || root === 'ssr') return `${root}${rest}`;
    for (const name of Array.isArray(scopedContext?.serializedVariableNames) ? scopedContext.serializedVariableNames : []) {
        if (
            typeof name === 'string' &&
            name.length > 0 &&
            (root === name || new RegExp(`(?:^|_)${escapeRegExp(name)}(?:__inst\\d+)?$`).test(root))
        ) {
            return `data.${name}${rest}`;
        }
    }
    return null;
}

function scopedExpressionCandidate(raw, rewritten, binding, scopedContext) {
    if (!scopedDataKey(scopedContext)) return null;
    for (const candidate of [rewritten, binding?.compiled_expr, binding?.literal, raw]) {
        const scopedExpression = scopedDataExpressionForSource(candidate, scopedContext);
        if (scopedExpression) return scopedExpression;
    }
    return null;
}

function createScopedBinding(scopedExpression, scopedContext, baseBinding = null) {
    return scopedExpression
        ? {
            ...(baseBinding && typeof baseBinding === 'object' ? baseBinding : {}),
            compiled_expr: scopedExpression,
            literal: scopedExpression,
            signal_index: null,
            signal_indices: [],
            state_index: null,
            component_instance: null,
            component_binding: null,
            scoped_data_key: scopedDataKey(scopedContext)
        }
        : null;
}

function applyScopedContextToBinding(binding, scopedContext, fallbackExpression = null) {
    if (!binding || typeof binding !== 'object' || !scopedDataKey(scopedContext)) return binding;
    const scopedExpression = scopedDataExpressionForSource(binding.compiled_expr, scopedContext)
        || scopedDataExpressionForSource(binding.literal, scopedContext)
        || scopedDataExpressionForSource(fallbackExpression, scopedContext);
    return scopedExpression ? createScopedBinding(scopedExpression, scopedContext, binding) : binding;
}

function hasScopedBinding(binding) {
    return typeof binding?.scoped_data_key === 'string' && binding.scoped_data_key.length > 0;
}

export function applyScopedDataContextToExpressionRewrite(componentRewrite, scopedContext) {
    if (!componentRewrite || !scopedDataKey(scopedContext)) return componentRewrite;
    const next = {
        map: new Map(),
        bindings: new Map(),
        signals: componentRewrite.signals,
        stateBindings: componentRewrite.stateBindings,
        ambiguous: new Set(componentRewrite.ambiguous),
        sequence: []
    };
    for (const item of Array.isArray(componentRewrite.sequence) ? componentRewrite.sequence : []) {
        const scopedBinding = applyScopedContextToBinding(item.binding, scopedContext, item.rewritten || item.raw);
        const scopedExpression = scopedExpressionCandidate(item.raw, item.rewritten, scopedBinding, scopedContext);
        next.sequence.push({
            raw: item.raw,
            rewritten: scopedExpression || item.rewritten,
            binding: hasScopedBinding(scopedBinding)
                ? scopedBinding
                : createScopedBinding(scopedExpression, scopedContext)
        });
    }
    for (const [raw, binding] of componentRewrite.bindings.entries()) {
        next.bindings.set(raw, applyScopedContextToBinding(binding, scopedContext, raw));
    }
    for (const [raw, rewritten] of componentRewrite.map.entries()) {
        const binding = next.bindings.get(raw);
        next.map.set(raw, scopedExpressionCandidate(raw, rewritten, binding, scopedContext) || rewritten);
    }
    return next;
}

function normalizeSourcePath(value) {
    return String(value || '').replaceAll('\\', '/');
}

function ownerKeyMatchesPath(ownerKey, filePath) {
    const key = normalizeSourcePath(ownerKey);
    const file = normalizeSourcePath(filePath);
    return key.length > 0 && (file === key || file.endsWith(`/${key}`));
}

export function resolveScopedExpressionContext(pageIr, compPath, occurrenceIndexByOwnerKey) {
    const entries = Array.isArray(pageIr?.scoped_server_data) ? pageIr.scoped_server_data : [];
    const matches = entries.filter((entry) =>
        entry &&
        typeof entry === 'object' &&
        (entry.ownerKind === 'layout' || entry.ownerKind === 'component') &&
        ownerKeyMatchesPath(entry.ownerKey, compPath)
    );
    const entry = matches.length === 1 ? matches[0] : null;
    if (!entry || typeof entry.ownerKey !== 'string') return null;
    let scopedDataKey = null;
    if (entry.ownerKind === 'layout') {
        scopedDataKey = `layout:${entry.ownerKey}`;
    } else if (entry.ownerKind === 'component' && entry.instanceStrategy === 'per-instance') {
        const index = occurrenceIndexByOwnerKey.get(entry.ownerKey) || 0;
        occurrenceIndexByOwnerKey.set(entry.ownerKey, index + 1);
        const instance = Array.isArray(entry.instances) ? entry.instances[index] : null;
        scopedDataKey = typeof instance?.key === 'string' && instance.key.length > 0
            ? instance.key
            : `component:${entry.ownerKey}:o${index}`;
    } else if (entry.ownerKind === 'component') {
        scopedDataKey = `component:${entry.ownerKey}`;
    }
    return scopedDataKey
        ? {
            scopedDataKey,
            serializedVariableNames: Array.isArray(entry.serializedVariableNames)
                ? entry.serializedVariableNames
                : []
        }
        : null;
}
