import {
    extractDeclaredIdentifiers,
    normalizeTypeScriptExpression,
    renderObjectKey,
    rewriteIdentifiersWithinExpression
} from './typescript-expression-utils.js';

/**
 * @param {string} value
 * @returns {string | null}
 */
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
 * @param {Map<string, string>} map
 * @param {Set<string>} ambiguous
 * @param {string | null} raw
 * @param {string | null} rewritten
 */
function recordScopedIdentifierRewrite(map, ambiguous, raw, rewritten) {
    if (typeof raw !== 'string' || raw.length === 0 || typeof rewritten !== 'string' || rewritten.length === 0) {
        return;
    }
    const existing = map.get(raw);
    if (existing && existing !== rewritten) {
        map.delete(raw);
        ambiguous.add(raw);
        return;
    }
    if (!ambiguous.has(raw)) {
        map.set(raw, rewritten);
    }
}

/**
 * @param {object | null | undefined} ir
 * @returns {{ map: Map<string, string>, ambiguous: Set<string> }}
 */
export function buildScopedIdentifierRewrite(ir) {
    const out = { map: new Map(), ambiguous: new Set() };
    if (!ir || typeof ir !== 'object') {
        return out;
    }

    const stateBindings = Array.isArray(ir?.hoisted?.state) ? ir.hoisted.state : [];
    for (const stateEntry of stateBindings) {
        const key = typeof stateEntry?.key === 'string' ? stateEntry.key : null;
        recordScopedIdentifierRewrite(out.map, out.ambiguous, deriveScopedIdentifierAlias(key), key);
    }

    const functionBindings = Array.isArray(ir?.hoisted?.functions) ? ir.hoisted.functions : [];
    for (const fnName of functionBindings) {
        if (typeof fnName !== 'string') {
            continue;
        }
        recordScopedIdentifierRewrite(out.map, out.ambiguous, deriveScopedIdentifierAlias(fnName), fnName);
    }

    const declarations = Array.isArray(ir?.hoisted?.declarations) ? ir.hoisted.declarations : [];
    for (const declaration of declarations) {
        if (typeof declaration !== 'string') {
            continue;
        }
        for (const identifier of extractDeclaredIdentifiers(declaration)) {
            recordScopedIdentifierRewrite(out.map, out.ambiguous, deriveScopedIdentifierAlias(identifier), identifier);
        }
    }

    return out;
}

/**
 * @param {string} expr
 * @param {{
 *   expressionRewrite?: { map?: Map<string, string>, ambiguous?: Set<string> } | null,
 *   scopeRewrite?: { map?: Map<string, string>, ambiguous?: Set<string> } | null
 * } | null} rewriteContext
 * @returns {string}
 */
export function rewritePropsExpression(expr, rewriteContext = null) {
    const trimmed = String(expr || '').trim();
    if (!trimmed) {
        return trimmed;
    }

    const expressionMap = rewriteContext?.expressionRewrite?.map;
    const expressionAmbiguous = rewriteContext?.expressionRewrite?.ambiguous;
    if (
        expressionMap instanceof Map &&
        !(expressionAmbiguous instanceof Set && expressionAmbiguous.has(trimmed))
    ) {
        const exact = expressionMap.get(trimmed);
        if (typeof exact === 'string' && exact.length > 0) {
            return normalizeTypeScriptExpression(exact);
        }
    }

    const scopeMap = rewriteContext?.scopeRewrite?.map;
    const scopeAmbiguous = rewriteContext?.scopeRewrite?.ambiguous;
    const rootMatch = trimmed.match(/^([A-Za-z_$][A-Za-z0-9_$]*)([\s\S]*)$/);
    if (!(scopeMap instanceof Map)) {
        return normalizeTypeScriptExpression(trimmed);
    }
    if (!rootMatch) {
        return rewriteIdentifiersWithinExpression(trimmed, scopeMap, scopeAmbiguous);
    }

    const root = rootMatch[1];
    if (scopeAmbiguous instanceof Set && scopeAmbiguous.has(root)) {
        return rewriteIdentifiersWithinExpression(trimmed, scopeMap, scopeAmbiguous);
    }

    const rewrittenRoot = scopeMap.get(root);
    if (typeof rewrittenRoot !== 'string' || rewrittenRoot.length === 0 || rewrittenRoot === root) {
        return rewriteIdentifiersWithinExpression(trimmed, scopeMap, scopeAmbiguous);
    }

    if (rootMatch[2].trim().length === 0) {
        return normalizeTypeScriptExpression(rewrittenRoot);
    }

    const rewrittenExpr = rewriteIdentifiersWithinExpression(trimmed, scopeMap, scopeAmbiguous);
    return typeof rewrittenExpr === 'string' && rewrittenExpr.length > 0
        ? rewrittenExpr
        : normalizeTypeScriptExpression(`${rewrittenRoot}${rootMatch[2]}`);
}

/**
 * @param {string | null | undefined} compiledExpr
 * @param {{
 *   signals?: Array<{ state_index?: number }>,
 *   stateBindings?: Array<{ key?: string }>
 * } | null | undefined} expressionRewrite
 * @returns {string | null}
 */
