import {
    normalizeTypeScriptExpression,
    renderObjectKey
} from './typescript-expression-utils.js';
import { rewriteCompilerSignalMapReferences } from './compiler-signal-expression.js';

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
    return rewriteCompilerSignalMapReferences(source, ({ ts, signalIndex, valueRead }) => {
        const signal = signals[signalIndex];
        const stateIndex = signal?.state_index;
        const stateKey = Number.isInteger(stateIndex) ? stateBindings[stateIndex]?.key : null;
        if (typeof stateKey !== 'string' || stateKey.length === 0) {
            return null;
        }
        if (valueRead) {
            return ts.factory.createCallExpression(
                ts.factory.createPropertyAccessExpression(
                    ts.factory.createIdentifier(stateKey),
                    'get'
                ),
                undefined,
                []
            );
        }
        return ts.factory.createIdentifier(stateKey);
    });
}

/**
 * The only allowed downstream props rewrite boundary is compiler-owned exact lookup.
 * If the compiler did not emit a mapping for the attr expression, CLI keeps the
 * original expression text without attempting identifier reinterpretation.
 *
 * @param {string} expr
 * @param {{
 *   expressionRewrite?: {
 *     map?: Map<string, string>,
 *     bindings?: Map<string, { compiled_expr?: string | null }>,
 *     ambiguous?: Set<string>,
 *     signals?: Array<{ state_index?: number }>,
 *     stateBindings?: Array<{ key?: string }>
 *   } | null
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

    return normalizeTypeScriptExpression(trimmed);
}

/**
 * @param {string} attrs
 * @param {{
 *   expressionRewrite?: {
 *     map?: Map<string, string>,
 *     bindings?: Map<string, { compiled_expr?: string | null }>,
 *     ambiguous?: Set<string>,
 *     signals?: Array<{ state_index?: number }>,
 *     stateBindings?: Array<{ key?: string }>
 *   } | null
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
 *   expressionRewrite?: {
 *     map?: Map<string, string>,
 *     bindings?: Map<string, { compiled_expr?: string | null }>,
 *     ambiguous?: Set<string>,
 *     signals?: Array<{ state_index?: number }>,
 *     stateBindings?: Array<{ key?: string }>
 *   } | null
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
