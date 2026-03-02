function deepClone(value) {
    return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function escapeIdentifier(identifier) {
    return identifier.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function replaceIdentifierRefs(input, renameMap) {
    let output = String(input || '');
    const entries = [...renameMap.entries()].sort((a, b) => b[0].length - a[0].length);
    for (const [from, to] of entries) {
        const pattern = new RegExp(`\\b${escapeIdentifier(from)}\\b`, 'g');
        output = output.replace(pattern, to);
    }
    return output;
}

function collectRenameTargets(compIr, extractDeclaredIdentifiers) {
    const targets = new Set();

    const stateBindings = Array.isArray(compIr?.hoisted?.state) ? compIr.hoisted.state : [];
    for (const entry of stateBindings) {
        if (typeof entry?.key === 'string' && entry.key.length > 0) {
            targets.add(entry.key);
        }
    }

    const functions = Array.isArray(compIr?.hoisted?.functions) ? compIr.hoisted.functions : [];
    for (const fnName of functions) {
        if (typeof fnName === 'string' && fnName.length > 0) {
            targets.add(fnName);
        }
    }

    const signals = Array.isArray(compIr?.hoisted?.signals) ? compIr.hoisted.signals : [];
    for (const signalName of signals) {
        if (typeof signalName === 'string' && signalName.length > 0) {
            targets.add(signalName);
        }
    }

    const declarations = Array.isArray(compIr?.hoisted?.declarations) ? compIr.hoisted.declarations : [];
    for (const declaration of declarations) {
        if (typeof declaration !== 'string') {
            continue;
        }
        for (const identifier of extractDeclaredIdentifiers(declaration)) {
            targets.add(identifier);
        }
    }

    return [...targets];
}

function buildRefIdentifierMap(baseIr, renameMap, resolveStateKeyFromBindings) {
    const baseState = Array.isArray(baseIr?.hoisted?.state) ? baseIr.hoisted.state : [];
    const baseRefs = Array.isArray(baseIr?.ref_bindings) ? baseIr.ref_bindings : [];

    return baseRefs.map((binding) => {
        const raw = typeof binding?.identifier === 'string' ? binding.identifier : null;
        const resolvedBase = raw ? resolveStateKeyFromBindings(raw, baseState) : null;
        const rewritten = resolvedBase ? (renameMap.get(resolvedBase) || null) : null;
        return {
            raw,
            rewritten: rewritten || null
        };
    }).filter((entry) => typeof entry.raw === 'string' && typeof entry.rewritten === 'string');
}

export function cloneComponentIrForInstance(compIr, instanceId, extractDeclaredIdentifiers, resolveStateKeyFromBindings) {
    const suffix = `__inst${instanceId}`;
    const cloned = deepClone(compIr);
    const renameTargets = collectRenameTargets(compIr, extractDeclaredIdentifiers);
    const renameMap = new Map(renameTargets.map((name) => [name, `${name}${suffix}`]));

    if (Array.isArray(cloned?.expressions)) {
        cloned.expressions = cloned.expressions.map((expr) => replaceIdentifierRefs(expr, renameMap));
    }

    if (Array.isArray(cloned?.expression_bindings)) {
        cloned.expression_bindings = cloned.expression_bindings.map((binding) => {
            if (!binding || typeof binding !== 'object') {
                return binding;
            }
            return {
                ...binding,
                literal: typeof binding.literal === 'string' ? replaceIdentifierRefs(binding.literal, renameMap) : binding.literal,
                compiled_expr: typeof binding.compiled_expr === 'string'
                    ? replaceIdentifierRefs(binding.compiled_expr, renameMap)
                    : binding.compiled_expr,
                component_instance: typeof binding.component_instance === 'string'
                    ? replaceIdentifierRefs(binding.component_instance, renameMap)
                    : binding.component_instance,
                component_binding: typeof binding.component_binding === 'string'
                    ? replaceIdentifierRefs(binding.component_binding, renameMap)
                    : binding.component_binding
            };
        });
    }

    if (cloned?.hoisted) {
        if (Array.isArray(cloned.hoisted.declarations)) {
            cloned.hoisted.declarations = cloned.hoisted.declarations.map((line) => replaceIdentifierRefs(line, renameMap));
        }
        if (Array.isArray(cloned.hoisted.functions)) {
            cloned.hoisted.functions = cloned.hoisted.functions.map((name) => renameMap.get(name) || name);
        }
        if (Array.isArray(cloned.hoisted.signals)) {
            cloned.hoisted.signals = cloned.hoisted.signals.map((name) => renameMap.get(name) || name);
        }
        if (Array.isArray(cloned.hoisted.state)) {
            cloned.hoisted.state = cloned.hoisted.state.map((entry) => {
                if (!entry || typeof entry !== 'object') {
                    return entry;
                }
                const key = typeof entry.key === 'string' ? (renameMap.get(entry.key) || entry.key) : entry.key;
                const value = typeof entry.value === 'string' ? replaceIdentifierRefs(entry.value, renameMap) : entry.value;
                return { ...entry, key, value };
            });
        }
        if (Array.isArray(cloned.hoisted.code)) {
            cloned.hoisted.code = cloned.hoisted.code.map((line) => replaceIdentifierRefs(line, renameMap));
        }
    }

    if (Array.isArray(cloned?.ref_bindings)) {
        const clonedState = Array.isArray(cloned?.hoisted?.state) ? cloned.hoisted.state : [];
        cloned.ref_bindings = cloned.ref_bindings.map((binding) => {
            if (!binding || typeof binding !== 'object' || typeof binding.identifier !== 'string') {
                return binding;
            }
            const resolved = resolveStateKeyFromBindings(binding.identifier, clonedState);
            return {
                ...binding,
                identifier: resolved || binding.identifier
            };
        });
    }

    const refIdentifierPairs = buildRefIdentifierMap(compIr, renameMap, resolveStateKeyFromBindings);
    return {
        ir: cloned,
        renameMap,
        refIdentifierPairs
    };
}

export function applyOccurrenceRewritePlans(pageIr, occurrencePlans, resolveBindingMetadata) {
    const expressions = Array.isArray(pageIr?.expressions) ? pageIr.expressions : [];
    const bindings = Array.isArray(pageIr?.expression_bindings) ? pageIr.expression_bindings : [];
    const refBindings = Array.isArray(pageIr?.ref_bindings) ? pageIr.ref_bindings : [];

    let exprCursor = 0;
    let refCursor = 0;

    for (const plan of occurrencePlans) {
        const sequence = Array.isArray(plan?.expressionSequence) ? plan.expressionSequence : [];
        for (const item of sequence) {
            if (typeof item?.raw !== 'string') {
                continue;
            }
            let found = -1;
            for (let index = exprCursor; index < expressions.length; index++) {
                if (expressions[index] === item.raw) {
                    found = index;
                    break;
                }
            }
            if (found === -1) {
                continue;
            }
            const rewritten = typeof item.rewritten === 'string' && item.rewritten.length > 0
                ? item.rewritten
                : item.raw;
            expressions[found] = rewritten;
            const binding = bindings[found];
            if (binding && typeof binding === 'object') {
                if (binding.literal === item.raw) {
                    binding.literal = rewritten;
                }
                if (binding.compiled_expr === item.raw) {
                    binding.compiled_expr = rewritten;
                }
                const resolved = resolveBindingMetadata(plan.rewrite, item.binding);
                if (resolved) {
                    binding.compiled_expr = resolved.compiled_expr;
                    binding.signal_index = resolved.signal_index;
                    binding.signal_indices = resolved.signal_indices;
                    binding.state_index = resolved.state_index;
                    binding.component_instance = resolved.component_instance;
                    binding.component_binding = resolved.component_binding;
                }
            }
            exprCursor = found + 1;
        }

        const refSequence = Array.isArray(plan?.refSequence) ? plan.refSequence : [];
        for (const refItem of refSequence) {
            if (typeof refItem?.raw !== 'string' || typeof refItem?.rewritten !== 'string') {
                continue;
            }
            let found = -1;
            for (let index = refCursor; index < refBindings.length; index++) {
                if (refBindings[index]?.identifier === refItem.raw) {
                    found = index;
                    break;
                }
            }
            if (found === -1) {
                continue;
            }
            refBindings[found].identifier = refItem.rewritten;
            refCursor = found + 1;
        }
    }
}
