import { loadTypeScriptApi } from './build/compiler-runtime.js';

function deepClone(value) {
    return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

const cloneMetadataCache = new WeakMap();

function escapeIdentifier(identifier) {
    return identifier.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function replaceIdentifierRefs(input, renamePlan) {
    let output = String(input || '');
    for (const entry of renamePlan) {
        output = output.replace(entry.pattern, entry.to);
    }
    return output;
}

function replaceIdentifierRefsInStatementSource(input, renameEntries, renamePlan) {
    const source = String(input || '');
    if (!source.trim()) {
        return source;
    }

    const ts = loadTypeScriptApi();
    if (!ts) {
        return replaceIdentifierRefs(source, renamePlan);
    }

    let sourceFile;
    try {
        sourceFile = ts.createSourceFile(
            'zenith-instance-clone.ts',
            source,
            ts.ScriptTarget.Latest,
            true,
            ts.ScriptKind.TS
        );
    } catch {
        return replaceIdentifierRefs(source, renamePlan);
    }

    const renameMap = new Map(renameEntries);
    const shouldRenameIdentifier = (node) => {
        const parent = node.parent;
        if (!parent) {
            return true;
        }
        if (ts.isPropertyAccessExpression(parent) && parent.name === node) {
            return false;
        }
        if (ts.isPropertyAssignment(parent) && parent.name === node) {
            return false;
        }
        if (ts.isShorthandPropertyAssignment(parent) && parent.name === node) {
            return false;
        }
        if (ts.isImportSpecifier(parent) || ts.isExportSpecifier(parent)) {
            return false;
        }
        return true;
    };

    const transformer = (context) => {
        const visit = (node) => {
            if (ts.isShorthandPropertyAssignment(node)) {
                const rewritten = renameMap.get(node.name.text);
                if (typeof rewritten === 'string' && rewritten.length > 0) {
                    return ts.factory.createPropertyAssignment(
                        ts.factory.createIdentifier(node.name.text),
                        ts.factory.createIdentifier(rewritten)
                    );
                }
            }
            if (ts.isIdentifier(node) && shouldRenameIdentifier(node)) {
                const rewritten = renameMap.get(node.text);
                if (typeof rewritten === 'string' && rewritten.length > 0 && rewritten !== node.text) {
                    return ts.factory.createIdentifier(rewritten);
                }
            }
            return ts.visitEachChild(node, visit, context);
        };
        return (node) => ts.visitNode(node, visit);
    };

    const result = ts.transform(sourceFile, [transformer]);
    try {
        return ts.createPrinter({ newLine: ts.NewLineKind.LineFeed })
            .printFile(result.transformed[0])
            .trimEnd();
    } catch {
        return replaceIdentifierRefs(source, renamePlan);
    } finally {
        result.dispose();
    }
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

function getCloneMetadata(compIr, extractDeclaredIdentifiers, resolveStateKeyFromBindings) {
    if (cloneMetadataCache.has(compIr)) {
        return cloneMetadataCache.get(compIr);
    }

    const baseState = Array.isArray(compIr?.hoisted?.state) ? compIr.hoisted.state : [];
    const baseRefs = Array.isArray(compIr?.ref_bindings) ? compIr.ref_bindings : [];
    const metadata = {
        renameTargets: collectRenameTargets(compIr, extractDeclaredIdentifiers),
        refIdentifierEntries: baseRefs.map((binding) => {
            const raw = typeof binding?.identifier === 'string' ? binding.identifier : null;
            const resolvedBase = raw ? resolveStateKeyFromBindings(raw, baseState) : null;
            return {
                raw,
                baseKey: resolvedBase || null
            };
        }).filter((entry) => typeof entry.raw === 'string' && typeof entry.baseKey === 'string')
    };

    cloneMetadataCache.set(compIr, metadata);
    return metadata;
}

function buildRefIdentifierMap(refIdentifierEntries, renameMap) {
    return refIdentifierEntries.map((entry) => {
        const rewritten = renameMap.get(entry.baseKey) || null;
        return {
            raw: entry.raw,
            rewritten: rewritten || null
        };
    }).filter((entry) => typeof entry.raw === 'string' && typeof entry.rewritten === 'string');
}

function addApplyMetric(applyMetrics, key, value) {
    if (!applyMetrics || typeof applyMetrics !== 'object' || !Number.isFinite(value)) {
        return;
    }
    applyMetrics[key] = (applyMetrics[key] || 0) + value;
}

function findNextExpressionIndex(expressions, raw, startIndex) {
    for (let index = startIndex; index < expressions.length; index++) {
        if (expressions[index] === raw) {
            return index;
        }
    }
    return -1;
}

function findNextRefIndex(refBindings, raw, startIndex) {
    for (let index = startIndex; index < refBindings.length; index++) {
        if (refBindings[index]?.identifier === raw) {
            return index;
        }
    }
    return -1;
}

export function cloneComponentIrForInstance(compIr, instanceId, extractDeclaredIdentifiers, resolveStateKeyFromBindings) {
    const suffix = `__inst${instanceId}`;
    const cloned = deepClone(compIr);
    const cloneMetadata = getCloneMetadata(compIr, extractDeclaredIdentifiers, resolveStateKeyFromBindings);
    const renameEntries = cloneMetadata.renameTargets.map((name) => [name, `${name}${suffix}`]);
    const renameMap = new Map(renameEntries);
    const renamePlan = renameEntries
        .sort((left, right) => right[0].length - left[0].length)
        .map(([from, to]) => ({
            from,
            pattern: new RegExp(`\\b${escapeIdentifier(from)}\\b`, 'g'),
            to
        }));

    if (Array.isArray(cloned?.expressions)) {
        cloned.expressions = cloned.expressions.map((expr) => replaceIdentifierRefs(expr, renamePlan));
    }

    if (Array.isArray(cloned?.expression_bindings)) {
        cloned.expression_bindings = cloned.expression_bindings.map((binding) => {
            if (!binding || typeof binding !== 'object') {
                return binding;
            }
            return {
                ...binding,
                literal: typeof binding.literal === 'string' ? replaceIdentifierRefs(binding.literal, renamePlan) : binding.literal,
                compiled_expr: typeof binding.compiled_expr === 'string'
                    ? replaceIdentifierRefs(binding.compiled_expr, renamePlan)
                    : binding.compiled_expr,
                component_instance: typeof binding.component_instance === 'string'
                    ? replaceIdentifierRefs(binding.component_instance, renamePlan)
                    : binding.component_instance,
                component_binding: typeof binding.component_binding === 'string'
                    ? replaceIdentifierRefs(binding.component_binding, renamePlan)
                    : binding.component_binding
            };
        });
    }

    if (cloned?.hoisted) {
        if (Array.isArray(cloned.hoisted.declarations)) {
            cloned.hoisted.declarations = cloned.hoisted.declarations.map((line) => replaceIdentifierRefsInStatementSource(line, renameEntries, renamePlan));
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
                const value = typeof entry.value === 'string' ? replaceIdentifierRefs(entry.value, renamePlan) : entry.value;
                return { ...entry, key, value };
            });
        }
        if (Array.isArray(cloned.hoisted.code)) {
            cloned.hoisted.code = cloned.hoisted.code.map((line) => replaceIdentifierRefsInStatementSource(line, renameEntries, renamePlan));
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

    const refIdentifierPairs = buildRefIdentifierMap(cloneMetadata.refIdentifierEntries, renameMap);
    return {
        ir: cloned,
        renameMap,
        refIdentifierPairs
    };
}

export function applyOccurrenceRewritePlans(pageIr, occurrencePlans, resolveBindingMetadata, applyMetrics = null) {
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
            const expressionLookupStartedAt = performance.now();
            const found = findNextExpressionIndex(expressions, item.raw, exprCursor);
            addApplyMetric(applyMetrics, 'expressionLookupMs', performance.now() - expressionLookupStartedAt);
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
                const bindingResolutionStartedAt = performance.now();
                const resolved = resolveBindingMetadata(plan.rewrite, item.binding);
                addApplyMetric(applyMetrics, 'bindingResolutionMs', performance.now() - bindingResolutionStartedAt);
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
            const refLookupStartedAt = performance.now();
            const found = findNextRefIndex(refBindings, refItem.raw, refCursor);
            addApplyMetric(applyMetrics, 'refLookupMs', performance.now() - refLookupStartedAt);
            if (found === -1) {
                continue;
            }
            refBindings[found].identifier = refItem.rewritten;
            refCursor = found + 1;
        }
    }
}
