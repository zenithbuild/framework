import { resolveStateKeyFromBindings } from './expression-rewrites.js';
import { transpileTypeScriptToJs } from './hoisted-code-transforms.js';
import {
    expandScopedShorthandPropertiesInSource,
    normalizeTypeScriptExpression
} from './typescript-expression-utils.js';
import { synthesizeAndResolveHelperModules } from './relative-helper-modules.js';

export function synthesizeRelativeTypeScriptHelperModules(
    pageIr,
    sourceFile,
    srcDir,
    transformCache = null,
    mergeMetrics = null
) {
    synthesizeAndResolveHelperModules(pageIr, sourceFile, srcDir, transformCache, mergeMetrics);
}

/**
 * Collapse multi-line static import/export-from statements to a single line.
 * This works around a vendor-bundler regex that cannot match specifiers across
 * newlines inside named import blocks. It is a whitespace-only transformation.
 *
 * @param {string} source
 * @returns {string}
 */
function collapseMultiLineImportStatements(source) {
    if (typeof source !== 'string' || source.indexOf('\n') === -1) {
        return source;
    }
    // Fast, linear pass: collapse only statements that start a line with import/export
    // and span more than one line, ending at the first line that contains a semicolon.
    // This avoids the catastrophic backtracking of a greedy regex across the whole source.
    const lines = source.split('\n');
    const out = [];
    let buffer = null;
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (buffer === null) {
            const trimmed = line.trimStart();
            if (/^(?:import|export)\b/.test(trimmed) && !trimmed.includes(';')) {
                buffer = [line];
            } else {
                out.push(line);
            }
        } else {
            buffer.push(line);
            if (line.includes(';')) {
                out.push(buffer.join(' ').replace(/\s+/g, ' '));
                buffer = null;
            }
        }
    }
    if (buffer !== null) {
        // Unterminated import/export: preserve original to avoid corruption.
        out.push(...buffer);
    }
    return out.join('\n');
}

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
        if (
            rewrittenBinding &&
            typeof bindings[index].scoped_data_key === 'string' &&
            bindings[index].scoped_data_key.length > 0 &&
            !(typeof rewrittenBinding.scoped_data_key === 'string' && rewrittenBinding.scoped_data_key.length > 0)
        ) {
            continue;
        }

        if (rewrittenBinding) {
            bindings[index].compiled_expr = rewrittenBinding.compiled_expr;
            bindings[index].signal_index = rewrittenBinding.signal_index;
            bindings[index].signal_indices = rewrittenBinding.signal_indices;
            bindings[index].state_index = rewrittenBinding.state_index;
            bindings[index].component_instance = rewrittenBinding.component_instance;
            bindings[index].component_binding = rewrittenBinding.component_binding;
            bindings[index].scoped_data_key = rewrittenBinding.scoped_data_key;
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

    const imports = Array.isArray(pageIr?.hoisted?.imports) ? pageIr.hoisted.imports : null;
    if (imports) {
        pageIr.hoisted.imports = imports.map((entry) =>
            typeof entry === 'string' ? collapseMultiLineImportStatements(entry) : entry
        );
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

    const irImports = Array.isArray(pageIr?.imports) ? pageIr.imports : null;
    if (irImports) {
        for (const imp of irImports) {
            if (imp && typeof imp === 'object' && typeof imp.spec === 'string') {
                imp.spec = collapseMultiLineImportStatements(imp.spec);
            }
        }
    }

    const componentScripts = pageIr?.components_scripts && typeof pageIr.components_scripts === 'object'
        ? pageIr.components_scripts
        : null;
    if (componentScripts) {
        for (const [hoistId, script] of Object.entries(componentScripts)) {
            if (!script || typeof script !== 'object' || typeof script.code !== 'string') {
                continue;
            }
            if (Array.isArray(script.imports)) {
                script.imports = script.imports.map((entry) =>
                    typeof entry === 'string' ? collapseMultiLineImportStatements(entry) : entry
                );
            }
            const expanded = expandScopedShorthandPropertiesInSource(collapseMultiLineImportStatements(script.code));
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
            const expanded = expandScopedShorthandPropertiesInSource(collapseMultiLineImportStatements(module.source));
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
