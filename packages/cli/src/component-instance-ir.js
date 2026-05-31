import { loadTypeScriptApi } from './build/compiler-runtime.js';

function deepClone(value) {
    return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

const cloneMetadataCache = new WeakMap();

function loadCloneTypeScriptApi() {
    const ts = loadTypeScriptApi();
    if (!ts) {
        throw new Error(
            '[Zenith:Build] Deterministic component instance cloning requires the TypeScript parser.'
        );
    }
    return ts;
}

function collectBindingNames(ts, name, target) {
    if (ts.isIdentifier(name)) {
        target.add(name.text);
        return;
    }
    if (ts.isObjectBindingPattern(name) || ts.isArrayBindingPattern(name)) {
        for (const element of name.elements) {
            if (ts.isBindingElement(element)) {
                collectBindingNames(ts, element.name, target);
            }
        }
    }
}

function collectDirectBlockBindings(ts, block, target) {
    const statements = Array.isArray(block?.statements) ? block.statements : [];
    for (const statement of statements) {
        if (ts.isVariableStatement(statement)) {
            for (const declaration of statement.declarationList.declarations) {
                collectBindingNames(ts, declaration.name, target);
            }
            continue;
        }
        if ((ts.isFunctionDeclaration(statement) || ts.isClassDeclaration(statement)) && statement.name) {
            target.add(statement.name.text);
        }
    }
}

function isNestedBlockScope(ts, node) {
    return (ts.isBlock(node) || ts.isModuleBlock(node)) && !ts.isSourceFile(node.parent);
}

function buildScopedIdentifierTransformer(ts, renameEntries, sourceLabel) {
    const renameMap = new Map(renameEntries);

    const shouldSkipIdentifier = (node, localBindings) => {
        if (localBindings.has(node.text)) {
            return true;
        }

        const parent = node.parent;
        if (!parent) {
            return false;
        }
        if (ts.isPropertyAccessExpression(parent) && parent.name === node) {
            return true;
        }
        if (ts.isPropertyAssignment(parent) && parent.name === node) {
            return true;
        }
        if (ts.isShorthandPropertyAssignment(parent) && parent.name === node) {
            return true;
        }
        if (ts.isImportSpecifier(parent) || ts.isExportSpecifier(parent)) {
            return true;
        }
        if (ts.isBindingElement(parent) && parent.propertyName === node) {
            return true;
        }
        if (ts.isLabeledStatement(parent) && parent.label === node) {
            return true;
        }
        if ((ts.isBreakStatement(parent) || ts.isContinueStatement(parent)) && parent.label === node) {
            return true;
        }
        return false;
    };

    const nextScopeBindings = (node, localBindings) => {
        if (ts.isSourceFile(node)) {
            return localBindings;
        }
        if (ts.isFunctionLike(node)) {
            const next = new Set(localBindings);
            if (node.name && ts.isIdentifier(node.name) && !ts.isSourceFile(node.parent)) {
                next.add(node.name.text);
            }
            for (const param of node.parameters) {
                collectBindingNames(ts, param.name, next);
            }
            return next;
        }
        if (isNestedBlockScope(ts, node)) {
            const next = new Set(localBindings);
            collectDirectBlockBindings(ts, node, next);
            return next;
        }
        if (ts.isCatchClause(node) && node.variableDeclaration) {
            const next = new Set(localBindings);
            collectBindingNames(ts, node.variableDeclaration.name, next);
            return next;
        }
        if ((ts.isForStatement(node) || ts.isForInStatement(node) || ts.isForOfStatement(node))
            && node.initializer
            && ts.isVariableDeclarationList(node.initializer)) {
            const next = new Set(localBindings);
            for (const declaration of node.initializer.declarations) {
                collectBindingNames(ts, declaration.name, next);
            }
            return next;
        }
        return localBindings;
    };

    return (context) => {
        const visit = (node, localBindings) => {
            const scopeBindings = nextScopeBindings(node, localBindings);

            if (ts.isShorthandPropertyAssignment(node)) {
                const rewritten = renameMap.get(node.name.text);
                if (
                    typeof rewritten === 'string' &&
                    rewritten.length > 0 &&
                    rewritten !== node.name.text &&
                    !scopeBindings.has(node.name.text)
                ) {
                    return ts.factory.createPropertyAssignment(
                        ts.factory.createIdentifier(node.name.text),
                        ts.factory.createIdentifier(rewritten)
                    );
                }
            }

            if (ts.isIdentifier(node) && !shouldSkipIdentifier(node, scopeBindings)) {
                const rewritten = renameMap.get(node.text);
                if (typeof rewritten === 'string' && rewritten.length > 0 && rewritten !== node.text) {
                    return ts.factory.createIdentifier(rewritten);
                }
            }

            return ts.visitEachChild(node, (child) => visit(child, scopeBindings), context);
        };

        return (node) => ts.visitNode(node, (child) => visit(child, new Set()));
    };
}

function rewriteSourceFileWithIdentifiers(sourceFile, renameEntries, sourceLabel) {
    const ts = loadCloneTypeScriptApi();
    const transformer = buildScopedIdentifierTransformer(ts, renameEntries, sourceLabel);
    const result = ts.transform(sourceFile, [transformer]);
    try {
        return ts.createPrinter({ newLine: ts.NewLineKind.LineFeed })
            .printFile(result.transformed[0])
            .trimEnd();
    } finally {
        result.dispose();
    }
}

function rewriteIdentifierRefsInExpressionSource(input, renameEntries, sourceLabel) {
    const source = String(input || '');
    if (!source.trim()) {
        return source;
    }

    const ts = loadCloneTypeScriptApi();
    let sourceFile;
    try {
        sourceFile = ts.createSourceFile(
            'zenith-instance-clone-expression.ts',
            `const __zenith_expr__ = (${source});`,
            ts.ScriptTarget.Latest,
            true,
            ts.ScriptKind.TS
        );
    } catch {
        throw new Error(
            `[Zenith:Build] Failed to parse component instance expression for deterministic rewriting in ${sourceLabel}.`
        );
    }

    const rewritten = rewriteSourceFileWithIdentifiers(sourceFile, renameEntries, sourceLabel);
    const parsed = ts.createSourceFile(
        'zenith-instance-clone-expression.js',
        rewritten,
        ts.ScriptTarget.Latest,
        true,
        ts.ScriptKind.JS
    );
    const statement = parsed.statements.find(ts.isVariableStatement);
    const declaration = statement?.declarationList?.declarations?.[0];
    const initializer = declaration?.initializer;
    if (!initializer) {
        throw new Error(
            `[Zenith:Build] Failed to extract rewritten component instance expression in ${sourceLabel}.`
        );
    }

    const root = ts.isParenthesizedExpression(initializer) ? initializer.expression : initializer;
    return ts.createPrinter({ newLine: ts.NewLineKind.LineFeed })
        .printNode(ts.EmitHint.Unspecified, root, parsed)
        .trim();
}

function rewriteIdentifierRefsInStatementSource(input, renameEntries, sourceLabel) {
    const source = String(input || '');
    if (!source.trim()) {
        return source;
    }

    const ts = loadCloneTypeScriptApi();
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
        throw new Error(
            `[Zenith:Build] Failed to parse component instance statement source for deterministic rewriting in ${sourceLabel}.`
        );
    };
    return rewriteSourceFileWithIdentifiers(sourceFile, renameEntries, sourceLabel);
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
    // The only permitted downstream clone rewrite is structural instance isolation of
    // component-local symbols. No string-based semantic reinterpretation is allowed.
    const suffix = `__inst${instanceId}`;
    const sourceLabel = `component instance ${instanceId}`;
    const cloned = deepClone(compIr);
    const cloneMetadata = getCloneMetadata(compIr, extractDeclaredIdentifiers, resolveStateKeyFromBindings);
    const renameEntries = cloneMetadata.renameTargets.map((name) => [name, `${name}${suffix}`]);
    const renameMap = new Map(renameEntries);

    if (Array.isArray(cloned?.expressions)) {
        cloned.expressions = cloned.expressions.map((expr) =>
            rewriteIdentifierRefsInExpressionSource(expr, renameEntries, sourceLabel)
        );
    }

    if (Array.isArray(cloned?.expression_bindings)) {
        cloned.expression_bindings = cloned.expression_bindings.map((binding) => {
            if (!binding || typeof binding !== 'object') {
                return binding;
            }
            return {
                ...binding,
                literal: typeof binding.literal === 'string'
                    ? rewriteIdentifierRefsInExpressionSource(binding.literal, renameEntries, sourceLabel)
                    : binding.literal,
                compiled_expr: typeof binding.compiled_expr === 'string'
                    ? rewriteIdentifierRefsInExpressionSource(binding.compiled_expr, renameEntries, sourceLabel)
                    : binding.compiled_expr,
                component_instance: typeof binding.component_instance === 'string'
                    ? rewriteIdentifierRefsInExpressionSource(binding.component_instance, renameEntries, sourceLabel)
                    : binding.component_instance,
                component_binding: typeof binding.component_binding === 'string'
                    ? rewriteIdentifierRefsInExpressionSource(binding.component_binding, renameEntries, sourceLabel)
                    : binding.component_binding
            };
        });
    }

    if (cloned?.hoisted) {
        if (Array.isArray(cloned.hoisted.declarations)) {
            cloned.hoisted.declarations = cloned.hoisted.declarations.map((line) =>
                rewriteIdentifierRefsInStatementSource(line, renameEntries, sourceLabel)
            );
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
                const value = typeof entry.value === 'string'
                    ? rewriteIdentifierRefsInExpressionSource(entry.value, renameEntries, sourceLabel)
                    : entry.value;
                return { ...entry, key, value };
            });
        }
        if (Array.isArray(cloned.hoisted.code)) {
            cloned.hoisted.code = cloned.hoisted.code.map((line) =>
                rewriteIdentifierRefsInStatementSource(line, renameEntries, sourceLabel)
            );
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
                    binding.scoped_data_key = resolved.scoped_data_key;
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