export function resolveCompiledPropsExpression(compiledExpr, expressionRewrite = null) {
    const source = typeof compiledExpr === 'string' ? compiledExpr.trim() : '';
    if (!source) {
        return null;
    }

    const signals = Array.isArray(expressionRewrite?.signals) ? expressionRewrite.signals : [];
    const stateBindings = Array.isArray(expressionRewrite?.stateBindings) ? expressionRewrite.stateBindings : [];
    const resolved = source.replace(/signalMap\.get\((\d+)\)(?:\.get\(\))?/g, (full, rawIndex) => {
        const signalIndex = Number.parseInt(rawIndex, 10);
        if (!Number.isInteger(signalIndex)) {
            return full;
        }
        const signal = signals[signalIndex];
        const stateIndex = signal?.state_index;
        const stateKey = Number.isInteger(stateIndex) ? stateBindings[stateIndex]?.key : null;
        if (typeof stateKey !== 'string' || stateKey.length === 0) {
            return full;
        }
        return full.endsWith('.get()') ? `${stateKey}.get()` : stateKey;
    });

    return normalizeTypeScriptExpression(resolved);
}

/**
 * @param {string} expr
 * @param {{
 *   expressionRewrite?: {
 *     map?: Map<string, string>,
 *     bindings?: Map<string, { compiled_expr?: string | null }>,
 *     ambiguous?: Set<string>,
 *     signals?: Array<{ state_index?: number }>,
 *     stateBindings?: Array<{ key?: string }>
 *   } | null,
 *   scopeRewrite?: { map?: Map<string, string>, ambiguous?: Set<string> } | null
 * } | null} rewriteContext
 * @returns {string}
 */
export function resolvePropsValueCode(expr, rewriteContext = null) {
    const trimmed = String(expr || '').trim();
    if (!trimmed) {
        return trimmed;
    }

    const expressionRewrite = rewriteContext?.expressionRewrite;
    const expressionAmbiguous = expressionRewrite?.ambiguous;
    if (!(expressionAmbiguous instanceof Set && expressionAmbiguous.has(trimmed))) {
        const binding = expressionRewrite?.bindings instanceof Map
            ? expressionRewrite.bindings.get(trimmed)
            : null;
        const compiled = resolveCompiledPropsExpression(binding?.compiled_expr, expressionRewrite);
        if (typeof compiled === 'string' && compiled.length > 0) {
            return compiled;
        }

        const exact = expressionRewrite?.map instanceof Map
            ? expressionRewrite.map.get(trimmed)
            : null;
        if (typeof exact === 'string' && exact.length > 0) {
            return normalizeTypeScriptExpression(exact);
        }
    }

    return rewritePropsExpression(trimmed, rewriteContext);
}

/**
 * @param {string} attrs
 * @param {{
 *   expressionRewrite?: { map?: Map<string, string>, ambiguous?: Set<string> } | null,
 *   scopeRewrite?: { map?: Map<string, string>, ambiguous?: Set<string> } | null
 * } | null} rewriteContext
 * @returns {string}
 */
export function renderPropsLiteralFromAttrs(attrs, rewriteContext = null) {
    const src = String(attrs || '').trim();
    if (!src) {
        return '{}';
    }

    const entries = [];
    const attrRe = /([A-Za-z_$][A-Za-z0-9_$-]*)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|\{([\s\S]*?)\}))?/g;
    let match;
    while ((match = attrRe.exec(src)) !== null) {
        const rawName = match[1];
        if (!rawName || rawName.startsWith('on:')) {
            continue;
        }

        const doubleQuoted = match[2];
        const singleQuoted = match[3];
        const expressionValue = match[4];
        let valueCode = 'true';
        if (doubleQuoted !== undefined) {
            valueCode = JSON.stringify(doubleQuoted);
        } else if (singleQuoted !== undefined) {
            valueCode = JSON.stringify(singleQuoted);
        } else if (expressionValue !== undefined) {
            const trimmed = String(expressionValue).trim();
            valueCode = trimmed.length > 0 ? resolvePropsValueCode(trimmed, rewriteContext) : 'undefined';
        }

        entries.push(`${renderObjectKey(rawName)}: ${valueCode}`);
    }

    if (entries.length === 0) {
        return '{}';
    }
    return `{ ${entries.join(', ')} }`;
}

/**
 * @param {string} source
 * @param {string} attrs
 * @param {{
 *   expressionRewrite?: { map?: Map<string, string>, ambiguous?: Set<string> } | null,
 *   scopeRewrite?: { map?: Map<string, string>, ambiguous?: Set<string> } | null
 * } | null} rewriteContext
 * @returns {string}
 */
export function injectPropsPrelude(source, attrs, rewriteContext = null) {
    if (typeof source !== 'string' || source.trim().length === 0) {
        return source;
    }
    if (!/\bprops\b/.test(source)) {
        return source;
    }
    if (/\b(?:const|let|var)\s+props\b/.test(source)) {
        return source;
    }

    const propsLiteral = renderPropsLiteralFromAttrs(attrs, rewriteContext);
    return `var props = ${propsLiteral};\n${source}`;
}
