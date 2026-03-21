import { loadTypeScriptApi } from './compiler-runtime.js';

/**
 * @param {string} key
 * @returns {string}
 */
export function renderObjectKey(key) {
    if (/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(key)) {
        return key;
    }
    return JSON.stringify(key);
}

function deriveScopedIdentifierAlias(value) {
    const ident = String(value || '').trim();
    if (!/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(ident)) {
        return null;
    }
    const parts = ident.split('_').filter(Boolean);
    const candidate = parts.length > 1 ? parts[parts.length - 1] : ident;
    return /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(candidate) ? candidate : ident;
}

/**
 * @param {string} source
 * @returns {string[]}
 */
export function extractDeclaredIdentifiers(source) {
    const text = String(source || '').trim();
    if (!text) {
        return [];
    }

    const ts = loadTypeScriptApi();
    if (ts) {
        const sourceFile = ts.createSourceFile('zenith-hoisted-declaration.ts', text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
        const identifiers = [];
        const collectBindingNames = (name) => {
            if (ts.isIdentifier(name)) {
                identifiers.push(name.text);
                return;
            }
            if (ts.isObjectBindingPattern(name) || ts.isArrayBindingPattern(name)) {
                for (const element of name.elements) {
                    if (ts.isBindingElement(element)) {
                        collectBindingNames(element.name);
                    }
                }
            }
        };

        for (const statement of sourceFile.statements) {
            if (!ts.isVariableStatement(statement)) {
                continue;
            }
            for (const declaration of statement.declarationList.declarations) {
                collectBindingNames(declaration.name);
            }
        }

        if (identifiers.length > 0) {
            return identifiers;
        }
    }

    const fallback = [];
    const match = text.match(/^\s*(?:const|let|var)\s+([\s\S]+?);?\s*$/);
    if (!match) {
        return fallback;
    }
    const declarationList = match[1];
    const identifierRe = /(?:^|,)\s*([A-Za-z_$][A-Za-z0-9_$]*)\s*(?::[^=,]+)?=/g;
    let found;
    while ((found = identifierRe.exec(declarationList)) !== null) {
        fallback.push(found[1]);
    }
    return fallback;
}

/**
 * @param {string} expr
 * @returns {string}
 */
export function normalizeTypeScriptExpression(expr) {
    const source = String(expr || '').trim();
    if (!source) {
        return source;
    }

    const ts = loadTypeScriptApi();
    if (!ts) {
        return source;
    }

    const wrapped = `const __zenith_expr__ = (${source});`;
    let transpiled;
    try {
        transpiled = ts.transpileModule(wrapped, {
            fileName: 'zenith-expression.ts',
            compilerOptions: {
                module: ts.ModuleKind.ESNext,
                target: ts.ScriptTarget.ESNext,
                newLine: ts.NewLineKind.LineFeed,
            },
            reportDiagnostics: false,
        }).outputText;
    } catch {
        return source;
    }

    let sourceFile;
    try {
        sourceFile = ts.createSourceFile(
            'zenith-expression.js',
            transpiled,
            ts.ScriptTarget.Latest,
            true,
            ts.ScriptKind.JS
        );
    } catch {
        return source;
    }

    for (const statement of sourceFile.statements) {
        if (!ts.isVariableStatement(statement)) {
            continue;
        }
        const declaration = statement.declarationList.declarations.find(
            (entry) => ts.isIdentifier(entry.name) && entry.name.text === '__zenith_expr__'
        );
        const initializer = declaration?.initializer;
        if (!initializer) {
            continue;
        }
        const root = ts.isParenthesizedExpression(initializer) ? initializer.expression : initializer;
        return ts.createPrinter({ newLine: ts.NewLineKind.LineFeed })
            .printNode(ts.EmitHint.Unspecified, root, sourceFile)
            .trim();
    }

    return source;
}

export function expandScopedShorthandPropertiesInSource(source) {
    const text = String(source || '');
    if (!text.trim()) {
        return text;
    }

    const ts = loadTypeScriptApi();
    if (!ts) {
        return text;
    }

    let sourceFile;
    try {
        sourceFile = ts.createSourceFile('zenith-shorthand-fix.ts', text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
    } catch {
        return text;
    }

    const transformer = (context) => {
        const visit = (node) => {
            if (ts.isShorthandPropertyAssignment(node)) {
                const alias = deriveScopedIdentifierAlias(node.name.text);
                if (typeof alias === 'string' && alias.length > 0 && alias !== node.name.text) {
                    return ts.factory.createPropertyAssignment(
                        ts.factory.createIdentifier(alias),
                        ts.factory.createIdentifier(node.name.text)
                    );
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
        return text;
    } finally {
        result.dispose();
    }
}

/**
 * @param {string} expr
 * @param {Map<string, string>} scopeMap
 * @param {Set<string> | null | undefined} scopeAmbiguous
 * @returns {string}
 */
export function rewriteIdentifiersWithinExpression(expr, scopeMap, scopeAmbiguous) {
    const ts = loadTypeScriptApi();
    if (!(scopeMap instanceof Map) || !ts) {
        return normalizeTypeScriptExpression(expr);
    }

    const wrapped = `const __zenith_expr__ = (${expr});`;
    let sourceFile;
    try {
        sourceFile = ts.createSourceFile('zenith-expression.ts', wrapped, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
    } catch {
        return expr;
    }

    const statement = sourceFile.statements[0];
    if (!statement || !ts.isVariableStatement(statement)) {
        return expr;
    }
    const initializer = statement.declarationList.declarations[0]?.initializer;
    const root = initializer && ts.isParenthesizedExpression(initializer) ? initializer.expression : initializer;
    if (!root) {
        return expr;
    }

    const replacements = [];
    const collectBoundNames = (name, target) => {
        if (ts.isIdentifier(name)) {
            target.add(name.text);
            return;
        }
        if (ts.isObjectBindingPattern(name) || ts.isArrayBindingPattern(name)) {
            for (const element of name.elements) {
                if (ts.isBindingElement(element)) {
                    collectBoundNames(element.name, target);
                }
            }
        }
    };
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
        if (ts.isShorthandPropertyAssignment(parent)) {
            return true;
        }
        if (ts.isBindingElement(parent) && parent.name === node) {
            return true;
        }
        if (ts.isParameter(parent) && parent.name === node) {
            return true;
        }
        return false;
    };
    const visit = (node, localBindings) => {
        let nextBindings = localBindings;
        if (ts.isArrowFunction(node) || ts.isFunctionExpression(node)) {
            nextBindings = new Set(localBindings);
            if (node.name && ts.isIdentifier(node.name)) {
                nextBindings.add(node.name.text);
            }
            for (const param of node.parameters) {
                collectBoundNames(param.name, nextBindings);
            }
        }

        if (ts.isIdentifier(node) && !shouldSkipIdentifier(node, nextBindings)) {
            const rewritten = scopeMap.get(node.text);
            if (
                typeof rewritten === 'string' &&
                rewritten.length > 0 &&
                rewritten !== node.text &&
                !(scopeAmbiguous instanceof Set && scopeAmbiguous.has(node.text))
            ) {
                replacements.push({
                    start: node.getStart(sourceFile),
                    end: node.getEnd(),
                    text: rewritten
                });
            }
        }

        ts.forEachChild(node, (child) => visit(child, nextBindings));
    };

    visit(root, new Set());
    if (replacements.length === 0) {
        return normalizeTypeScriptExpression(expr);
    }

    let rewritten = wrapped;
    for (const replacement of replacements.sort((a, b) => b.start - a.start)) {
        rewritten = `${rewritten.slice(0, replacement.start)}${replacement.text}${rewritten.slice(replacement.end)}`;
    }

    const prefix = 'const __zenith_expr__ = (';
    const suffix = ');';
    if (!rewritten.startsWith(prefix) || !rewritten.endsWith(suffix)) {
        return normalizeTypeScriptExpression(expr);
    }
    return normalizeTypeScriptExpression(rewritten.slice(prefix.length, rewritten.length - suffix.length));
}
