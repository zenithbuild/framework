import { loadTypeScriptApi } from './compiler-runtime.js';
import { normalizeTypeScriptExpression } from './typescript-expression-utils.js';

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

function resolveCompilerSignalIndex(ts, node, localBindings) {
    if (!ts.isCallExpression(node)) {
        return null;
    }
    if (node.arguments.length !== 1) {
        return null;
    }
    const expression = node.expression;
    if (!ts.isPropertyAccessExpression(expression) || expression.name.text !== 'get') {
        return null;
    }
    if (!ts.isIdentifier(expression.expression) || expression.expression.text !== 'signalMap') {
        return null;
    }
    if (localBindings.has('signalMap')) {
        return null;
    }
    const [indexArg] = node.arguments;
    if (!ts.isNumericLiteral(indexArg)) {
        return null;
    }
    const signalIndex = Number.parseInt(indexArg.text, 10);
    return Number.isInteger(signalIndex) ? signalIndex : null;
}

export function rewriteCompilerSignalMapReferences(compiledExpr, buildReplacement) {
    const source = typeof compiledExpr === 'string' ? compiledExpr.trim() : '';
    if (!source) {
        return null;
    }
    if (!source.includes('signalMap.get(') || typeof buildReplacement !== 'function') {
        return normalizeTypeScriptExpression(source);
    }

    const ts = loadTypeScriptApi();
    if (!ts) {
        return normalizeTypeScriptExpression(source);
    }

    let sourceFile;
    try {
        sourceFile = ts.createSourceFile(
            'zenith-compiled-expression.ts',
            `const __zenith_expr__ = (${source});`,
            ts.ScriptTarget.Latest,
            true,
            ts.ScriptKind.TS
        );
    } catch {
        return normalizeTypeScriptExpression(source);
    }

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

    const transformer = (context) => {
        const visit = (node, localBindings) => {
            const scopeBindings = nextScopeBindings(node, localBindings);

            if (ts.isCallExpression(node) && node.arguments.length === 0) {
                const expression = node.expression;
                if (ts.isPropertyAccessExpression(expression) && expression.name.text === 'get') {
                    const signalIndex = resolveCompilerSignalIndex(ts, expression.expression, scopeBindings);
                    if (Number.isInteger(signalIndex)) {
                        const replacement = buildReplacement({ ts, signalIndex, valueRead: true });
                        if (replacement) {
                            return replacement;
                        }
                    }
                }
            }

            const signalIndex = resolveCompilerSignalIndex(ts, node, scopeBindings);
            if (Number.isInteger(signalIndex)) {
                const replacement = buildReplacement({ ts, signalIndex, valueRead: false });
                if (replacement) {
                    return replacement;
                }
            }

            return ts.visitEachChild(node, (child) => visit(child, scopeBindings), context);
        };

        return (node) => ts.visitNode(node, (child) => visit(child, new Set()));
    };

    const result = ts.transform(sourceFile, [transformer]);
    try {
        const printed = ts.createPrinter({ newLine: ts.NewLineKind.LineFeed })
            .printFile(result.transformed[0])
            .trimEnd();
        const prefix = 'const __zenith_expr__ = (';
        const suffix = ');';
        if (!printed.startsWith(prefix) || !printed.endsWith(suffix)) {
            return normalizeTypeScriptExpression(source);
        }
        return normalizeTypeScriptExpression(printed.slice(prefix.length, printed.length - suffix.length));
    } catch {
        return normalizeTypeScriptExpression(source);
    } finally {
        result.dispose();
    }
}
