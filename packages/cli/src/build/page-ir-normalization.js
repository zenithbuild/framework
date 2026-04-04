import { resolveStateKeyFromBindings } from './expression-rewrites.js';
import { transpileTypeScriptToJs } from './hoisted-code-transforms.js';
import {
    expandScopedShorthandPropertiesInSource,
    normalizeTypeScriptExpression
} from './typescript-expression-utils.js';

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

export function normalizeExpressionPayload(pageIr) {
    if (!Array.isArray(pageIr?.expressions) || pageIr.expressions.length === 0) {
        return;
    }
    const bindings = Array.isArray(pageIr.expression_bindings) ? pageIr.expression_bindings : [];

    for (let index = 0; index < pageIr.expressions.length; index++) {
        if (typeof pageIr.expressions[index] === 'string') {
            pageIr.expressions[index] = normalizeTypeScriptExpression(pageIr.expressions[index]);
        }
        const binding = bindings[index];
        if (!binding || typeof binding !== 'object') {
            continue;
        }
        if (typeof binding.literal === 'string') {
            binding.literal = normalizeTypeScriptExpression(binding.literal);
        }
        if (typeof binding.compiled_expr === 'string') {
            binding.compiled_expr = normalizeTypeScriptExpression(binding.compiled_expr);
        }
    }
}

export function normalizeHoistedSourcePayload(
    pageIr,
    sourceFile = 'component.zen',
    transformCache = null,
    mergeMetrics = null
) {
    const declarations = Array.isArray(pageIr?.hoisted?.declarations) ? pageIr.hoisted.declarations : null;
    if (declarations) {
        pageIr.hoisted.declarations = declarations.map((entry) => {
            if (typeof entry !== 'string') {
                return entry;
            }
            return expandScopedShorthandPropertiesInSource(entry);
        });
    }

    const codeBlocks = Array.isArray(pageIr?.hoisted?.code) ? pageIr.hoisted.code : null;
    if (codeBlocks) {
        pageIr.hoisted.code = codeBlocks.map((entry, index) => {
            if (typeof entry !== 'string') {
                return entry;
            }
            const expanded = expandScopedShorthandPropertiesInSource(entry);
            return transpileTypeScriptToJs(
                expanded,
                `${sourceFile}#hoisted-${index}.ts`,
                transformCache,
                mergeMetrics,
                { target: 'esnext' }
            );
        });
    }

    const componentScripts = pageIr?.components_scripts && typeof pageIr.components_scripts === 'object'
        ? pageIr.components_scripts
        : null;
    if (componentScripts) {
        for (const [hoistId, script] of Object.entries(componentScripts)) {
            if (!script || typeof script !== 'object' || typeof script.code !== 'string') {
                continue;
            }
            const expanded = expandScopedShorthandPropertiesInSource(script.code);
            script.code = transpileTypeScriptToJs(
                expanded,
                `${sourceFile}#component-${hoistId}.ts`,
                transformCache,
                mergeMetrics,
                { target: 'esnext' }
            );
        }
    }

    const modules = Array.isArray(pageIr?.modules) ? pageIr.modules : null;
    if (modules) {
        pageIr.modules = modules.map((module, index) => {
            if (!module || typeof module !== 'object' || typeof module.source !== 'string') {
                return module;
            }
            const moduleId = typeof module.id === 'string' && module.id.length > 0
                ? module.id
                : `${sourceFile}#module-${index}.ts`;
            const expanded = expandScopedShorthandPropertiesInSource(module.source);
            return {
                ...module,
                source: transpileTypeScriptToJs(
                    expanded,
                    moduleId,
                    transformCache,
                    mergeMetrics,
                    { target: 'esnext' }
                )
            };
        });
    }
}

const LEGACY_MARKUP_IDENT = 'zen' + 'html';
const LEGACY_MARKUP_RE = new RegExp(`\\b${LEGACY_MARKUP_IDENT}\\b`, 'g');

export function rewriteLegacyMarkupIdentifiers(pageIr) {
    if (!Array.isArray(pageIr?.expressions) || pageIr.expressions.length === 0) {
        return;
    }
    const bindings = Array.isArray(pageIr.expression_bindings) ? pageIr.expression_bindings : [];

    function failLegacyMarkup(source) {
        throw new Error(
            `[Zenith:Build] Legacy ${LEGACY_MARKUP_IDENT}\`...\` markup syntax is unsupported. ` +
            'Use embedded markup expressions with embeddedMarkupExpressions: true, or unsafeHTML={value} for explicit raw HTML.'
        );
    }

    for (let i = 0; i < pageIr.expressions.length; i++) {
        if (typeof pageIr.expressions[i] === 'string' && pageIr.expressions[i].includes(LEGACY_MARKUP_IDENT)) {
            LEGACY_MARKUP_RE.lastIndex = 0;
            if (LEGACY_MARKUP_RE.test(pageIr.expressions[i])) {
                failLegacyMarkup(pageIr.expressions[i]);
            }
        }
        if (
            bindings[i] &&
            typeof bindings[i] === 'object' &&
            typeof bindings[i].literal === 'string' &&
            bindings[i].literal.includes(LEGACY_MARKUP_IDENT)
        ) {
            LEGACY_MARKUP_RE.lastIndex = 0;
            if (LEGACY_MARKUP_RE.test(bindings[i].literal)) {
                failLegacyMarkup(bindings[i].literal);
            }
        }
        if (
            bindings[i] &&
            typeof bindings[i] === 'object' &&
            typeof bindings[i].compiled_expr === 'string' &&
            bindings[i].compiled_expr.includes(LEGACY_MARKUP_IDENT)
        ) {
            LEGACY_MARKUP_RE.lastIndex = 0;
            if (LEGACY_MARKUP_RE.test(bindings[i].compiled_expr)) {
                failLegacyMarkup(bindings[i].compiled_expr);
            }
        }
    }
}
